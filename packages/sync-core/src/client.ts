import { z } from 'zod';
import type { DiagramDocument } from '@diagramai/diagram-core';
import { CreatedProjectSchema, DeviceLabelSchema, JoinedProjectSchema, PushReceiptSchema, SnapshotSchema, snapshotHash, type PushSnapshot } from './protocol';

export class SyncApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfterMs = 0) { super(code); }
}
const CodeSchema = z.object({ code: z.string().regex(/^[A-HJ-NP-Z2-9]{10}$/), expiresAt: z.iso.datetime() }).strict();
const projectKey = (value: string) => z.uuid().parse(value).toLowerCase();
export class SyncClient {
  private base: URL;
  constructor(baseUrl: string, private transport: typeof fetch = (input, options) => globalThis.fetch(input, options)) {
    this.base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (this.base.username || this.base.password || this.base.search || this.base.hash || this.base.pathname !== '/' || !(this.base.protocol === 'https:' || this.base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(this.base.hostname))) throw new Error('Sync API must be a trusted HTTPS origin, without secrets or query parameters.');
  }
  private async request(path: string, method: string, token?: string, body?: unknown) {
    let response: Response;
    try {
      response = await this.transport(new URL(path, this.base), {
        method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000),
      });
    } catch { throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); }
    if (response.status === 204) return null;
    const reader = response.body?.getReader(); if (!reader) throw new SyncApiError(502, 'INVALID_RESPONSE');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > 2 * 1024 * 1024 + 8192) { await reader.cancel(); throw new SyncApiError(502, 'INVALID_RESPONSE'); }
        chunks.push(next.value);
      }
    } catch (error) { if (error instanceof SyncApiError) throw error; throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let result: unknown;
    try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new SyncApiError(502, 'INVALID_RESPONSE'); }
    if (!response.ok) {
      const code = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string' && /^[A-Z_]{1,64}$/.test(result.error) ? result.error : 'REQUEST_FAILED';
      const retrySeconds = Number(response.headers.get('Retry-After'));
      throw new SyncApiError(response.status, code, Number.isFinite(retrySeconds) ? Math.min(120000, Math.max(0, retrySeconds * 1000)) : 0);
    }
    return result;
  }
  async create(document: DiagramDocument, operationId: string, deviceLabel: string) {
    const result = CreatedProjectSchema.parse(await this.request('v1/projects', 'POST', undefined, { document, operationId, deviceLabel: DeviceLabelSchema.parse(deviceLabel), hash: await snapshotHash(document) }));
    await this.verify(result.snapshot, result.credentials.projectId);
    return result;
  }
  async join(code: string, deviceLabel: string) {
    const result = JoinedProjectSchema.parse(await this.request('v1/pairing/redeem', 'POST', undefined, { code, deviceLabel: DeviceLabelSchema.parse(deviceLabel) }));
    await this.verify(result.snapshot, result.credentials.projectId); return result;
  }
  async recover(projectId: string, recoveryKey: string, deviceLabel: string, revokeOtherDevices = false) {
    const id = projectKey(projectId), result = JoinedProjectSchema.parse(await this.request(`v1/projects/${id}/recover`, 'POST', undefined, { recoveryKey, deviceLabel: DeviceLabelSchema.parse(deviceLabel), revokeOtherDevices }));
    await this.verify(result.snapshot, id); if (result.credentials.projectId !== id) throw new SyncApiError(502, 'PROJECT_MISMATCH'); return result;
  }
  private async verify(snapshot: z.infer<typeof SnapshotSchema>, projectId: string) {
    if (snapshot.projectId !== projectId) throw new SyncApiError(502, 'PROJECT_MISMATCH');
    if (await snapshotHash(snapshot.document) !== snapshot.hash) throw new SyncApiError(502, 'HASH_MISMATCH');
  }
  async pull(projectId: string, token: string, afterRevision: number) {
    const id = projectKey(projectId), raw = await this.request(`v1/projects/${id}/snapshot?afterRevision=${z.number().int().nonnegative().parse(afterRevision)}`, 'GET', token);
    if (raw === null) return null;
    const result = SnapshotSchema.parse(raw); await this.verify(result, id); return result;
  }
  async push(projectId: string, token: string, pending: PushSnapshot) {
    const result = PushReceiptSchema.parse(await this.request(`v1/projects/${projectKey(projectId)}/snapshot`, 'PUT', token, pending));
    if (result.hash !== pending.hash || result.acceptedRevision !== pending.baseRevision + 1) throw new SyncApiError(502, 'RECEIPT_MISMATCH');
    return result;
  }
  async pairing(projectId: string, token: string) { return CodeSchema.parse(await this.request(`v1/projects/${projectKey(projectId)}/pairing-codes`, 'POST', token)); }
  async devices(projectId: string, token: string) {
    return z.object({ devices: z.array(z.object({ id: z.uuid(), deviceLabel: DeviceLabelSchema, scope: z.enum(['owner', 'editor']), createdAt: z.iso.datetime(), revokedAt: z.iso.datetime().nullable() }).strict()).max(100) }).strict().parse(await this.request(`v1/projects/${projectKey(projectId)}/devices`, 'GET', token)).devices;
  }
  async revoke(projectId: string, token: string, deviceId: string) { await this.request(`v1/projects/${projectKey(projectId)}/devices/${z.uuid().parse(deviceId).toLowerCase()}`, 'DELETE', token); }
  async deleteProject(projectId: string, token: string) { await this.request(`v1/projects/${projectKey(projectId)}`, 'DELETE', token); }
}

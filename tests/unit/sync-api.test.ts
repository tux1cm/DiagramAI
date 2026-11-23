import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDocument } from '@diagramai/diagram-core';
import { snapshotHash, SyncApiError, SyncClient } from '@diagramai/sync-core';
import { createSyncHandler } from '../../apps/api/src/sync-handler';
import { SyncFault } from '../../apps/api/src/sync-service';

const projectId = randomUUID(), deviceId = randomUUID(), fakeToken = `dai_device_v1_${'a'.repeat(43)}`, fakeRecovery = `dai_recovery_v1_${'b'.repeat(43)}`;
const document = createDocument('Tiếng Việt cloud'), origin = 'https://tux1cm.github.io';
async function fixture() {
  const snapshot = { projectId, document, hash: await snapshotHash(document), revision: 1, updatedAt: new Date().toISOString() };
  const joined = { credentials: { projectId, deviceId, token: fakeToken, scope: 'owner' as const }, snapshot };
  const service = {
    rate: vi.fn(async () => {}), create: vi.fn(async () => ({ ...joined, recoveryKey: fakeRecovery })), pull: vi.fn(async () => snapshot),
    push: vi.fn(async () => ({ acceptedRevision: 2, hash: snapshot.hash })), pair: vi.fn(async () => ({ code: 'ABCD234567', expiresAt: new Date().toISOString() })),
    redeem: vi.fn(async () => joined), recover: vi.fn(async () => joined), devices: vi.fn(async () => []), revoke: vi.fn(async () => {}), revisions: vi.fn(async () => []), deleteProject: vi.fn(async () => {}),
  };
  return { snapshot, service, handler: createSyncHandler({ service, allowedOrigins: [origin], enabled: true }) };
}
const request = (path: string, options: RequestInit = {}) => new Request(`https://api.example${path}`, { ...options, headers: { Origin: origin, ...options.headers } });

describe('P5 guarded HTTP boundary', () => {
  it('stays disabled without explicit configuration and never claims a sync success', async () => {
    const handler = createSyncHandler({ allowedOrigins: [origin], enabled: true });
    expect(await (await handler(request('/v1/sync/status'))).json()).toEqual({ enabled: false, protocolVersion: 1 });
    expect((await handler(request('/v1/projects', { method: 'POST' }))).status).toBe(503);
  });
  it('auth is independent of CORS; supports Authorization preflight and rejects null/untrusted origins', async () => {
    const { handler, service } = await fixture();
    const options = await handler(request('/v1/projects', { method: 'OPTIONS' }));
    expect(options.status).toBe(204); expect(options.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(options.headers.has('Access-Control-Allow-Credentials')).toBe(false);
    for (const Origin of ['null', 'https://untrusted.invalid', `${origin}/path`]) expect((await handler(request('/v1/projects', { headers: { Origin } }))).status).toBe(403);
    expect((await handler(request(`/v1/projects/${projectId}/snapshot`))).status).toBe(401);
    expect(service.pull).not.toHaveBeenCalled();
    expect((await handler(new Request(`https://api.example/v1/projects/${projectId}/snapshot`, { headers: { Authorization: `Bearer ${fakeToken}` } }))).status).toBe(200);
  });
  it('body streaming enforces size even without Content-Length and rejects invalid UTF-8/JSON', async () => {
    const { handler, service } = await fixture();
    const oversized = await handler(request('/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 4097) }));
    expect(oversized.status).toBe(413); expect(service.create).not.toHaveBeenCalled();
    expect((await handler(request('/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }))).status).toBe(400);
    expect((await handler(request('/v1/projects', { method: 'POST', body: '{}' }))).status).toBe(415);
  });
  it('does not leak SQL exceptions or accept credentials in URL query', async () => {
    const { handler, service } = await fixture();
    expect((await handler(request(`/v1/projects/${projectId}/snapshot?token=${fakeToken}`, { headers: { Authorization: `Bearer ${fakeToken}` } }))).status).toBe(400);
    service.pull.mockRejectedValueOnce(new Error('private SQL detail password=do-not-expose'));
    const response = await handler(request(`/v1/projects/${projectId}/snapshot`, { headers: { Authorization: `Bearer ${fakeToken}` } }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'SYNC_UNAVAILABLE' }); expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rate rejection stops business work and returns bounded retry guidance', async () => {
    const { handler, service } = await fixture(); service.rate.mockRejectedValueOnce(new SyncFault(429, 'RATE_LIMITED'));
    const response = await handler(request('/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('60'); expect(service.create).not.toHaveBeenCalled();
  });
});

describe('P5 client transport', () => {
  it('preserves the browser global fetch receiver instead of invoking it as a client method', async () => {
    const { snapshot } = await fixture();
    vi.stubGlobal('fetch', function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(Response.json(snapshot));
    });
    try { expect((await new SyncClient('https://api.example').pull(projectId, fakeToken, 0))?.revision).toBe(1); }
    finally { vi.unstubAllGlobals(); }
  });
  it('uses bearer only in headers and forbids redirects/cache/cookies', async () => {
    const { handler } = await fixture();
    const transport = vi.fn<typeof fetch>(async (url, options) => handler(new Request(url, options)));
    const client = new SyncClient('https://api.example', transport);
    expect(await client.pull(projectId, fakeToken, 0)).toMatchObject({ document, revision: 1 });
    const [url, options] = transport.mock.calls[0];
    expect(String(url)).not.toContain(fakeToken); expect(options).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Authorization: `Bearer ${fakeToken}` } });
    expect(await client.pull(projectId, fakeToken, 1)).toBeNull();
  });
  it('checks snapshot hash/project and never acknowledges a mismatched receipt', async () => {
    const { snapshot } = await fixture();
    const transport = vi.fn<typeof fetch>(async () => Response.json({ ...snapshot, hash: '0'.repeat(64) }));
    const client = new SyncClient('https://api.example', transport);
    await expect(client.pull(projectId, fakeToken, 0)).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
    transport.mockResolvedValueOnce(Response.json({ acceptedRevision: 2, hash: '0'.repeat(64) }));
    await expect(client.push(projectId, fakeToken, { document, baseRevision: 1, operationId: randomUUID(), hash: snapshot.hash })).rejects.toMatchObject({ code: 'RECEIPT_MISMATCH' });
  });
  it('rejects insecure/credential-bearing API URLs and bounds errors/network retry', async () => {
    for (const url of ['http://outside.example', 'https://user:password@api.example', 'https://api.example/?token=secret', 'https://api.example/path']) expect(() => new SyncClient(url)).toThrow();
    const transport = vi.fn<typeof fetch>(async () => Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '99999' } }));
    const client = new SyncClient('https://api.example', transport);
    await expect(client.pull(projectId, fakeToken, 0)).rejects.toMatchObject({ status: 429, retryAfterMs: 120000 });
    transport.mockRejectedValueOnce(new Error('sensitive networking detail'));
    await expect(client.pull(projectId, fakeToken, 0)).rejects.toEqual(new SyncApiError(0, 'NETWORK_UNAVAILABLE'));
  });
});

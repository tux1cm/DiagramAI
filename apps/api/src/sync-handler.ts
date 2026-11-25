import { z } from 'zod';
import { MAX_SYNC_BYTES } from '@diagramai/sync-core';
import { SyncFault, type SyncService } from './sync-service';

type Service = Pick<SyncService, 'rate' | 'create' | 'pull' | 'push' | 'pair' | 'redeem' | 'devices' | 'revoke' | 'recover' | 'revisions' | 'deleteProject'>;
type WorkspaceService = Pick<SyncService, 'workspaceCreate' | 'workspaceCatalog' | 'workspaceFolder' | 'workspaceDrawingCreate' | 'workspaceDrawingAccess' | 'workspaceAdopt' | 'workspaceDelete' | 'createShare' | 'shareCatalog' | 'shareDrawingAccess'>;
export interface SyncHandlerOptions {
  service?: Service & Partial<WorkspaceService>;
  allowedOrigins: readonly string[];
  enabled: boolean;
  // Only configure after verifying which header Neon overwrites at the edge.
  // Otherwise all unauthenticated callers share a conservative rate bucket.
  clientAddress?: (request: Request) => string | null;
}
async function jsonBody(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new SyncFault(415, 'JSON_REQUIRED');
  const limit = MAX_SYNC_BYTES + 4096, length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new SyncFault(413, 'PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader(); if (!reader) throw new SyncFault(400, 'INVALID_JSON');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new SyncFault(413, 'PAYLOAD_TOO_LARGE'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new SyncFault(400, 'INVALID_JSON'); }
}

export function createSyncHandler(options: SyncHandlerOptions) {
  const origins = new Set(options.allowedOrigins.filter((origin) => { try { return origin !== 'null' && new URL(origin).origin === origin; } catch { return false; } }));
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
    const origin = request.headers.get('Origin');
    if (origin && !origins.has(origin)) return reply({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      headers.set('Access-Control-Max-Age', '600');
      return new Response(null, { status: 204, headers });
    }
    const url = new URL(request.url), path = url.pathname, method = request.method;
    const service = options.service, enabled = options.enabled && Boolean(service);
    if (path === '/v1/sync/status' && method === 'GET') return reply({ enabled, protocolVersion: 1 });
    if (!enabled || !service) return reply({ error: 'SYNC_DISABLED' }, 503);
    if (path.startsWith('/v1/shares/')) {
      try {
        if (url.search) throw new SyncFault(400, 'QUERY_NOT_ALLOWED');
        const match = path.match(/^\/v1\/shares\/([^/]+)(?:\/drawings\/([^/]+)\/access)?$/);
        if (!match) throw new SyncFault(404, 'NOT_FOUND');
        const key = request.headers.get('Authorization')?.match(/^Bearer (dai_share_v1_[A-Za-z0-9_-]{43})$/)?.[1];
        if (!key) throw new SyncFault(401, 'ACCESS_DENIED');
        await service.rate('share-access', options.clientAddress?.(request) ?? null, key);
        const id = z.uuid().parse(match[1]);
        if (method === 'GET' && !match[2] && service.shareCatalog) return reply(await service.shareCatalog(id, key));
        if (method === 'POST' && match[2] && service.shareDrawingAccess) return reply(await service.shareDrawingAccess(id, key, z.uuid().parse(match[2])));
        throw new SyncFault(404, 'NOT_FOUND');
      } catch (error) {
        if (error instanceof SyncFault) { if (error.status === 429) headers.set('Retry-After', '60'); return reply({ error: error.code }, error.status); }
        return reply({ error: error instanceof z.ZodError ? 'INVALID_REQUEST' : 'SYNC_UNAVAILABLE' }, error instanceof z.ZodError ? 400 : 503);
      }
    }
    if (path === '/v1/workspaces' || path.startsWith('/v1/workspaces/')) {
      try {
        if (url.search) throw new SyncFault(400, 'QUERY_NOT_ALLOWED');
        const workspace = path.match(/^\/v1\/workspaces\/([^/]+)(?:\/(folders|drawings|adopt|shares)(?:\/([^/]+)\/access)?)?$/);
        const key = request.headers.get('Authorization')?.match(/^Bearer (dai_workspace_v1_[A-Za-z0-9_-]{43})$/)?.[1];
        const creating = path === '/v1/workspaces' && method === 'POST';
        await service.rate(creating ? 'workspace-create' : method === 'GET' ? 'workspace-list' : 'workspace-write', options.clientAddress?.(request) ?? null, key);
        if (creating && service.workspaceCreate) return reply(await service.workspaceCreate(await jsonBody(request)), 201);
        if (!workspace) throw new SyncFault(404, 'NOT_FOUND');
        if (!key) throw new SyncFault(401, 'ACCESS_DENIED');
        const id = z.uuid().parse(workspace[1]);
        if (method === 'POST' && workspace[2] === 'shares' && !workspace[3] && service.createShare) return reply(await service.createShare(id, key, await jsonBody(request)), 201);
        if (!workspace[2] && method === 'DELETE' && service.workspaceDelete) { await service.workspaceDelete(id, key); return new Response(null, { status: 204, headers }); }
        if (!workspace[2] && method === 'GET' && service.workspaceCatalog) return reply(await service.workspaceCatalog(id, key));
        if (method === 'POST' && workspace[2] === 'folders' && !workspace[3] && service.workspaceFolder) return reply(await service.workspaceFolder(id, key, await jsonBody(request)));
        if (method === 'POST' && workspace[2] === 'drawings' && !workspace[3] && service.workspaceDrawingCreate) return reply(await service.workspaceDrawingCreate(id, key, await jsonBody(request)), 201);
        if (method === 'POST' && workspace[2] === 'drawings' && workspace[3] && service.workspaceDrawingAccess) return reply(await service.workspaceDrawingAccess(id, key, z.uuid().parse(workspace[3])));
        if (method === 'POST' && workspace[2] === 'adopt' && !workspace[3] && service.workspaceAdopt) return reply(await service.workspaceAdopt(id, key, await jsonBody(request)));
        throw new SyncFault(404, 'NOT_FOUND');
      } catch (error) {
        if (error instanceof SyncFault) { if (error.status === 429) headers.set('Retry-After', '60'); return reply({ error: error.code }, error.status); }
        return reply({ error: error instanceof z.ZodError ? 'INVALID_REQUEST' : 'SYNC_UNAVAILABLE' }, error instanceof z.ZodError ? 400 : 503);
      }
    }
    const match = path.match(/^\/v1\/projects\/([^/]+)(?:\/(snapshot|pairing-codes|devices|recover|revisions)(?:\/([^/]+))?)?$/);
    const route = method === 'POST' && path === '/v1/projects' ? 'create'
      : method === 'POST' && path === '/v1/pairing/redeem' ? 'redeem'
      : match && !match[2] && method === 'GET' ? 'pull'
      : match && !match[2] && method === 'DELETE' ? 'delete'
      : match?.[2] === 'snapshot' && method === 'GET' ? 'pull'
      : match?.[2] === 'snapshot' && method === 'PUT' ? 'push'
      : match?.[2] === 'pairing-codes' && method === 'POST' ? 'pair'
      : match?.[2] === 'devices' && method === 'GET' && !match[3] ? 'devices'
      : match?.[2] === 'devices' && method === 'DELETE' && match[3] ? 'revoke'
      : match?.[2] === 'recover' && method === 'POST' ? 'recover'
      : match?.[2] === 'revisions' && method === 'GET' ? 'revisions' : null;
    if (!route) return reply({ error: 'NOT_FOUND' }, 404);
    try {
      const bearer = request.headers.get('Authorization')?.match(/^Bearer (dai_device_v1_[A-Za-z0-9_-]{43})$/)?.[1];
      if (!['create', 'redeem', 'recover'].includes(route) && !bearer) throw new SyncFault(401, 'ACCESS_DENIED');
      const id = match ? z.uuid().parse(match[1]) : '';
      if (match?.[3] && route !== 'revoke') throw new SyncFault(404, 'NOT_FOUND');
      if (url.search && !(route === 'pull' && [...url.searchParams.keys()].every((key) => key === 'afterRevision'))) throw new SyncFault(400, 'QUERY_NOT_ALLOWED');
      const after = url.searchParams.get('afterRevision');
      if (after !== null && (!/^\d+$/.test(after) || !Number.isSafeInteger(Number(after)))) throw new SyncFault(400, 'INVALID_REVISION');
      await service.rate(route, options.clientAddress?.(request) ?? null, bearer);
      if (route === 'create') return reply(await service.create(await jsonBody(request)), 201);
      if (route === 'redeem') return reply(await service.redeem(await jsonBody(request)));
      if (route === 'recover') return reply(await service.recover(id, await jsonBody(request)));
      if (route === 'pull') {
        const snapshot = await service.pull(id, bearer!, after === null ? 0 : Number(after));
        if (!snapshot || after !== null && Number(after) >= snapshot.revision) return new Response(null, { status: 204, headers });
        return reply(snapshot);
      }
      if (route === 'push') return reply(await service.push(id, bearer!, await jsonBody(request)));
      if (route === 'pair') return reply(await service.pair(id, bearer!));
      if (route === 'devices') return reply({ devices: await service.devices(id, bearer!) });
      if (route === 'revoke') { await service.revoke(id, bearer!, z.uuid().parse(match![3])); return new Response(null, { status: 204, headers }); }
      if (route === 'delete') { await service.deleteProject(id, bearer!); return new Response(null, { status: 204, headers }); }
      return reply({ revisions: await service.revisions(id, bearer!) });
    } catch (error) {
      if (error instanceof SyncFault) { if (error.status === 429) headers.set('Retry-After', error.code === 'DAILY_LIMIT' ? '3600' : '60'); return reply({ error: error.code }, error.status); }
      if (error instanceof z.ZodError) return reply({ error: 'INVALID_REQUEST' }, 400);
      // Never serialize database/runtime exceptions, request bodies or credentials.
      return reply({ error: 'SYNC_UNAVAILABLE' }, 503);
    }
  };
}

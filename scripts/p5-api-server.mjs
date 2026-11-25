import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { testDatabase, migrateSync } from './sync-test-database.mjs';
import { createSyncHandler } from '../apps/api/src/sync-handler.ts';
import { createHealthHandler } from '../apps/api/src/health-handler.ts';
import { SyncService, SyncFault } from '../apps/api/src/sync-service.ts';

// Explicit dev Neon branch, or named localhost CI database. Never production.
const { connectionString } = testDatabase(process.env.DIAGRAMAI_P5_TEST_PROJECT, process.env.DIAGRAMAI_P5_TEST_BRANCH);
const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 15000, statement_timeout: 10000 });
await migrateSync(pool);
const owned = new Set(), namespace = `test-${randomUUID()}:`;
const ownedWorkspaces = new Set();
const service = new SyncService(pool, randomBytes(32).toString('hex'), { rateNamespace: namespace });
const originalCreate = service.create.bind(service);
service.create = async (input) => {
  if (!input?.document?.title?.startsWith('P5 fixture ')) throw new SyncFault(400, 'TEST_FIXTURE_ONLY');
  const result = await originalCreate(input); owned.add(result.credentials.projectId); return result;
};
const createWorkspace = service.workspaceCreate.bind(service), createDrawing = service.workspaceDrawingCreate.bind(service);
service.workspaceCreate = async (input) => { const result = await createWorkspace(input); ownedWorkspaces.add(result.id); return result; };
service.workspaceDrawingCreate = async (id, key, input) => {
  if (!ownedWorkspaces.has(id) || !input?.project?.document?.title?.startsWith('P5 fixture ')) throw new SyncFault(400, 'TEST_FIXTURE_ONLY');
  const result = await createDrawing(id, key, input); owned.add(result.credentials.projectId); return result;
};
const allowedOrigins = ['http://127.0.0.1:4173', 'http://localhost:4173', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'];
const sync = createSyncHandler({ service, allowedOrigins, enabled: true });
const health = createHealthHandler({ allowedOrigins, queryDatabase: async () => { await pool.query('SELECT 1'); } });
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.method === 'POST' && incoming.url === '/__p5_test__/cleanup') {
      // Loopback-only fixture harness, never deployed with the application API.
      await cleanupFixtures(); outgoing.writeHead(204); outgoing.end(); return;
    }
    const request = new Request(new URL(incoming.url ?? '/', 'http://127.0.0.1:8787'), {
      method: incoming.method, headers: incoming.headers,
      ...(incoming.method !== 'GET' && incoming.method !== 'HEAD' ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    });
    const response = await (new URL(request.url).pathname === '/v1/health' ? health(request) : sync(request));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(503, { 'Content-Type': 'application/json' }); outgoing.end('{"error":"TEST_SERVER_UNAVAILABLE"}'); }
});
server.listen(8787, '127.0.0.1', () => console.log('P5 fixture API ready on 127.0.0.1:8787. Explicit test database only; credentials are not logged.'));
let stopping = false;
async function cleanupFixtures() {
    for (const id of owned) {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const current = await db.query('SELECT snapshot_bytes FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [id]);
        const revisions = await db.query('SELECT coalesce(sum(snapshot_bytes),0)::bigint AS bytes FROM diagramai_sync.project_revisions WHERE project_id=$1', [id]);
        await db.query('DELETE FROM diagramai_sync.projects WHERE id=$1', [id]);
        if (current.rowCount) await db.query('UPDATE diagramai_sync.storage_budget SET used_bytes=used_bytes-$1,project_count=project_count-1 WHERE singleton=true', [Number(current.rows[0].snapshot_bytes) + Number(revisions.rows[0].bytes)]);
        await db.query('COMMIT');
      } catch { await db.query('ROLLBACK').catch(() => {}); console.error('Fixture cleanup did not finish; no broad cleanup was attempted.'); }
      finally { db.release(); }
    }
    owned.clear();
    for (const id of ownedWorkspaces) {
      await pool.query('DELETE FROM diagramai_sync.workspace_folders WHERE workspace_id=$1', [id]);
      await pool.query('DELETE FROM diagramai_sync.workspaces WHERE id=$1', [id]);
    }
    ownedWorkspaces.clear();
    await pool.query('DELETE FROM diagramai_sync.rate_limit_buckets WHERE starts_with(bucket_id,$1)', [namespace]);
}
async function stop() {
  if (stopping) return; stopping = true;
  server.closeAllConnections(); server.close();
  try { await cleanupFixtures(); } finally { await pool.end(); process.exit(0); }
}
process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });

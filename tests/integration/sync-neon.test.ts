import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { createDocument } from '@diagramai/diagram-core';
import { snapshotHash } from '@diagramai/sync-core';
import { SyncFault, SyncService } from '../../apps/api/src/sync-service';

// Only the explicit guarded script supplies this URL. Never fall back to DATABASE_URL.
const url = process.env.DIAGRAMAI_SYNC_TEST_DATABASE_URL;
const branch = process.env.DIAGRAMAI_SYNC_TEST_BRANCH;
const suite = url && branch && !/prod/i.test(branch) ? describe : describe.skip;
// Assertions must never dump a successful credential response when a negative
// test unexpectedly succeeds (even though these are disposable test projects).
const rejection = (promise: Promise<unknown>) => promise.then(() => ({ unexpected: 'accepted' }), (error: SyncFault) => ({ status: error.status, code: error.code }));
suite('P5 real Postgres transactions on isolated Neon branch', () => {
  const pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 15000, statement_timeout: 10000 });
  const service = new SyncService(pool, 'integration-only-rate-key-not-a-deployed-secret', { revisions: 3 });
  const projects: string[] = [];
  beforeAll(async () => { expect(branch).toMatch(/^br-/); await pool.query('SELECT 1'); });
  afterAll(async () => {
    // Narrow fixture cleanup: only IDs returned to this test run, never TRUNCATE/DROP.
    for (const id of projects) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT snapshot_bytes FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [id]);
        const revisions = await client.query('SELECT coalesce(sum(snapshot_bytes),0)::bigint AS bytes FROM diagramai_sync.project_revisions WHERE project_id=$1', [id]);
        await client.query('DELETE FROM diagramai_sync.projects WHERE id=$1', [id]);
        if (result.rowCount) await client.query('UPDATE diagramai_sync.storage_budget SET used_bytes=used_bytes-$1,project_count=project_count-1 WHERE singleton=true', [Number(result.rows[0].snapshot_bytes) + Number(revisions.rows[0].bytes)]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    await pool.end();
  });
  const create = async () => {
    const document = createDocument(`Fixture ${randomUUID().slice(0, 8)}`), operationId = randomUUID();
    const request = { document, hash: await snapshotHash(document), operationId, deviceLabel: 'Desktop integration fixture' };
    const result = await service.create(request); projects.push(result.credentials.projectId);
    return { ...result, request };
  };
  it('private create/pull stores only hashed credentials, blocks cross-project tokens and duplicate creation', async () => {
    const a = await create(), b = await create();
    expect((await service.pull(a.credentials.projectId, a.credentials.token)).document).toEqual(a.request.document);
    expect(await service.pull(a.credentials.projectId, a.credentials.token, 1)).toBeNull();
    await expect(service.pull(b.credentials.projectId, a.credentials.token)).rejects.toMatchObject({ status: 401 });
    expect(await rejection(service.create(a.request))).toMatchObject({ code: 'CREATION_ALREADY_COMMITTED' });
    const device = (await pool.query('SELECT token_hash FROM diagramai_sync.project_devices WHERE id=$1', [a.credentials.deviceId])).rows[0];
    expect(device.token_hash).toMatch(/^[a-f0-9]{64}$/); expect(device.token_hash).not.toContain(a.credentials.token);
    const recovery = (await pool.query('SELECT recovery_hash FROM diagramai_sync.project_recovery WHERE project_id=$1', [a.credentials.projectId])).rows[0];
    expect(recovery.recovery_hash).toMatch(/^[a-f0-9]{64}$/); expect(recovery.recovery_hash).not.toBe(a.recoveryKey);
  });
  it('two concurrent CAS pushes accept exactly one revision; safe retry does not duplicate a commit', async () => {
    const a = await create(), id = a.credentials.projectId, bearer = a.credentials.token;
    const documentA = { ...a.request.document, title: 'Nhánh A' }, documentB = { ...a.request.document, title: 'Nhánh B' };
    const requestA = { document: documentA, baseRevision: 1, hash: await snapshotHash(documentA), operationId: randomUUID() };
    const requestB = { document: documentB, baseRevision: 1, hash: await snapshotHash(documentB), operationId: randomUUID() };
    const results = await Promise.allSettled([service.push(id, bearer, requestA), service.push(id, bearer, requestB)]);
    expect(results.filter((result) => result.status === 'fulfilled').map(() => 'accepted')).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected'); expect(failed?.status === 'rejected' && failed.reason).toMatchObject({ code: 'REVISION_CONFLICT' });
    const winner = results[0].status === 'fulfilled' ? requestA : requestB;
    expect(await service.push(id, bearer, winner)).toEqual({ acceptedRevision: 2, hash: winner.hash });
    await expect(service.push(id, bearer, { ...winner, hash: winner === requestA ? requestB.hash : requestA.hash, document: winner === requestA ? documentB : documentA })).rejects.toMatchObject({ code: 'OPERATION_REUSED' });
    expect((await service.revisions(id, bearer)).map((item) => item.revision)).toEqual([2, 1]);
  });
  it('uppercase UUIDs from a valid P4 portable file keep their document hash while syncing', async () => {
    const document = { ...createDocument('P4 UUID uppercase'), documentId: randomUUID().toUpperCase() };
    const created = await service.create({ document, operationId: randomUUID(), hash: await snapshotHash(document), deviceLabel: 'Imported file fixture' }); projects.push(created.credentials.projectId);
    const edited = { ...document, title: 'Đã sửa từ file cũ' };
    expect((await service.push(created.credentials.projectId, created.credentials.token, { document: edited, hash: await snapshotHash(edited), baseRevision: 1, operationId: randomUUID() })).acceptedRevision).toBe(2);
    expect((await service.pull(created.credentials.projectId.toUpperCase(), created.credentials.token)).document.documentId).toBe(document.documentId);
  });
  it('pair code is one-time under concurrent redeem, expires, and revocation also invalidates outstanding codes', async () => {
    const a = await create(), id = a.credentials.projectId;
    const code = await service.pair(id, a.credentials.token);
    const results = await Promise.allSettled([service.redeem({ code: code.code, deviceLabel: 'Web A' }), service.redeem({ code: code.code, deviceLabel: 'Web B' })]);
    expect(results.filter((result) => result.status === 'fulfilled').map(() => 'accepted')).toHaveLength(1);
    const success = results.find((result) => result.status === 'fulfilled'); if (success?.status !== 'fulfilled') throw new Error('No redeemed device');
    const editor = success.value.credentials;
    await expect(service.revoke(id, editor.token, a.credentials.deviceId)).rejects.toMatchObject({ status: 403 });
    const delegated = await service.pair(id, editor.token);
    await service.revoke(id, a.credentials.token, editor.deviceId);
    await expect(service.pull(id, editor.token)).rejects.toMatchObject({ status: 401 });
    expect(await rejection(service.redeem({ code: delegated.code, deviceLabel: 'Revoked source' }))).toMatchObject({ status: 401 });
    const expired = await service.pair(id, a.credentials.token);
    await pool.query('UPDATE diagramai_sync.pairing_codes SET expires_at=now()-interval \'1 second\' WHERE project_id=$1', [id]);
    expect(await rejection(service.redeem({ code: expired.code, deviceLabel: 'Expired' }))).toMatchObject({ code: 'PAIRING_INVALID' });
  });
  it('recovery grants a new owner without a login and does not leak secrets through device metadata', async () => {
    const a = await create(), id = a.credentials.projectId;
    expect(await rejection(service.recover(id, { recoveryKey: `dai_recovery_v1_${'a'.repeat(43)}`, deviceLabel: 'Wrong key' }))).toMatchObject({ code: 'RECOVERY_INVALID' });
    const recovered = await service.recover(id, { recoveryKey: a.recoveryKey, deviceLabel: 'Recovered Web' });
    expect(recovered.credentials.scope).toBe('owner');
    await service.revoke(id, recovered.credentials.token, a.credentials.deviceId);
    await expect(service.pull(id, a.credentials.token)).rejects.toBeInstanceOf(SyncFault);
    const metadata = JSON.stringify(await service.devices(id, recovered.credentials.token));
    expect(metadata).not.toContain('token'); expect(metadata).not.toContain(a.recoveryKey);
    const replacement = await service.recover(id, { recoveryKey: a.recoveryKey, deviceLabel: 'Explicit replacement owner', revokeOtherDevices: true });
    expect(replacement.credentials.scope).toBe('owner');
    await expect(service.pull(id, recovered.credentials.token)).rejects.toMatchObject({ status: 401 });
  });
  it('retention keeps three recent snapshots but retains old idempotency receipts; checksum failure is atomic', async () => {
    const a = await create(), id = a.credentials.projectId, bearer = a.credentials.token;
    let earliest: Parameters<SyncService['push']>[2] | undefined;
    for (let baseRevision = 1; baseRevision < 6; baseRevision++) {
      const document = { ...a.request.document, title: `Tiếng Việt ${baseRevision}` };
      const request = { document, hash: await snapshotHash(document), baseRevision, operationId: randomUUID() };
      earliest ??= request; await service.push(id, bearer, request);
    }
    expect((await service.revisions(id, bearer)).map((item) => item.revision)).toEqual([6, 5, 4]);
    expect((await service.push(id, bearer, earliest!)).acceptedRevision).toBe(2);
    await expect(service.push(id, bearer, { document: a.request.document, baseRevision: 6, operationId: randomUUID(), hash: '0'.repeat(64) })).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
    expect((await service.pull(id, bearer)).revision).toBe(6);
  });
  it('storage hard cap rejects atomically without creating an orphan project', async () => {
    const capped = new SyncService(pool, 'integration-only-rate-key-not-a-deployed-secret', { storageBytes: 1 });
    const document = createDocument();
    expect(await rejection(capped.create({ document, hash: await snapshotHash(document), operationId: randomUUID(), deviceLabel: 'Cap fixture' }))).toMatchObject({ code: 'CLOUD_STORAGE_LIMIT' });
    expect((await pool.query('SELECT count(*)::int AS count FROM diagramai_sync.projects WHERE document_id=$1', [document.documentId])).rows[0].count).toBe(0);
  });
  it('atomic rate counters limit concurrent pairing guesses without storing raw identities', async () => {
    const identity = `integration-${randomUUID()}`;
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => service.rate('redeem', identity)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const buckets = await pool.query('SELECT bucket_id FROM diagramai_sync.rate_limit_buckets');
    expect(JSON.stringify(buckets.rows)).not.toContain(identity);
  });
  it('only an owner can delete cloud data; deletion releases budget and invalidates all device capabilities', async () => {
    const a = await create(), id = a.credentials.projectId;
    const pair = await service.pair(id, a.credentials.token), editor = await service.redeem({ code: pair.code, deviceLabel: 'Editor delete fixture' });
    await expect(service.deleteProject(id, editor.credentials.token)).rejects.toMatchObject({ status: 403 });
    await service.deleteProject(id, a.credentials.token);
    await expect(service.pull(id, editor.credentials.token)).rejects.toMatchObject({ status: 401 });
    expect((await pool.query('SELECT count(*)::int AS count FROM diagramai_sync.projects WHERE id=$1', [id])).rows[0].count).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS count FROM diagramai_sync.project_revisions WHERE project_id=$1', [id])).rows[0].count).toBe(0);
  });
  it('down migrations execute only inside a rolled-back dev transaction and preserve all accepted data', async () => {
    const a = await create(), db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query(await readFile(new URL('../../apps/api/migrations/004_scoped_shares.down.sql', import.meta.url), 'utf8'));
      await db.query(await readFile(new URL('../../apps/api/migrations/003_workspaces.down.sql', import.meta.url), 'utf8'));
      await db.query(await readFile(new URL('../../apps/api/migrations/002_project_count.down.sql', import.meta.url), 'utf8'));
      await db.query(await readFile(new URL('../../apps/api/migrations/001_sync.down.sql', import.meta.url), 'utf8'));
      expect((await db.query("SELECT to_regclass('diagramai_sync.projects') AS relation")).rows[0].relation).toBeNull();
    } finally { await db.query('ROLLBACK'); db.release(); }
    expect((await service.pull(a.credentials.projectId, a.credentials.token)).document).toEqual(a.request.document);
    expect((await pool.query('SELECT version FROM diagramai_sync.schema_migrations ORDER BY version')).rows.map((row) => row.version)).toEqual([1, 2, 3, 4]);
  });
});

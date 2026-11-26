import { afterAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createDocument } from '@diagramai/diagram-core';
import { snapshotHash } from '@diagramai/sync-core';
import { SyncService, type SyncFault } from '../../apps/api/src/sync-service';
const suite = process.env.DIAGRAMAI_SYNC_TEST_DATABASE_URL && /^br-/.test(process.env.DIAGRAMAI_SYNC_TEST_BRANCH ?? '') ? describe : describe.skip;
suite('P5 shared workspace → existing snapshot CAS boundary on real Postgres', () => {
  const pool = new Pool({ connectionString: process.env.DIAGRAMAI_SYNC_TEST_DATABASE_URL, max: 5 });
  const service = new SyncService(pool, 'workspace-integration-fixture-rate-secret-only');
  const workspaces: string[] = [], projects = new Set<string>();
  const rejection = (promise: Promise<unknown>) => promise.then(() => ({ accepted: true }), (error: SyncFault) => ({ status: error.status, code: error.code }));
  const workspace = async () => {
    const access = { id: randomUUID(), key: `dai_workspace_v1_${randomBytes(32).toString('base64url')}` };
    await service.workspaceCreate(access); workspaces.push(access.id);
    const folder = { id: randomUUID(), title: 'Dự án fixture' };
    await service.workspaceFolder(access.id, access.key, folder); return { ...access, folder };
  };
  const drawing = async (folderId: string) => { const document = createDocument('P5 fixture workspace'); return { id: randomUUID(), folderId, project: { document, operationId: randomUUID(), hash: await snapshotHash(document), deviceLabel: 'Workspace fixture' } }; };
  afterAll(async () => {
    for (const workspaceId of workspaces) for (const row of (await pool.query('SELECT project_id FROM diagramai_sync.workspace_drawings WHERE workspace_id=$1', [workspaceId])).rows) projects.add(row.project_id);
    for (const id of projects) {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const current = await db.query('SELECT snapshot_bytes FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [id]);
        const retained = await db.query('SELECT coalesce(sum(snapshot_bytes),0)::bigint AS bytes FROM diagramai_sync.project_revisions WHERE project_id=$1', [id]);
        await db.query('DELETE FROM diagramai_sync.projects WHERE id=$1', [id]);
        if (current.rowCount) await db.query('UPDATE diagramai_sync.storage_budget SET used_bytes=used_bytes-$1,project_count=project_count-1 WHERE singleton', [Number(current.rows[0].snapshot_bytes) + Number(retained.rows[0].bytes)]);
        await db.query('COMMIT');
      } finally { await db.query('ROLLBACK').catch(() => {}); db.release(); }
    }
    for (const id of workspaces) { await pool.query('DELETE FROM diagramai_sync.workspace_folders WHERE workspace_id=$1', [id]); await pool.query('DELETE FROM diagramai_sync.workspaces WHERE id=$1', [id]); }
    await pool.end();
  });
  it('workspace create retry is recoverable; a private link is required and only a hash is stored', async () => {
    const a = await workspace(), b = await workspace();
    expect(await service.workspaceCreate({ id: a.id, key: a.key })).toEqual({ id: a.id });
    expect(await rejection(service.workspaceCatalog(a.id, b.key))).toMatchObject({ status: 401 });
    expect(await rejection(service.workspaceCreate({ id: a.id, key: b.key }))).toMatchObject({ status: 401 });
    const stored = (await pool.query('SELECT key_hash FROM diagramai_sync.workspaces WHERE id=$1', [a.id])).rows[0].key_hash;
    expect(stored).toMatch(/^[a-f0-9]{64}$/); expect(stored).not.toBe(a.key);
    const second = { id: randomUUID(), title: a.folder.title }; await service.workspaceFolder(a.id, a.key, second);
    expect((await service.workspaceCatalog(a.id, a.key)).folders).toHaveLength(2);
    expect(await rejection(service.workspaceFolder(b.id, b.key, a.folder))).toMatchObject({ status: 409 });
  });
  it('one workspace discovers every new drawing/project; retries do not issue a new device or duplicate snapshots', async () => {
    const a = await workspace(), input = await drawing(a.folder.id);
    const results = await Promise.all([service.workspaceDrawingCreate(a.id, a.key, input), service.workspaceDrawingCreate(a.id, a.key, input)]);
    expect(results[0].credentials.deviceId === results[1].credentials.deviceId).toBe(true);
    expect(results[0].credentials.token === results[1].credentials.token).toBe(true);
    const catalog = await service.workspaceCatalog(a.id, a.key); expect(catalog.drawings.map((item) => item.id)).toEqual([input.id]);
    expect(JSON.stringify(catalog)).not.toContain('token'); expect(JSON.stringify(catalog)).not.toContain('snapshot');
    const opened = await service.workspaceDrawingAccess(a.id, a.key, input.id);
    const edited = { ...opened.snapshot.document, title: 'P5 fixture edited on second device' };
    const pending = { document: edited, operationId: randomUUID(), baseRevision: 1, hash: await snapshotHash(edited) };
    await service.push(input.id, opened.credentials.token, pending);
    expect((await service.pull(input.id, results[0].credentials.token)).document.title).toBe(edited.title);
    expect((await service.workspaceDrawingCreate(a.id, a.key, input)).snapshot.revision).toBe(2);
    expect((await pool.query('SELECT count(*)::int AS count FROM diagramai_sync.project_devices WHERE project_id=$1', [input.id])).rows[0].count).toBe(1);
  });
  it('cross-workspace folders/drawings cannot be read or adopted without the old owner capability', async () => {
    const a = await workspace(), b = await workspace(), input = await drawing(a.folder.id);
    const created = await service.workspaceDrawingCreate(a.id, a.key, input);
    expect(await rejection(service.workspaceDrawingAccess(b.id, b.key, input.id))).toMatchObject({ status: 404 });
    expect(await rejection(service.workspaceDrawingCreate(b.id, b.key, { ...await drawing(a.folder.id) }))).toMatchObject({ status: 404 });
    expect(await rejection(service.workspaceAdopt(b.id, b.key, { folderId: b.folder.id, projectId: input.id, token: created.credentials.token, deviceLabel: 'Wrong workspace' }))).toMatchObject({ status: 409 });
  });
  it('adopts an existing P5 diagram without replacing snapshots, pending revision or old device rights', async () => {
    const a = await workspace(), input = await drawing(a.folder.id), old = await service.create(input.project); projects.add(old.credentials.projectId);
    const request = { folderId: a.folder.id, projectId: old.credentials.projectId, token: old.credentials.token, deviceLabel: 'Adoption fixture' };
    const adopted = await service.workspaceAdopt(a.id, a.key, request);
    expect(adopted.snapshot).toEqual(old.snapshot);
    expect((await service.pull(old.credentials.projectId, old.credentials.token)).revision).toBe(1);
    const retried = await service.workspaceAdopt(a.id, a.key, request);
    expect(retried.credentials.deviceId === adopted.credentials.deviceId).toBe(true);
    expect((await service.workspaceCatalog(a.id, a.key)).drawings).toHaveLength(1);
  });
  it('workspace deletion needs the private capability and releases only its own catalog/snapshot budget', async () => {
    const before = (await pool.query('SELECT used_bytes,project_count FROM diagramai_sync.storage_budget WHERE singleton')).rows[0];
    const a = await workspace(); await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id));
    expect(await rejection(service.workspaceDelete(a.id, `dai_workspace_v1_${'x'.repeat(43)}`))).toMatchObject({ status: 401 });
    await service.workspaceDelete(a.id, a.key);
    expect(await rejection(service.workspaceCatalog(a.id, a.key))).toMatchObject({ status: 401 });
    expect((await pool.query('SELECT used_bytes,project_count FROM diagramai_sync.storage_budget WHERE singleton')).rows[0]).toEqual(before);
  });
  it('a Project share edits all and only its drawings, including drawings added later; no workspace/admin capability leaks', async () => {
    const a = await workspace(), otherFolder = { id: randomUUID(), title: 'Other private Project' }; await service.workspaceFolder(a.id, a.key, otherFolder);
    const first = await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id));
    const outside = await service.workspaceDrawingCreate(a.id, a.key, await drawing(otherFolder.id));
    const access = { id: randomUUID(), key: `dai_share_v1_${randomBytes(32).toString('base64url')}`, kind: 'project' as const, targetId: a.folder.id };
    await service.createShare(a.id, a.key, access); await service.createShare(a.id, a.key, access);
    const later = await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id));
    const catalog = await service.shareCatalog(access.id, access.key);
    expect(catalog.drawings.map((item) => item.id).sort()).toEqual([first.credentials.projectId, later.credentials.projectId].sort());
    expect(JSON.stringify(catalog).includes(a.key)).toBe(false); expect(JSON.stringify(catalog).includes(a.id)).toBe(false);
    expect(await rejection(service.shareDrawingAccess(access.id, access.key, outside.credentials.projectId))).toMatchObject({ status: 404 });
    expect(await rejection(service.workspaceCatalog(a.id, access.key))).toMatchObject({ status: 401 });
    const opened = await service.shareDrawingAccess(access.id, access.key, first.credentials.projectId);
    expect(opened.credentials.scope).toBe('editor');
    const edited = { ...opened.snapshot.document, title: 'Edited through Project link' };
    await service.push(first.credentials.projectId, opened.credentials.token, { document: edited, hash: await snapshotHash(edited), baseRevision: 1, operationId: randomUUID() });
    expect((await service.pull(first.credentials.projectId, first.credentials.token)).document.title).toBe(edited.title);
    expect(await rejection(service.deleteProject(first.credentials.projectId, opened.credentials.token))).toMatchObject({ status: 403 });
    expect(await rejection(service.createShare(a.id, access.key, { ...access, id: randomUUID() }))).toMatchObject({ status: 401 });
  });
  it('a drawing share cannot enumerate/open/edit siblings even by forging IDs; access retries reuse one editor principal', async () => {
    const a = await workspace(), one = await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id)), two = await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id));
    const access = { id: randomUUID(), key: `dai_share_v1_${randomBytes(32).toString('base64url')}`, kind: 'drawing' as const, targetId: one.credentials.projectId };
    await service.createShare(a.id, a.key, access);
    expect((await service.shareCatalog(access.id, access.key)).drawings.map((item) => item.id)).toEqual([one.credentials.projectId]);
    const opened = await service.shareDrawingAccess(access.id, access.key, one.credentials.projectId), again = await service.shareDrawingAccess(access.id, access.key, one.credentials.projectId);
    expect(opened.credentials.deviceId === again.credentials.deviceId).toBe(true);
    expect(await rejection(service.shareDrawingAccess(access.id, access.key, two.credentials.projectId))).toMatchObject({ status: 404 });
    expect(await rejection(service.pull(two.credentials.projectId, opened.credentials.token))).toMatchObject({ status: 401 });
    expect(await rejection(service.shareCatalog(access.id, `dai_share_v1_${'x'.repeat(43)}`))).toMatchObject({ status: 401 });
    expect(await rejection(service.createShare(a.id, a.key, { ...access, targetId: two.credentials.projectId }))).toMatchObject({ status: 409 });
  });
  it('share creation cannot bind a folder or drawing from a different workspace', async () => {
    const a = await workspace(), b = await workspace(), one = await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id));
    for (const input of [{ kind: 'project', targetId: a.folder.id }, { kind: 'drawing', targetId: one.credentials.projectId }]) expect(await rejection(service.createShare(b.id, b.key, { ...input, id: randomUUID(), key: `dai_share_v1_${randomBytes(32).toString('base64url')}` }))).toMatchObject({ status: 404 });
  });
  it('creation charges one daily request per retry, keeps its minute/day caps and does not reset a spent counter', async () => {
    const namespace = `rate-fixture-${randomUUID()}:`, limited = new SyncService(pool, 'rate-fixture-secret-not-deployed-123456', { rateNamespace: namespace });
    try {
      await limited.rate('workspace-create', null); await limited.rate('workspace-create', null);
      const id = `${namespace}global:workspace-create:day`;
      expect(Number((await pool.query('SELECT counter FROM diagramai_sync.rate_limit_buckets WHERE bucket_id=$1', [id])).rows[0].counter)).toBe(2);
      await pool.query('UPDATE diagramai_sync.rate_limit_buckets SET counter=20 WHERE bucket_id=$1', [id]);
      expect(await rejection(limited.rate('workspace-create', null))).toMatchObject({ status: 429, code: 'DAILY_LIMIT' });
      expect(Number((await pool.query('SELECT counter FROM diagramai_sync.rate_limit_buckets WHERE bucket_id=$1', [id])).rows[0].counter)).toBe(20);
    } finally { await pool.query('DELETE FROM diagramai_sync.rate_limit_buckets WHERE starts_with(bucket_id,$1)', [namespace]); }
  });
  it('a 22-character main alias is idempotent, encrypted at rest, survives server redeploy and returns the exact original capability', async () => {
    const a = await workspace(), input = { id: randomUUID(), code: randomBytes(16).toString('base64url') };
    await service.createShortLink(a.id, a.key, input); await service.createShortLink(a.id, a.key, input);
    const stored = (await pool.query('SELECT * FROM diagramai_sync.short_links WHERE id=$1', [input.id])).rows[0];
    expect(JSON.stringify(stored).includes(input.code)).toBe(false); expect(JSON.stringify(stored).includes(a.key)).toBe(false);
    const restarted = new SyncService(pool, 'new-deployment-rate-secret-not-an-encryption-key');
    const resolved = await restarted.resolveShortLink('workspace', input.code);
    expect(resolved.access.id).toBe(a.id); expect(resolved.access.key === a.key).toBe(true);
    expect((await service.workspaceCatalog(resolved.access.id, resolved.access.key)).folders[0].id).toBe(a.folder.id);
    expect(await rejection(service.resolveShortLink('share', input.code))).toMatchObject({ status: 401 });
    expect(await rejection(service.resolveShortLink('workspace', randomBytes(16).toString('base64url')))).toMatchObject({ status: 401 });
    expect(await rejection(service.createShortLink(a.id, a.key, { ...input, code: randomBytes(16).toString('base64url') }))).toMatchObject({ status: 409 });
    expect(await rejection(service.createShortLink(a.id, a.key, { ...input, id: randomUUID() }))).toMatchObject({ status: 409 });
    expect(Number((await pool.query('SELECT count(*) AS count FROM diagramai_sync.short_links WHERE workspace_id=$1', [a.id])).rows[0].count)).toBe(1);
  });
  it('owner deletion CAS rejects new members/revisions, denies other scopes, retains tombstones and retries safely', async () => {
    const a = await workspace(), b = await workspace(), input = await drawing(a.folder.id);
    const one = await service.workspaceDrawingCreate(a.id, a.key, input), id = one.credentials.projectId;
    const share = { id: randomUUID(), key: `dai_share_v1_${randomBytes(32).toString('base64url')}`, kind: 'project', targetId: a.folder.id };
    await service.createShare(a.id, a.key, share);
    const alias = { id: randomUUID(), code: randomBytes(16).toString('base64url'), share: { id: share.id, key: share.key } };
    await service.createShortLink(a.id, a.key, alias);
    expect(await rejection(service.workspaceDeleteItem(a.id, share.key, 'project', a.folder.id, { drawings: [{ id, revision: 1 }] }))).toMatchObject({ status: 401 });
    expect(await rejection(service.workspaceDeleteItem(b.id, b.key, 'project', a.folder.id, { drawings: [] }))).toMatchObject({ status: 404 });
    expect(await rejection(service.workspaceDeleteItem(a.id, a.key, 'drawing', id, { drawings: [{ id, revision: 2 }] }))).toMatchObject({ code: 'DELETE_CHANGED' });
    const two = await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id));
    expect(await rejection(service.workspaceDeleteItem(a.id, a.key, 'project', a.folder.id, { drawings: [{ id, revision: 1 }] }))).toMatchObject({ code: 'DELETE_CHANGED' });
    const confirm = { drawings: [{ id, revision: 1 }, { id: two.credentials.projectId, revision: 1 }] };
    await service.workspaceDeleteItem(a.id, a.key, 'project', a.folder.id, confirm);
    await service.workspaceDeleteItem(a.id, a.key, 'project', a.folder.id, confirm);
    expect((await service.workspaceCatalog(a.id, a.key)).folders).toHaveLength(0);
    expect((await service.workspaceChanges(a.id, a.key)).deleted).toEqual(expect.arrayContaining([{ kind: 'project', id: a.folder.id }, { kind: 'drawing', id }]));
    expect(await rejection(service.workspaceFolder(a.id, a.key, a.folder))).toMatchObject({ code: 'ITEM_DELETED' });
    expect(await rejection(service.workspaceDrawingCreate(a.id, a.key, input))).toMatchObject({ code: 'ITEM_DELETED' });
    expect(await rejection(service.resolveShortLink('share', alias.code))).toMatchObject({ status: 401 });
    expect(await rejection(service.pull(id, one.credentials.token))).toMatchObject({ status: 401 });
  });
  it('Project/drawing aliases preserve editor-only scope and original grant identity, and cannot mint a main alias or bind a foreign share', async () => {
    const a = await workspace(), b = await workspace(), otherFolder = { id: randomUUID(), title: 'Outside alias scope' };
    await service.workspaceFolder(a.id, a.key, otherFolder);
    const one = await service.workspaceDrawingCreate(a.id, a.key, await drawing(a.folder.id)), outside = await service.workspaceDrawingCreate(a.id, a.key, await drawing(otherFolder.id));
    const share = { id: randomUUID(), key: `dai_share_v1_${randomBytes(32).toString('base64url')}`, kind: 'project' as const, targetId: a.folder.id };
    await service.createShare(a.id, a.key, share);
    const alias = { id: randomUUID(), code: randomBytes(16).toString('base64url'), share: { id: share.id, key: share.key } };
    await service.createShortLink(a.id, a.key, alias);
    const opened = await service.resolveShortLink('share', alias.code);
    expect(opened.access.id).toBe(share.id); expect(opened.access.key === share.key).toBe(true);
    expect(JSON.stringify(opened).includes(a.id)).toBe(false); expect(JSON.stringify(opened).includes(a.key)).toBe(false);
    expect((await service.shareCatalog(opened.access.id, opened.access.key)).drawings.map((item) => item.id)).toEqual([one.credentials.projectId]);
    expect(await rejection(service.shareDrawingAccess(opened.access.id, opened.access.key, outside.credentials.projectId))).toMatchObject({ status: 404 });
    const original = await service.shareDrawingAccess(share.id, share.key, one.credentials.projectId), throughAlias = await service.shareDrawingAccess(opened.access.id, opened.access.key, one.credentials.projectId);
    expect(throughAlias.credentials).toEqual(original.credentials); expect(throughAlias.credentials.scope).toBe('editor');
    expect(await rejection(service.deleteProject(one.credentials.projectId, throughAlias.credentials.token))).toMatchObject({ status: 403 });
    expect(await rejection(service.createShortLink(a.id, opened.access.key, { id: randomUUID(), code: randomBytes(16).toString('base64url') }))).toMatchObject({ status: 401 });
    expect(await rejection(service.createShortLink(b.id, b.key, { ...alias, id: randomUUID() }))).toMatchObject({ status: 404 });
    const single = { id: randomUUID(), key: `dai_share_v1_${randomBytes(32).toString('base64url')}`, kind: 'drawing', targetId: one.credentials.projectId };
    await service.createShare(a.id, a.key, single);
    const singleAlias = { id: randomUUID(), code: randomBytes(16).toString('base64url'), share: { id: single.id, key: single.key } };
    await service.createShortLink(a.id, a.key, singleAlias);
    const singleOpened = await service.resolveShortLink('share', singleAlias.code);
    expect((await service.shareCatalog(singleOpened.access.id, singleOpened.access.key)).drawings.map((item) => item.id)).toEqual([one.credentials.projectId]);
    await service.deleteProject(one.credentials.projectId, one.credentials.token);
    expect(await rejection(service.resolveShortLink('share', singleAlias.code))).toMatchObject({ status: 401 });
  });
  it('a short alias rejects ciphertext or row-scope tampering instead of returning a different capability', async () => {
    const a = await workspace(), input = { id: randomUUID(), code: randomBytes(16).toString('base64url') };
    await service.createShortLink(a.id, a.key, input);
    const row = (await pool.query('SELECT * FROM diagramai_sync.short_links WHERE id=$1', [input.id])).rows[0];
    const changed = (row.ciphertext[0] === 'A' ? 'B' : 'A') + row.ciphertext.slice(1);
    await pool.query('UPDATE diagramai_sync.short_links SET ciphertext=$2 WHERE id=$1', [input.id, changed]);
    expect(await rejection(service.resolveShortLink('workspace', input.code))).toMatchObject({ status: 401 });
    await pool.query('UPDATE diagramai_sync.short_links SET ciphertext=$2,share_id=$3 WHERE id=$1', [input.id, row.ciphertext, null]);
    expect((await service.resolveShortLink('workspace', input.code)).access.id).toBe(a.id);
  });
});

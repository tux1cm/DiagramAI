import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDocument, newId, serializeDocument } from '@diagramai/diagram-core';
import { snapshotHash, type CloudSnapshot } from '@diagramai/sync-core';
import { decodeRecord, IndexedDbRepository, LocalConflict, LocalSyncJournal, ProjectSession } from '@diagramai/local-storage';

async function fixture() {
  const factory = new IDBFactory(), repo = new IndexedDbRepository('journal', factory), journal = new LocalSyncJournal(repo);
  const document = createDocument('Local gốc'), record = await repo.save({ document, expectedVersion: null, operationId: newId() });
  const snapshot: CloudSnapshot = { projectId: newId(), revision: 1, document, hash: await snapshotHash(document), updatedAt: new Date().toISOString() };
  const credentials = { projectId: snapshot.projectId, deviceId: newId(), token: `dai_device_v1_${'a'.repeat(43)}`, scope: 'owner' as const };
  await journal.bindExisting(document.documentId, { snapshot, credentials });
  return { factory, repo, journal, document, record, snapshot, credentials, id: document.documentId };
}
describe('P4 local persistence → P5 durable sync journal', () => {
  it('upgrades a P4 IndexedDB v1 without replacing documents/checkpoints/settings', async () => {
    const factory = new IDBFactory(), document = createDocument('P4 trước nâng cấp');
    const temporary = new IndexedDbRepository('source', factory), saved = await temporary.save({ document, expectedVersion: null, operationId: newId() }); temporary.close();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open('upgrade', 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore('documents', { keyPath: 'documentId' }).put(saved);
        db.createObjectStore('revisions', { keyPath: ['documentId', 'version'] }).createIndex('documentId', 'documentId');
        open.transaction!.objectStore('revisions').put(saved);
        db.createObjectStore('settings', { keyPath: 'key' }).put({ key: 'active', value: document.documentId });
        db.createObjectStore('sync_outbox', { keyPath: 'operationId' }); db.createObjectStore('device_credentials', { keyPath: 'deviceId' });
      };
      open.onsuccess = () => { open.result.close(); resolve(); }; open.onerror = () => reject(open.error);
    });
    const upgraded = new IndexedDbRepository('upgrade', factory);
    expect(await upgraded.load(document.documentId)).toEqual(saved); expect(await upgraded.active()).toBe(document.documentId);
    expect(await upgraded.revisions(document.documentId)).toEqual([saved]); expect((await upgraded.syncRead(document.documentId)).link).toBeNull(); upgraded.close();
  });
  it('writes document and outbox together; edits in flight do not mutate the pending operation, even across restart', async () => {
    const f = await fixture();
    const a = { ...f.document, title: 'Nhánh A' }, b = { ...f.document, title: 'Nhánh B mới hơn' };
    await f.repo.save({ document: a, expectedVersion: 1, operationId: newId() });
    const first = (await f.journal.link(f.id))!.pending!;
    await f.repo.save({ document: b, expectedVersion: 2, operationId: newId() });
    expect((await f.journal.link(f.id))!.pending).toEqual(first); f.repo.close();
    const reopened = new IndexedDbRepository('journal', f.factory), journal = new LocalSyncJournal(reopened);
    expect((await journal.stage(f.id))!.pending).toEqual(first);
    expect((await decodeRecord((await reopened.load(f.id))!)).title).toBe(b.title);
    await journal.acknowledge(f.id, first.operationId, 2, first.hash);
    const next = (await journal.link(f.id))!.pending!;
    expect(next.operationId).not.toBe(first.operationId); expect(next.baseRevision).toBe(2); expect(next.document.title).toBe(b.title); expect(next.localVersion).toBe(3);
    await journal.acknowledge(f.id, first.operationId, 2, first.hash); expect((await journal.link(f.id))!.pending).toEqual(next);
    await journal.acknowledge(f.id, next.operationId, 3, next.hash); expect((await journal.stage(f.id))!.pending).toBeNull(); reopened.close();
  });
  it('joining never overwrites a colliding local ID and canonical cloud IDs survive edits/pulls', async () => {
    const f = await fixture(), imported = await f.journal.join({ snapshot: f.snapshot, credentials: { ...f.credentials, deviceId: newId(), scope: 'editor' } });
    expect(imported).not.toBe(f.id); expect(await f.repo.list()).toHaveLength(2);
    const document = await decodeRecord((await f.repo.load(imported))!);
    await f.repo.save({ document: { ...document, title: 'Sửa từ Web' }, expectedVersion: 1, operationId: newId() });
    const pending = (await f.journal.link(imported))!.pending!;
    expect(pending.document.documentId).toBe(f.id); expect(pending.hash).toBe(await snapshotHash(pending.document));
    await f.journal.acknowledge(imported, pending.operationId, 2, pending.hash);
    const remoteDoc = { ...pending.document, title: 'Desk sửa tiếp' }, remote = { ...f.snapshot, document: remoteDoc, revision: 3, hash: await snapshotHash(remoteDoc) };
    expect(await f.journal.receive(imported, remote)).toBe('applied');
    expect((await decodeRecord((await f.repo.load(imported))!))).toMatchObject({ documentId: imported, title: 'Desk sửa tiếp' });
    expect((await f.journal.stage(imported))!.pending).toBeNull();
    expect((await decodeRecord((await f.repo.load(f.id))!))).toEqual(f.document); f.repo.close();
  });
  it('persists both branches before conflict; cloud resolution preserves any newer local edits atomically', async () => {
    const f = await fixture(), local = { ...f.document, title: 'Local offline' };
    await f.repo.save({ document: local, expectedVersion: 1, operationId: newId() });
    const cloud = { ...f.document, title: 'Cloud khác' }, remote = { ...f.snapshot, document: cloud, revision: 2, hash: await snapshotHash(cloud) };
    expect(await f.journal.receive(f.id, remote)).toBe('conflict');
    const conflict = (await f.journal.link(f.id))!; expect(conflict.conflict).toEqual(remote); expect(conflict.pending).not.toBeNull();
    expect((await decodeRecord((await f.repo.load(conflict.conflictCopyId!))!)).title).toContain('Local offline');
    await f.repo.save({ document: { ...local, title: 'Local sửa thêm khi xung đột' }, expectedVersion: 2, operationId: newId() });
    const preserved = await f.journal.useCloud(f.id);
    expect((await decodeRecord((await f.repo.load(preserved!))!)).title).toContain('Local sửa thêm');
    expect((await decodeRecord((await f.repo.load(f.id))!))).toMatchObject({ title: cloud.title });
    expect(await f.journal.stage(f.id)).toMatchObject({ baseRevision: 2, pending: null, conflict: null }); f.repo.close();
  });
  it('stale CAS cannot commit a document without its matching outbox; corrupt cloud never changes local data', async () => {
    const f = await fixture(), stale = await f.repo.syncRead(f.id);
    await f.repo.save({ document: { ...f.document, title: 'Mới' }, expectedVersion: 1, operationId: newId() });
    await expect(f.repo.syncCommit({ documentId: f.id, expectedVersion: stale.record!.version, expectedGeneration: stale.link!.generation, records: [], link: { ...stale.link!, generation: stale.link!.generation + 1, pending: null } })).rejects.toBeInstanceOf(LocalConflict);
    const current = await f.repo.syncRead(f.id);
    await expect(f.journal.receive(f.id, { ...f.snapshot, revision: 3, hash: '0'.repeat(64) })).rejects.toThrow('checksum');
    expect(await f.repo.syncRead(f.id)).toEqual(current); f.repo.close();
  });
  it('unlink/removal is local only; credentials never enter portable document JSON or checkpoints', async () => {
    const f = await fixture(); expect(await f.journal.credential(f.id)).toBe(f.credentials.token);
    const document = await decodeRecord((await f.repo.load(f.id))!);
    expect(serializeDocument(document)).not.toContain(f.credentials.token);
    expect(JSON.stringify(await f.repo.revisions(f.id))).not.toContain(f.credentials.token);
    await f.journal.unlink(f.id); expect(await f.journal.link(f.id)).toBeNull(); expect(await f.repo.syncCredential(f.credentials.deviceId)).toBeNull();
    expect(await f.repo.load(f.id)).not.toBeNull(); f.repo.close();
  });
  it('rehydrates an unchanged P4 editor only after cloud data is durably committed', async () => {
    const f = await fixture(), session = new ProjectSession(f.repo, () => f.document); await session.initialize();
    const before = session.getSnapshot(), remoteDoc = { ...f.document, title: 'Cloud đã xác nhận' }, remote = { ...f.snapshot, revision: 2, document: remoteDoc, hash: await snapshotHash(remoteDoc) };
    await session.receiveExternal(f.id, () => f.journal.receive(f.id, remote));
    expect(session.getSnapshot().store).not.toBe(before.store); expect(session.getSnapshot().epoch).toBe(before.epoch + 1);
    expect(session.getSnapshot().store.getSnapshot().document.title).toBe(remoteDoc.title); expect(session.getSnapshot().status).toBe('saved'); expect(session.hasUnsaved()).toBe(false); session.dispose();
  });
  it('an unexpected in-memory edit during remote apply is preserved and never reported saved', async () => {
    const f = await fixture(), session = new ProjectSession(f.repo, () => f.document); await session.initialize();
    const store = session.getSnapshot().store, remoteDoc = { ...f.document, title: 'Nhánh cloud đã lưu' }, remote = { ...f.snapshot, revision: 2, document: remoteDoc, hash: await snapshotHash(remoteDoc) };
    await expect(session.receiveExternal(f.id, async () => {
      store.execute([{ type: 'rename', title: 'Bộ nhớ cần giữ' }]);
      return f.journal.receive(f.id, remote);
    })).rejects.toThrow('chỉnh sửa mới');
    expect(session.getSnapshot().store).toBe(store); expect(store.getSnapshot().document.title).toBe('Bộ nhớ cần giữ');
    expect(session.getSnapshot().status).toBe('error'); expect(session.hasUnsaved()).toBe(true);
    expect((await decodeRecord((await f.repo.load(f.id))!)).title).toBe(remoteDoc.title);
    await session.forkCurrent(); expect(session.getSnapshot().status).toBe('saved'); expect(session.getSnapshot().store.getSnapshot().document.title).toContain('Bộ nhớ cần giữ'); session.dispose();
  });
});

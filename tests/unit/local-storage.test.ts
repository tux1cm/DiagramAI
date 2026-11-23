import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDocument, createNode, newId } from '@diagramai/diagram-core';
import { decodeRecord, IndexedDbRepository, LocalConflict, ProjectSession, type LocalRepository, type SaveRequest } from '@diagramai/local-storage';

function setup() { const factory = new IDBFactory(); return { factory, repo: new IndexedDbRepository('test', factory) }; }
const seed = () => ({ ...createDocument('Tiếng Việt'), nodes: [createNode('rect', 0, 0, 'Đạt yêu cầu?')] });

describe('IndexedDB transactions and integrity', () => {
  it('round-trips validated JSON, reopens and retains exactly 20 recent checkpoints', async () => {
    const { factory, repo } = setup(), document = seed(); let version: number | null = null;
    for (let i = 0; i < 23; i++) {
      document.title = `Sơ đồ ${i}`;
      const record = await repo.save({ document, expectedVersion: version, operationId: newId() }); version = record.version;
    }
    await repo.setActive(document.documentId); repo.close();
    const reopened = new IndexedDbRepository('test', factory), record = (await reopened.load(document.documentId))!;
    expect(await decodeRecord(record)).toEqual(document); expect(await reopened.active()).toBe(document.documentId);
    expect(await reopened.revisions(document.documentId)).toHaveLength(20);
    expect((await reopened.revisions(document.documentId)).at(-1)?.version).toBe(4);
    expect((await reopened.list())[0]).toMatchObject({ title: 'Sơ đồ 22', nodeCount: 1, edgeCount: 0, version: 23 });
    await reopened.remove(document.documentId, 23); expect(await reopened.load(document.documentId)).toBeNull(); expect(await reopened.revisions(document.documentId)).toHaveLength(0);
    reopened.close();
  });
  it('rejects stale save/delete atomically and retries the same operation idempotently', async () => {
    const { repo } = setup(), document = seed(), operationId = newId();
    const first = await repo.save({ document, expectedVersion: null, operationId });
    expect(await repo.save({ document, expectedVersion: null, operationId })).toEqual(first);
    expect(await repo.revisions(document.documentId)).toHaveLength(1);
    await expect(repo.save({ document: { ...document, title: 'Stale' }, expectedVersion: null, operationId: newId() })).rejects.toBeInstanceOf(LocalConflict);
    await expect(repo.remove(document.documentId, 0)).rejects.toBeInstanceOf(LocalConflict);
    expect(await decodeRecord((await repo.load(document.documentId))!)).toEqual(document); repo.close();
  });
  it('detects checksum corruption and refuses invalid graphs without partial writes', async () => {
    const { repo } = setup(), document = seed();
    const first = await repo.save({ document, expectedVersion: null, operationId: newId() });
    await expect(decodeRecord({ ...first, payload: first.payload.replace('Tiếng Việt', 'Corrupted') })).rejects.toThrow('toàn vẹn');
    await expect(repo.save({ document: { ...document, nodes: [...document.nodes, document.nodes[0]] }, expectedVersion: 1, operationId: newId() })).rejects.toThrow();
    expect((await repo.load(document.documentId))?.version).toBe(1); repo.close();
  });
});

describe('local project session', () => {
  it('recovers a corrupt primary from checkpoint in memory without overwriting the damaged record', async () => {
    const { repo, factory } = setup(), document = seed();
    const saved = await repo.save({ document, expectedVersion: null, operationId: newId() });
    const damaged = { ...saved, payload: 'corrupt bytes' };
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('test');
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put(damaged);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    });
    const session = new ProjectSession(repo, seed, 10000); await session.initialize();
    expect(session.getSnapshot().status).toBe('error'); expect(session.getSnapshot().message).toContain('checkpoint');
    expect(session.getSnapshot().store.getSnapshot().document).toEqual(document);
    expect(await repo.load(document.documentId)).toEqual(damaged);
    await session.forkCurrent(); expect(session.getSnapshot().status).toBe('saved');
    expect(await repo.load(document.documentId)).toEqual(damaged); expect(await repo.list()).toHaveLength(2);
    session.dispose();
  });
  it('restores edits and active project after restart; switch, rename, duplicate and delete are durable', async () => {
    const { repo, factory } = setup(), session = new ProjectSession(repo, seed, 10000); await session.initialize();
    const initialId = session.getSnapshot().store.getSnapshot().document.documentId;
    session.getSnapshot().store.execute([{ type: 'rename', title: 'Kho hàng đã chỉnh' }]);
    expect(session.getSnapshot().status).toBe('dirty'); await session.flush(); expect(session.getSnapshot().status).toBe('saved');
    await session.createProject('Dự án hai'); const secondId = session.getSnapshot().store.getSnapshot().document.documentId;
    await session.openProject(initialId); expect(session.getSnapshot().store.getSnapshot().document.title).toBe('Kho hàng đã chỉnh');
    await session.duplicateProject(initialId); const copyId = session.getSnapshot().store.getSnapshot().document.documentId;
    expect(copyId).not.toBe(initialId); expect(session.getSnapshot().store.getSnapshot().document.nodes).toHaveLength(1);
    await session.renameProject(secondId, 'Hai đổi tên');
    await session.removeProject(copyId, session.getSnapshot().version!); await session.openProject(initialId);
    session.dispose();
    const reopened = new ProjectSession(new IndexedDbRepository('test', factory), seed, 10000); await reopened.initialize();
    expect(reopened.getSnapshot().store.getSnapshot().document.documentId).toBe(initialId);
    expect(reopened.getSnapshot().projects.map((project) => project.title).sort()).toEqual(['Hai đổi tên', 'Kho hàng đã chỉnh']); reopened.dispose();
  });
  it('does not persist pointer drafts or label selection/viewport as unsaved; Undo/Redo autosaves committed graph', async () => {
    const { repo } = setup(), session = new ProjectSession(repo, seed, 10000); await session.initialize();
    const store = session.getSnapshot().store, nodeId = store.getSnapshot().document.nodes[0].id;
    store.selectAll(); expect(session.hasUnsaved()).toBe(false);
    store.beginInteraction('Kéo'); store.updateInteraction([{ type: 'geometry', values: [{ id: nodeId, x: 500 }] }]);
    await expect(session.flush()).rejects.toThrow('kết thúc'); expect((await decodeRecord((await repo.load(store.getSnapshot().document.documentId))!)).nodes[0].x).toBe(0);
    store.cancelInteraction(); expect(session.hasUnsaved()).toBe(false);
    store.execute([{ type: 'geometry', values: [{ id: nodeId, x: 500 }] }]); await session.flush();
    store.undo(); await session.flush(); expect((await decodeRecord((await repo.load(store.getSnapshot().document.documentId))!)).nodes[0].x).toBe(0);
    store.redo(); await session.flush(); expect((await decodeRecord((await repo.load(store.getSnapshot().document.documentId))!)).nodes[0].x).toBe(500); session.dispose();
  });
  it('never reports later edits saved while a write is still in flight', async () => {
    const { repo } = setup(); let release: (() => void) | undefined, gate: Promise<void> | undefined;
    const delayed = new Proxy(repo, { get(target, key) { if (key === 'save') return async (request: SaveRequest) => { if (gate) await gate; return target.save(request); }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } }) as LocalRepository;
    const session = new ProjectSession(delayed, seed, 10000); await session.initialize();
    gate = new Promise<void>((resolve) => { release = resolve; });
    session.getSnapshot().store.execute([{ type: 'rename', title: 'First' }]); const writing = session.flush();
    expect(session.getSnapshot().status).toBe('saving'); session.getSnapshot().store.execute([{ type: 'rename', title: 'Latest' }]);
    expect(session.hasUnsaved()).toBe(true); gate = undefined; release!(); await writing;
    expect(session.getSnapshot().status).toBe('saved');
    expect((await decodeRecord((await repo.load(session.getSnapshot().store.getSnapshot().document.documentId))!)).title).toBe('Latest'); session.dispose();
  });
  it('keeps memory data on storage failure and never switches/discards it when another write fails', async () => {
    const { repo } = setup(); let fail = false;
    const failing = new Proxy(repo, { get(target, key) { if (key === 'save') return (request: SaveRequest) => fail ? Promise.reject(new Error('Disk full')) : target.save(request); const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } }) as LocalRepository;
    const session = new ProjectSession(failing, seed, 10000); await session.initialize(); const store = session.getSnapshot().store;
    fail = true; store.execute([{ type: 'rename', title: 'Không được mất' }]); await expect(session.flush()).rejects.toThrow('Disk full');
    expect(session.getSnapshot().status).toBe('error'); expect(session.hasUnsaved()).toBe(true);
    await expect(session.createProject()).rejects.toThrow(); await expect(session.forkCurrent()).rejects.toThrow();
    expect(session.getSnapshot().store).toBe(store); expect(store.getSnapshot().document.title).toBe('Không được mất');
    fail = false; await session.retry(); expect(session.getSnapshot().status).toBe('saved'); session.dispose();
  });
  it('does not overwrite another tab: offers a fork that preserves both versions', async () => {
    const { repo, factory } = setup(), a = new ProjectSession(repo, seed, 10000); await a.initialize();
    const b = new ProjectSession(new IndexedDbRepository('test', factory), seed, 10000); await b.initialize(); const id = a.getSnapshot().store.getSnapshot().document.documentId;
    a.getSnapshot().store.execute([{ type: 'rename', title: 'Tab A' }]); await a.flush();
    b.getSnapshot().store.execute([{ type: 'rename', title: 'Tab B' }]); await expect(b.flush()).rejects.toBeInstanceOf(LocalConflict);
    expect(b.getSnapshot().status).toBe('conflict'); expect(b.getSnapshot().store.getSnapshot().document.title).toBe('Tab B');
    expect((await decodeRecord((await repo.load(id))!)).title).toBe('Tab A');
    await b.forkCurrent(); expect(b.getSnapshot().store.getSnapshot().document.documentId).not.toBe(id);
    expect((await repo.list()).map((project) => project.title).sort()).toEqual(['Tab A', 'Tab B (bản sao)']); a.dispose(); b.dispose();
  });
  it('restores checkpoints as new durable versions, retaining the state before recovery', async () => {
    const { repo } = setup(), session = new ProjectSession(repo, seed, 10000); await session.initialize();
    session.getSnapshot().store.execute([{ type: 'rename', title: 'Mới' }]); await session.flush();
    await session.restoreCheckpoint(1); expect(session.getSnapshot().version).toBe(3); expect(session.getSnapshot().store.getSnapshot().document.title).toBe('Tiếng Việt');
    expect((await session.checkpoints()).map((item) => item.version)).toEqual([3, 2, 1]); session.dispose();
  });
  it('initialization failure shows error rather than a fake saved state', async () => {
    const repo = new IndexedDbRepository('unavailable', undefined), session = new ProjectSession(repo, seed, 10000);
    // Force explicit unavailability even on a future test runtime that exposes IndexedDB.
    Object.defineProperty(repo, 'factory', { value: undefined });
    await session.initialize(); expect(session.getSnapshot().status).toBe('error'); expect(session.hasUnsaved()).toBe(true); session.dispose();
  });
});

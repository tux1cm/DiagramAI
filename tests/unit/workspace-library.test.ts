import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDocument, newId } from '@diagramai/diagram-core';
import { IndexedDbRepository, LocalSyncJournal, ProjectSession } from '@diagramai/local-storage';
import { parseShortLink, snapshotHash, SyncApiError, SyncCoordinator, type CloudSnapshot, type DeviceGrant, type PushSnapshot, type SyncClient, type WorkspaceCatalog } from '@diagramai/sync-core';
import { WorkspaceLibrary } from '../../packages/ui/src/workspace/library';
import { SharedLibrary } from '../../packages/ui/src/workspace/shared-library';
import { hasPendingCloud, synchronizeAll } from '../../packages/ui/src/cloud/manual-sync';

function fakeCloud() {
  const catalog: WorkspaceCatalog = { id: newId(), folders: [], drawings: [] };
  const bindings = new Map<string, { credentials: DeviceGrant; snapshot: CloudSnapshot }>();
  const deleted: { kind: 'project' | 'drawing'; id: string }[] = [];
  let unavailable = false, loseCreateAck = false, creates = 0;
  const api = {
    async workspaceChanges() { if (unavailable) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); return { deleted: structuredClone(deleted) }; },
    async workspaceDeleteItem(_: unknown, kind: 'project' | 'drawing', id: string, input: { drawings: { id: string; revision: number }[] }) {
      if (unavailable) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE');
      if (deleted.some((item) => item.kind === kind && item.id === id)) return;
      const affected = catalog.drawings.filter((item) => kind === 'project' ? item.folderId === id : item.id === id);
      if (affected.length !== input.drawings.length || affected.some((item) => !input.drawings.some((expected) => expected.id === item.id && expected.revision === bindings.get(item.id)!.snapshot.revision))) throw new SyncApiError(409, 'DELETE_CHANGED');
      deleted.push({ kind, id }, ...affected.map((item) => ({ kind: 'drawing' as const, id: item.id })));
      catalog.drawings = catalog.drawings.filter((item) => !affected.includes(item));
      if (kind === 'project') catalog.folders = catalog.folders.filter((item) => item.id !== id);
      for (const item of affected) bindings.delete(item.id);
    },
    async createWorkspace(access: { id: string }) { if (unavailable) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); catalog.id = access.id; },
    async workspaceCatalog() { if (unavailable) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); return structuredClone(catalog); },
    async workspaceFolder(_: unknown, folder: { id: string; title: string }) { if (unavailable) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); if (!catalog.folders.some((item) => item.id === folder.id)) catalog.folders.push(folder); return folder; },
    async workspaceCreateDrawing(_: unknown, input: { id: string; folderId: string; project: { document: CloudSnapshot['document']; hash: string } }) {
      if (unavailable) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE');
      if (!bindings.has(input.id)) {
        creates++;
        const binding = { credentials: { projectId: input.id, deviceId: newId(), token: `dai_device_v1_${'b'.repeat(43)}`, scope: 'owner' as const }, snapshot: { projectId: input.id, document: input.project.document, revision: 1, hash: input.project.hash, updatedAt: new Date().toISOString() } };
        bindings.set(input.id, binding); catalog.drawings.push({ id: input.id, folderId: input.folderId, title: input.project.document.title, revision: 1 });
      }
      if (loseCreateAck) { loseCreateAck = false; throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); }
      return structuredClone(bindings.get(input.id)!);
    },
    async workspaceDrawing(_: unknown, id: string) { return structuredClone(bindings.get(id)!); },
    async pull(id: string, _: string, after: number) { const snapshot = bindings.get(id)!.snapshot; return snapshot.revision > after ? structuredClone(snapshot) : null; },
    async push(id: string, _: string, pending: PushSnapshot) {
      const binding = bindings.get(id)!; if (binding.snapshot.revision !== pending.baseRevision) throw new SyncApiError(409, 'REVISION_CONFLICT');
      binding.snapshot = { ...binding.snapshot, document: pending.document, hash: pending.hash, revision: pending.baseRevision + 1 };
      return { acceptedRevision: binding.snapshot.revision, hash: pending.hash };
    },
  } as unknown as SyncClient;
  return { api, catalog, bindings, unavailable: (value: boolean) => { unavailable = value; }, loseCreateAck: () => { loseCreateAck = true; }, creates: () => creates };
}
async function local(api: SyncClient, factory = new IDBFactory(), name = newId()) {
  const repo = new IndexedDbRepository(name, factory), session = new ProjectSession(repo, () => createDocument('P5 fixture local'));
  await session.initialize(); const journal = new LocalSyncJournal(repo);
  const coordinator = new SyncCoordinator({ link: (id) => journal.link(id), stage: (id) => journal.stage(id), credential: (id) => journal.credential(id), acknowledge: (...args) => journal.acknowledge(...args), conflict: (...args) => journal.conflict(...args), receive: (id, snapshot) => session.receiveExternal(id, () => journal.receive(id, snapshot)) }, api,
    async (id) => { if (session.getSnapshot().store.getSnapshot().document.documentId === id) await session.flush(); }, () => true);
  const library = new WorkspaceLibrary(session, api, (id) => coordinator.synchronize(id, true)); await library.initialize();
  return { repo, session, library, factory, name };
}
describe('workspace catalog → P5 journal recovery boundary', () => {
  it('persists alias identity before publication and reuses it after lost ACK/restart, never showing an unacknowledged link', async () => {
    const cloud = fakeCloud(), a = await local(cloud.api); await a.library.create();
    const requests: { id: string; code: string }[] = [];
    cloud.api.createShortLink = async (_, input) => { requests.push(input); throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); };
    await expect(a.library.shareLink('https://example.com/')).rejects.toThrow();
    const state = (await a.repo.workspaceRead())!, alias = state.shortLinks![0];
    expect(alias.published).toBe(false); expect(requests).toHaveLength(1);
    expect(await a.repo.syncCredential(alias.id)).toBe(`dai_link_v1_${requests[0].code}`);
    a.session.dispose();
    cloud.api.createShortLink = async (_, input) => { requests.push(input); };
    const reopened = await local(cloud.api, a.factory, a.name);
    const url = await reopened.library.shareLink('https://example.com/');
    expect(requests[1]).toEqual(requests[0]); expect(parseShortLink(url)?.code).toBe(requests[0].code);
    expect((await reopened.repo.workspaceRead())!.shortLinks![0].published).toBe(true);
    await reopened.library.shareLink('https://example.com/'); expect(requests).toHaveLength(2); reopened.session.dispose();
  });
  it('deletes with confirmation revisions, retains offline edits/conflict branches and never republishes retired IDs', async () => {
    const cloud = fakeCloud(), a = await local(cloud.api); await a.library.create();
    const state = (await a.repo.workspaceRead())!, access = { id: state.id, key: (await a.repo.syncCredential(state.id))! };
    const b = await local(cloud.api); await b.library.connect(access);
    const mapping = (await b.repo.workspaceRead())!.drawings[0], journal = new LocalSyncJournal(b.repo);
    await b.session.openProject(mapping.localId);
    b.session.getSnapshot().store.execute([{ type: 'rename', title: 'Unsent offline branch' }]); await b.session.flush();
    const remote = structuredClone(cloud.bindings.get(mapping.cloudId)!.snapshot);
    remote.document.title = 'Conflicting remote branch'; remote.revision++;
    remote.hash = await snapshotHash(remote.document);
    await journal.conflict(mapping.localId, remote);
    const preview = await a.library.previewDelete('project', state.selectedFolderId);
    await a.library.deleteItem(preview); await b.library.synchronize(true);
    expect((await b.repo.workspaceRead())!.folders).toHaveLength(0);
    expect((await b.repo.workspaceRead())!.drawings).toHaveLength(0);
    expect(await journal.link(mapping.localId)).toBeNull();
    expect((await b.repo.list()).map((item) => item.title)).toEqual(expect.arrayContaining(['Unsent offline branch', 'Conflicting remote branch (cloud trước xóa)']));
    const count = cloud.creates(); await b.library.synchronize(true); expect(cloud.creates()).toBe(count);
    expect(await hasPendingCloud(b.session)).toBe(false);
    const c = await local(cloud.api); await c.library.connect(access);
    expect((await c.repo.workspaceRead())!.folders).toHaveLength(0);
    a.session.dispose(); b.session.dispose(); c.session.dispose();
  });
  it('refuses changed membership/revisions and retries deletion after a lost ACK without dropping local copies', async () => {
    const cloud = fakeCloud(), a = await local(cloud.api); await a.library.create();
    const state = (await a.repo.workspaceRead())!, preview = await a.library.previewDelete('project', state.selectedFolderId);
    await a.library.createDrawing('Added after confirmation'); await a.library.synchronize(true);
    await expect(a.library.deleteItem(preview)).rejects.toMatchObject({ code: 'DELETE_CHANGED' });
    const fresh = await a.library.previewDelete('project', state.selectedFolderId), remove = cloud.api.workspaceDeleteItem.bind(cloud.api);
    cloud.api.workspaceDeleteItem = async (...args) => { await remove(...args); throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); };
    await expect(a.library.deleteItem(fresh)).rejects.toThrow();
    expect((await a.repo.workspaceRead())!.drawings.length).toBeGreaterThan(0);
    cloud.api.workspaceDeleteItem = remove; await a.library.deleteItem(fresh);
    expect((await a.repo.workspaceRead())!.drawings).toHaveLength(0);
    expect((await a.repo.list()).map((item) => item.title)).toContain('Added after confirmation'); a.session.dispose();
  });
  it('explicitly switches to the Web workspace, archives the Desktop catalog/queue/key atomically, and can restore it', async () => {
    const webCloud = fakeCloud(), deskCloud = fakeCloud(), web = await local(webCloud.api), desk = await local(deskCloud.api);
    await web.library.create(); await web.library.createDrawing('Web shared drawing'); await web.library.synchronize(true);
    await desk.library.create(); await desk.library.createDrawing('Desktop unsent drawing');
    const old = (await desk.repo.workspaceRead())!, key = (await desk.repo.syncCredential(old.id))!;
    const webState = (await web.repo.workspaceRead())!, webAccess = { id: webState.id, key: (await web.repo.syncCredential(webState.id))! };
    const target = new WorkspaceLibrary(desk.session, webCloud.api, async () => {}); await target.initialize();
    await expect(target.connect(webAccess)).rejects.toThrow('xác nhận');
    expect((await desk.repo.workspaceRead())?.id).toBe(old.id);
    await expect(target.connect({ ...webAccess, key: 'bad-key' }, true)).rejects.toThrow();
    expect((await desk.repo.workspaceRead())?.id).toBe(old.id);
    expect(await desk.repo.workspaceArchives()).toHaveLength(0);
    await target.connect(webAccess, true);
    expect((await desk.repo.workspaceRead())?.id).toBe(webState.id);
    expect(await desk.repo.workspaceArchives()).toEqual([old]);
    expect(await desk.repo.syncCredential(old.id)).toBe(key);
    expect((await desk.repo.list()).map((item) => item.title)).toEqual(expect.arrayContaining(['Desktop unsent drawing', 'Web shared drawing']));
    expect(webCloud.catalog.drawings.map((item) => item.title)).not.toContain('Desktop unsent drawing');
    expect(await hasPendingCloud(desk.session)).toBe(false); // archived pending is NOT uploaded into the active scope
    const back = new WorkspaceLibrary(desk.session, deskCloud.api, async () => {}); await back.initialize();
    await back.restoreWorkspace(old.id);
    expect((await desk.repo.workspaceRead())?.id).toBe(old.id);
    expect((await desk.repo.workspaceRead())?.drawings.map((item) => item.localId)).toEqual(old.drawings.map((item) => item.localId));
    expect(deskCloud.catalog.drawings.map((item) => item.title)).toContain('Desktop unsent drawing');
    expect((await desk.repo.workspaceArchives())[0].id).toBe(webState.id);
    web.session.dispose(); desk.session.dispose();
  });
  it('creates Projects/drawings locally on BOTH platforms and exchanges them only on explicit full sync', async () => {
    const cloud = fakeCloud(), web = await local(cloud.api); await web.library.create();
    const desk = await local(cloud.api), state = (await web.repo.workspaceRead())!;
    await desk.library.connect({ id: state.id, key: (await web.repo.syncCredential(state.id))! });
    const before = cloud.creates();
    await web.library.createFolder('Web Project'); await web.library.createDrawing('Web drawing');
    await desk.library.createFolder('Desktop Project'); await desk.library.createDrawing('Desktop drawing');
    expect(cloud.creates()).toBe(before);
    expect(cloud.catalog.folders.map((item) => item.title)).not.toContain('Web Project');
    expect(await hasPendingCloud(web.session)).toBe(true); expect(await hasPendingCloud(desk.session)).toBe(true);
    await web.library.synchronize(true); await desk.library.synchronize(true); await web.library.synchronize(true);
    for (const device of [web, desk]) {
      expect((await device.repo.workspaceRead())!.folders.map((item) => item.title)).toEqual(expect.arrayContaining(['Web Project', 'Desktop Project']));
      expect((await device.repo.list()).map((item) => item.title)).toEqual(expect.arrayContaining(['Web drawing', 'Desktop drawing']));
      expect(await hasPendingCloud(device.session)).toBe(false);
      device.session.dispose();
    }
  });
  it('still discovers remote drawings when an unrelated local drawing fails to publish', async () => {
    const cloud = fakeCloud(), web = await local(cloud.api); await web.library.create();
    const desk = await local(cloud.api), state = (await web.repo.workspaceRead())!;
    await desk.library.connect({ id: state.id, key: (await web.repo.syncCredential(state.id))! });
    await web.library.createDrawing('New from Web'); await web.library.synchronize(true);
    await desk.library.createDrawing('Blocked local drawing');
    const create = cloud.api.workspaceCreateDrawing.bind(cloud.api);
    cloud.api.workspaceCreateDrawing = async (access, input) => {
      if (input.project.document.title === 'Blocked local drawing') throw new SyncApiError(409, 'CLOUD_PROJECT_LIMIT');
      return create(access, input);
    };
    await expect(desk.library.synchronize(true)).rejects.toThrow();
    expect((await desk.repo.list()).map((item) => item.title)).toContain('New from Web');
    expect(await hasPendingCloud(desk.session)).toBe(true);
    web.session.dispose(); desk.session.dispose();
  });
  it('exit/full-sync rejects unacknowledged work instead of reporting success, and retains the local queue', async () => {
    const cloud = fakeCloud(), a = await local(cloud.api); await a.library.create();
    await a.library.createDrawing('Needs ACK');
    const shared = new SharedLibrary(a.session, cloud.api, async () => {});
    cloud.unavailable(true);
    await expect(synchronizeAll(a.session, a.library, shared, async () => {})).rejects.toThrow();
    expect(await hasPendingCloud(a.session)).toBe(true);
    expect((await a.repo.list()).map((item) => item.title)).toContain('Needs ACK');
    cloud.unavailable(false);
    await synchronizeAll(a.session, a.library, shared, async () => {});
    expect(await hasPendingCloud(a.session)).toBe(false); a.session.dispose();
  });
  it('persists the new workspace key/header before network create and resumes the same IDs after offline restart', async () => {
    const cloud = fakeCloud(), a = await local(cloud.api); cloud.unavailable(true);
    await a.library.perform(() => a.library.create());
    const before = (await a.repo.workspaceRead())!, key = await a.repo.syncCredential(before.id);
    expect(before.provisionPending).toBe(true); expect(key?.startsWith('dai_workspace_v1_')).toBe(true);
    const documentId = a.session.getSnapshot().store.getSnapshot().document.documentId;
    expect(JSON.stringify(await a.repo.revisions(documentId)).includes(key!)).toBe(false);
    a.session.dispose(); cloud.unavailable(false);
    const reopened = await local(cloud.api, a.factory, a.name); await reopened.library.synchronize();
    expect((await reopened.repo.workspaceRead())?.id).toBe(before.id); expect(cloud.creates()).toBe(1);
    expect((await reopened.repo.workspaceRead())?.drawings[0].published).toBe(true); reopened.session.dispose();
  });
  it('a lost drawing-create ACK plus newer local edits retries one drawing and stages the newer branch instead of overwriting it', async () => {
    const cloud = fakeCloud(), a = await local(cloud.api); cloud.loseCreateAck();
    await a.library.perform(() => a.library.create()); expect(cloud.creates()).toBe(1);
    a.session.getSnapshot().store.execute([{ type: 'rename', title: 'P5 fixture newer local edit' }]); await a.session.flush();
    await a.library.synchronize(); expect(cloud.creates()).toBe(1);
    const mapping = (await a.repo.workspaceRead())!.drawings[0], remote = cloud.bindings.get(mapping.cloudId)!;
    expect(remote.snapshot.document.title).toBe('P5 fixture newer local edit'); expect(remote.snapshot.revision).toBe(2);
    expect(a.session.getSnapshot().store.getSnapshot().document.title).toBe('P5 fixture newer local edit'); a.session.dispose();
  });
  it('a link opens the complete catalog on another local store without uploading or replacing its pre-existing diagram', async () => {
    const cloud = fakeCloud(), a = await local(cloud.api); await a.library.create();
    const b = await local(cloud.api), localId = b.session.getSnapshot().store.getSnapshot().document.documentId;
    const localBefore = await b.repo.load(localId), state = (await a.repo.workspaceRead())!, key = (await a.repo.syncCredential(state.id))!;
    await b.library.connect({ id: state.id, key });
    expect(await b.repo.load(localId)).toEqual(localBefore); expect((await b.repo.workspaceRead())?.ignoredLocalIds).toContain(localId);
    expect(await b.repo.list()).toHaveLength(2); expect(cloud.creates()).toBe(1);
    await b.library.synchronize(); expect(await b.repo.list()).toHaveLength(2); a.session.dispose(); b.session.dispose();
  });
});

import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDocument, newId } from '@diagramai/diagram-core';
import { IndexedDbRepository, LocalSyncJournal, ProjectSession } from '@diagramai/local-storage';
import { SyncApiError, SyncCoordinator, type CloudSnapshot, type DeviceGrant, type PushSnapshot, type SyncClient, type WorkspaceCatalog } from '@diagramai/sync-core';
import { WorkspaceLibrary } from '../../packages/ui/src/workspace/library';
import { SharedLibrary } from '../../packages/ui/src/workspace/shared-library';
import { hasPendingCloud, synchronizeAll } from '../../packages/ui/src/cloud/manual-sync';

function fakeCloud() {
  const catalog: WorkspaceCatalog = { id: newId(), folders: [], drawings: [] };
  const bindings = new Map<string, { credentials: DeviceGrant; snapshot: CloudSnapshot }>();
  let unavailable = false, loseCreateAck = false, creates = 0;
  const api = {
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

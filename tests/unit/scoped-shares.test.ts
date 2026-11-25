import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDocument, newId } from '@diagramai/diagram-core';
import { IndexedDbRepository, LocalSyncJournal, ProjectSession, WorkspaceJournal } from '@diagramai/local-storage';
import { parseShareLink, shareLink, snapshotHash, SyncApiError, SyncCoordinator, type SyncClient, type ShareCatalog } from '@diagramai/sync-core';
import { SharedLibrary } from '../../packages/ui/src/workspace/shared-library';

describe('editable scoped share → durable P5 local boundary', () => {
  it('uses a separate fragment capability and never overwrites workspace/device credentials', async () => {
    const repo = new IndexedDbRepository('share-keys', new IDBFactory()), access = { id: newId(), key: `dai_share_v1_${'a'.repeat(43)}` };
    expect(parseShareLink(shareLink('https://tux1cm.github.io/DiagramAI/', access))).toEqual(access);
    expect(() => parseShareLink(`https://example.com/?key=${access.key}`)).toThrow();
    await repo.shareCredentialWrite(access); expect(await repo.syncCredential(access.id)).toBe(access.key);
    await expect(repo.shareCredentialWrite({ ...access, key: `dai_share_v1_${'b'.repeat(43)}` })).rejects.toThrow();
    expect(await repo.workspaceRead()).toBeNull(); expect(await repo.syncCredential(access.id)).toBe(access.key); repo.close();
  });
  it('opens only the returned drawing, keeps the owner workspace separate, remembers access and reopens offline after restart', async () => {
    const factory = new IDBFactory(), repo = new IndexedDbRepository('share-local', factory), session = new ProjectSession(repo, () => createDocument('Own local'));
    await session.initialize(); const ownId = newId(), folderId = newId(), ownKey = `dai_workspace_v1_${'o'.repeat(43)}`;
    await repo.workspaceWrite({ expectedGeneration: null, key: ownKey, state: { id: ownId, generation: 1, provisionPending: false, selectedFolderId: folderId, folders: [{ id: folderId, title: 'My private Project', pending: false }], drawings: [], ignoredLocalIds: [] } });
    const access = { id: newId(), key: `dai_share_v1_${'s'.repeat(43)}` }, assetId = newId(), document = createDocument('Shared drawing');
    const catalog: ShareCatalog = { id: access.id, kind: 'drawing', targetId: assetId, folders: [{ id: newId(), title: 'Shared Project' }], drawings: [] };
    catalog.drawings.push({ id: assetId, folderId: catalog.folders[0].id, title: document.title, revision: 1 });
    const binding = { snapshot: { projectId: assetId, document, hash: await snapshotHash(document), revision: 1, updatedAt: new Date().toISOString() }, credentials: { projectId: assetId, deviceId: newId(), token: `dai_device_v1_${'e'.repeat(43)}`, scope: 'editor' as const } };
    let offline = false, catalogCalls = 0;
    const client = { async shareCatalog() { catalogCalls++; if (offline) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); return catalog; }, async shareDrawing() { return binding; }, async pull() { if (offline) throw new SyncApiError(0, 'NETWORK_UNAVAILABLE'); return null; } } as unknown as SyncClient;
    const make = (current: ProjectSession) => {
      const journal = new LocalSyncJournal(current.repository), coordinator = new SyncCoordinator(journal, client, () => current.flush(), () => true);
      return new SharedLibrary(current, client, (id, force) => coordinator.synchronize(id, force));
    };
    const library = make(session); await library.connect(access.id, access.key);
    const sharedId = library.getSnapshot().mappings[0].localId;
    expect(session.getSnapshot().store.getSnapshot().document.title).toBe('Shared drawing');
    expect((await repo.workspaceRead())?.id).toBe(ownId); expect(await repo.syncCredential(ownId)).toBe(ownKey);
    expect((await repo.workspaceRead())?.ignoredLocalIds).toContain(sharedId);
    expect(JSON.stringify(await repo.shareCatalogRead(access.id)).includes(access.key)).toBe(false);
    expect(JSON.stringify(await repo.revisions(sharedId)).includes(access.key)).toBe(false);
    await new WorkspaceJournal(repo).update((state) => state); session.dispose(); offline = true;
    const reopened = new IndexedDbRepository('share-local', factory), restarted = new ProjectSession(reopened, () => createDocument());
    const callsBeforeRestart = catalogCalls;
    const again = make(restarted); await again.connect(access.id);
    expect(catalogCalls).toBe(callsBeforeRestart);
    expect(again.getSnapshot().mappings).toHaveLength(1); expect(restarted.getSnapshot().store.getSnapshot().document.title).toBe('Shared drawing');
    expect((await reopened.list()).length).toBe(2); restarted.dispose();
  });
});

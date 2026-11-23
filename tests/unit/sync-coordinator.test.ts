import { describe, expect, it, vi } from 'vitest';
import { createDocument, newId } from '@diagramai/diagram-core';
import { snapshotHash, SyncApiError, SyncCoordinator, type CloudSnapshot, type SyncLink, type SyncPersistence } from '@diagramai/sync-core';

async function fixture() {
  const document = createDocument('Nhánh local'), projectId = newId(), hash = await snapshotHash(document);
  const pending = { document, hash, operationId: newId(), baseRevision: 1, localVersion: 2 };
  let link: SyncLink = { documentId: document.documentId, cloudDocumentId: document.documentId, projectId, deviceId: newId(), baseRevision: 1, syncedHash: '0'.repeat(64), pending, conflict: null };
  const storage: SyncPersistence = {
    link: vi.fn(async () => structuredClone(link)), stage: vi.fn(async () => structuredClone(link)), credential: vi.fn(async () => 'ephemeral-test-token'),
    acknowledge: vi.fn(async (_id, operationId, revision, acceptedHash) => { if (link.pending?.operationId === operationId) link = { ...link, baseRevision: revision, syncedHash: acceptedHash, pending: null }; }),
    receive: vi.fn(async () => 'applied' as const), conflict: vi.fn(async (_id, snapshot) => { link = { ...link, conflict: snapshot }; }),
  };
  const client = { push: vi.fn(async () => ({ acceptedRevision: 2, hash })), pull: vi.fn(async (): Promise<CloudSnapshot | null> => null) };
  const flush = vi.fn(async () => {}), safe = vi.fn(() => true);
  let now = 1000;
  const coordinator = new SyncCoordinator(storage, client, flush, safe, () => now);
  return { document, pending, storage, client, coordinator, flush, safe, setTime: (value: number) => { now = value; }, link: () => link, setLink: (value: SyncLink) => { link = value; } };
}
describe('P5 durable sync coordinator', () => {
  it('flushes local before upload and only reports synced after durable acknowledgement', async () => {
    const f = await fixture(); let release!: () => void;
    const original = f.storage.acknowledge; f.storage.acknowledge = vi.fn(async (...args: Parameters<SyncPersistence['acknowledge']>) => { await new Promise<void>((resolve) => { release = resolve; }); await original(...args); });
    const run = f.coordinator.synchronize(f.document.documentId);
    await vi.waitFor(() => expect(f.storage.acknowledge).toHaveBeenCalled());
    expect(f.flush).toHaveBeenCalledBefore(f.client.push);
    expect(f.coordinator.getSnapshot().status).toBe('syncing'); expect(f.link().pending).not.toBeNull();
    release(); await run;
    expect(f.coordinator.getSnapshot()).toMatchObject({ status: 'synced', revision: 2 }); expect(f.link().pending).toBeNull();
  });
  it('offline retry preserves the exact pending operation/body and honors backoff', async () => {
    const f = await fixture(); f.client.push.mockRejectedValueOnce(new SyncApiError(0, 'NETWORK_UNAVAILABLE'));
    await f.coordinator.synchronize(f.document.documentId);
    expect(f.coordinator.getSnapshot()).toMatchObject({ status: 'offline', retryAt: 3000 }); expect(f.link().pending).toEqual(f.pending);
    await f.coordinator.synchronize(f.document.documentId); expect(f.client.push).toHaveBeenCalledTimes(1);
    f.setTime(3000); await f.coordinator.synchronize(f.document.documentId);
    expect(f.client.push.mock.calls[1]).toEqual(f.client.push.mock.calls[0]); expect(f.coordinator.getSnapshot().status).toBe('synced');
  });
  it('makes a durable conflict copy before displaying conflict and never overwrites by receiving', async () => {
    const f = await fixture(), cloud = { projectId: f.link().projectId, revision: 3, document: { ...f.document, title: 'Nhánh cloud' }, hash: 'a'.repeat(64), updatedAt: new Date().toISOString() };
    f.client.push.mockRejectedValueOnce(new SyncApiError(409, 'REVISION_CONFLICT')); f.client.pull.mockResolvedValueOnce(cloud);
    await f.coordinator.synchronize(f.document.documentId);
    expect(f.storage.conflict).toHaveBeenCalledWith(f.document.documentId, cloud); expect(f.storage.receive).not.toHaveBeenCalled();
    expect(f.link().pending).toEqual(f.pending); expect(f.coordinator.getSnapshot().status).toBe('conflict');
    await f.coordinator.synchronize(f.document.documentId); expect(f.client.push).toHaveBeenCalledTimes(1);
  });
  it('storage failure cannot show synced/conflict success; revocation never deletes local pending data', async () => {
    const f = await fixture(); f.storage.acknowledge = vi.fn(async () => { throw new Error('Disk full'); });
    await f.coordinator.synchronize(f.document.documentId); expect(f.coordinator.getSnapshot().status).toBe('error'); expect(f.link().pending).toEqual(f.pending);
    f.client.push.mockRejectedValueOnce(new SyncApiError(401, 'ACCESS_DENIED'));
    await f.coordinator.synchronize(f.document.documentId, true); expect(f.coordinator.getSnapshot().status).toBe('revoked'); expect(f.link().pending).toEqual(f.pending);
  });
  it('does not synchronize or receive while a pointer/text draft is unsafe; coalesces concurrent ticks', async () => {
    const f = await fixture(); f.safe.mockReturnValue(false);
    await f.coordinator.synchronize(f.document.documentId); expect(f.flush).not.toHaveBeenCalled(); expect(f.client.push).not.toHaveBeenCalled(); expect(f.coordinator.getSnapshot().status).toBe('pending');
    f.safe.mockReturnValue(true);
    await Promise.all([f.coordinator.synchronize(f.document.documentId), f.coordinator.synchronize(f.document.documentId)]);
    expect(f.client.push).toHaveBeenCalledTimes(1);
  });
});

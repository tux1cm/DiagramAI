import { newId, parseDocument, type DiagramDocument } from '@diagramai/diagram-core';
import { DeviceGrantSchema, SnapshotSchema, snapshotHash, type CloudSnapshot, type DeviceGrant, type SyncPersistence } from '@diagramai/sync-core';
import { decodeRecord, LocalConflict, prepareRecord, type SaveRequest, type StoredProject } from './types';
import type { CloudBinding, LocalSyncLink, SyncBackend, SyncRead } from './sync-types';

export const cloudDocument = (document: DiagramDocument, link: Pick<LocalSyncLink, 'cloudDocumentId'>) => parseDocument({ ...document, documentId: link.cloudDocumentId });
async function recordFor(document: DiagramDocument, version: number, operationId = newId()): Promise<StoredProject> {
  return { ...await prepareRecord({ document, expectedVersion: version === 1 ? null : version - 1, operationId }), version, savedAt: Date.now() };
}
async function staged(link: LocalSyncLink, record: StoredProject): Promise<LocalSyncLink> {
  if (link.pending || link.conflict) return link;
  const document = cloudDocument(await decodeRecord(record), link), hash = await snapshotHash(document);
  if (hash === link.syncedHash) return link;
  return { ...link, pending: { document, hash, operationId: newId(), baseRevision: link.baseRevision, localVersion: record.version } };
}

// The same journal algorithms are used on IndexedDB and SQLite. CAS checks in
// syncCommit make the read/hash/commit sequence safe across tabs and processes.
export async function saveWithSync(backend: SyncBackend, request: SaveRequest): Promise<StoredProject> {
  const prepared = await prepareRecord(request);
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await backend.syncRead(prepared.documentId), previous = current.record;
    if (previous?.operationId === request.operationId && previous.hash === prepared.hash) return previous;
    if ((previous?.version ?? null) !== request.expectedVersion) throw new LocalConflict();
    const record = { ...prepared, version: (previous?.version ?? 0) + 1, savedAt: Date.now() };
    const link = current.link ? { ...await staged(current.link, record), generation: current.link.generation + 1 } : null;
    try {
      await backend.syncCommit({ documentId: record.documentId, expectedVersion: request.expectedVersion, expectedGeneration: current.link?.generation ?? null, records: [record], link });
      return record;
    } catch (error) { if (!(error instanceof LocalConflict) || attempt === 5) throw error; }
  }
  throw new LocalConflict();
}

export class LocalSyncJournal implements SyncPersistence {
  constructor(readonly backend: SyncBackend) {}
  async link(id: string) { return (await this.backend.syncRead(id)).link; }
  async credential(id: string) { const link = await this.link(id); return link ? this.backend.syncCredential(link.deviceId) : null; }
  private async mutate<T>(id: string, work: (current: SyncRead) => Promise<{ value: T; link: LocalSyncLink | null; records?: StoredProject[]; credential?: DeviceGrant } | { value: T }>): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await this.backend.syncRead(id), change = await work(current);
      if (!('link' in change)) return change.value;
      const link = change.link ? { ...change.link, generation: (current.link?.generation ?? 0) + 1 } : null;
      try {
        await this.backend.syncCommit({ documentId: id, expectedVersion: current.record?.version ?? null, expectedGeneration: current.link?.generation ?? null, records: change.records ?? [], link, credential: change.credential });
        return change.value;
      } catch (error) { if (!(error instanceof LocalConflict) || attempt === 5) throw error; }
    }
    throw new LocalConflict();
  }
  async stage(id: string): Promise<LocalSyncLink | null> {
    await this.mutate(id, async ({ record, link }) => {
      if (!record || !link) return { value: null };
      const next = await staged(link, record);
      return next === link ? { value: null } : { value: null, link: next };
    });
    return this.link(id);
  }
  async bindExisting(id: string, binding: CloudBinding) {
    const snapshot = SnapshotSchema.parse(binding.snapshot), credentials = DeviceGrantSchema.parse(binding.credentials);
    if (snapshot.projectId !== credentials.projectId || await snapshotHash(snapshot.document) !== snapshot.hash) throw new Error('Bản cloud/quyền thiết bị không khớp.');
    await this.mutate(id, async ({ record, link }) => {
      if (!record) throw new Error('Sơ đồ local không còn tồn tại. Hãy giữ mã khôi phục để mở cloud trên thiết bị khác.');
      if (link) throw new Error('Sơ đồ đã liên kết cloud. Không thay quyền hoặc ghi đè liên kết tự động.');
      const next: LocalSyncLink = { documentId: id, projectId: snapshot.projectId, deviceId: credentials.deviceId, cloudDocumentId: snapshot.document.documentId, baseRevision: snapshot.revision, syncedHash: snapshot.hash, pending: null, conflict: null, generation: 1, conflictCopyId: null, conflictCopyHash: null };
      return { value: null, link: await staged(next, record), credential: credentials };
    });
  }
  async join(binding: CloudBinding): Promise<string> {
    const snapshot = SnapshotSchema.parse(binding.snapshot), credentials = DeviceGrantSchema.parse(binding.credentials);
    if (snapshot.projectId !== credentials.projectId || await snapshotHash(snapshot.document) !== snapshot.hash) throw new Error('Bản cloud/quyền thiết bị không khớp.');
    const id = newId(), document = parseDocument({ ...snapshot.document, documentId: id });
    const link: LocalSyncLink = { documentId: id, projectId: snapshot.projectId, deviceId: credentials.deviceId, cloudDocumentId: snapshot.document.documentId, baseRevision: snapshot.revision, syncedHash: snapshot.hash, pending: null, conflict: null, generation: 1, conflictCopyId: null, conflictCopyHash: null };
    await this.backend.syncCommit({ documentId: id, expectedVersion: null, expectedGeneration: null, records: [await recordFor(document, 1)], link, credential: credentials });
    return id;
  }
  async acknowledge(id: string, operationId: string, revision: number, hash: string) {
    await this.mutate(id, async ({ record, link }) => {
      if (!record || !link) return { value: null };
      if (link.pending?.operationId !== operationId) {
        if (link.baseRevision >= revision) return { value: null }; // another tab already committed this acknowledgement
        throw new LocalConflict();
      }
      if (hash !== link.pending.hash || revision !== link.pending.baseRevision + 1) throw new Error('Server chưa xác nhận đúng operation đang chờ.');
      const next = { ...link, baseRevision: revision, syncedHash: hash, pending: null };
      return { value: null, link: await staged(next, record) };
    });
  }
  private async checkRemote(link: LocalSyncLink, snapshot: CloudSnapshot) {
    const checked = SnapshotSchema.parse(snapshot);
    if (checked.projectId !== link.projectId || checked.document.documentId !== link.cloudDocumentId || await snapshotHash(checked.document) !== checked.hash) throw new Error('Bản cloud không đúng sơ đồ hoặc checksum.');
    if (checked.revision < link.baseRevision || checked.revision === link.baseRevision && checked.hash !== link.syncedHash) throw new Error('Revision cloud không hợp lệ; không ghi đè local.');
    return checked;
  }
  private async conflictChange(record: StoredProject, link: LocalSyncLink, snapshot: CloudSnapshot) {
    const local = await decodeRecord(record), hash = await snapshotHash(cloudDocument(local, link));
    const records: StoredProject[] = [];
    if (hash !== link.conflictCopyHash || !link.conflictCopyId) {
      const copy = parseDocument({ ...local, documentId: newId(), title: `${local.title.slice(0, 80)} (xung đột local)` });
      const saved = await recordFor(copy, 1); records.push(saved);
      link = { ...link, conflictCopyId: saved.documentId, conflictCopyHash: hash };
    }
    return { records, link: { ...link, conflict: snapshot } };
  }
  async conflict(id: string, snapshot: CloudSnapshot) {
    await this.mutate(id, async ({ record, link }) => {
      if (!record || !link) throw new LocalConflict();
      const checked = await this.checkRemote(link, snapshot);
      return { value: null, ...await this.conflictChange(record, link, checked) };
    });
  }
  async receive(id: string, snapshot: CloudSnapshot): Promise<'applied' | 'unchanged' | 'conflict'> {
    return this.mutate<'applied' | 'unchanged' | 'conflict'>(id, async ({ record, link }) => {
      if (!record || !link) throw new LocalConflict();
      const checked = await this.checkRemote(link, snapshot);
      if (checked.revision === link.baseRevision) return { value: 'unchanged' };
      const local = await decodeRecord(record);
      if (link.pending || link.conflict || await snapshotHash(cloudDocument(local, link)) !== link.syncedHash) return { value: 'conflict', ...await this.conflictChange(record, link, checked) };
      const document = parseDocument({ ...checked.document, documentId: id });
      return { value: 'applied', records: [await recordFor(document, record.version + 1)], link: { ...link, baseRevision: checked.revision, syncedHash: checked.hash } };
    });
  }
  async useCloud(id: string): Promise<string | null> {
    return this.mutate(id, async ({ record, link }) => {
      if (!record || !link?.conflict) throw new Error('Không có xung đột để xử lý.');
      // Always preserve a fresh copy in the very same transaction as replacement.
      // A previously displayed conflict copy may have been deleted in another tab.
      const checked = await this.checkRemote(link, link.conflict), preserved = await this.conflictChange(record, { ...link, conflictCopyId: null, conflictCopyHash: null }, checked);
      return { value: preserved.link.conflictCopyId, records: [...preserved.records, await recordFor(parseDocument({ ...checked.document, documentId: id }), record.version + 1)], link: { ...preserved.link, baseRevision: checked.revision, syncedHash: checked.hash, pending: null, conflict: null, conflictCopyId: null, conflictCopyHash: null } };
    });
  }
  async unlink(id: string) { await this.mutate(id, async () => ({ value: null, link: null })); }
}

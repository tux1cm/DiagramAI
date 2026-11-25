import { LocalConflict, prepareRecord, type LocalRepository, type ProjectSummary, type SaveRequest, type StoredProject } from './types';
import { saveWithSync } from './sync-journal';
import type { LocalSyncLink, SyncBackend, SyncCommit, SyncRead } from './sync-types';
import { checkWorkspaceCommit, WorkspaceStateSchema, type WorkspaceCommit, type WorkspaceState } from './workspace';

export class IndexedDbRepository implements LocalRepository, SyncBackend {
  readonly kind = 'indexeddb' as const;
  private database: Promise<IDBDatabase> | null = null;
  constructor(private name = 'diagramai-local-v1', private factory: IDBFactory | undefined = globalThis.indexedDB) {}
  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) { reject(new Error('Trình duyệt không cung cấp IndexedDB. Bản vẽ chỉ ở bộ nhớ.')); return; }
      const request = this.factory.open(this.name, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'documentId' });
        if (!db.objectStoreNames.contains('revisions')) db.createObjectStore('revisions', { keyPath: ['documentId', 'version'] }).createIndex('documentId', 'documentId');
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('sync_outbox')) db.createObjectStore('sync_outbox', { keyPath: 'operationId' });
        if (!db.objectStoreNames.contains('device_credentials')) db.createObjectStore('device_credentials', { keyPath: 'deviceId' });
        if (!db.objectStoreNames.contains('sync_links')) db.createObjectStore('sync_links', { keyPath: 'documentId' });
      };
      request.onerror = () => { this.database = null; reject(new Error('Không mở được IndexedDB. Kiểm tra quyền lưu trữ/private mode.')); };
      request.onblocked = () => { this.database = null; reject(new Error('Kho local bị chặn bởi một tab phiên bản cũ. Hãy đóng tab cũ rồi thử lại.')); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.database = null; }; resolve(db); };
    });
    return this.database;
  }
  private async read<T>(store: string, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly'), request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(new Error('Không đọc được dữ liệu IndexedDB.'));
    });
  }
  async list(): Promise<ProjectSummary[]> {
    const records = await this.read<StoredProject[]>('documents', (store) => store.getAll());
    return records.map(({ documentId, title, version, savedAt, nodeCount, edgeCount }) => ({ documentId, title, version, savedAt, nodeCount, edgeCount })).sort((a, b) => b.savedAt - a.savedAt || a.documentId.localeCompare(b.documentId));
  }
  async load(id: string) { return await this.read<StoredProject | undefined>('documents', (store) => store.get(id)) ?? null; }
  save(request: SaveRequest): Promise<StoredProject> { return saveWithSync(this, request); }
  async syncRead(documentId: string): Promise<SyncRead> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'sync_links', 'sync_outbox'], 'readonly');
      const record = tx.objectStore('documents').get(documentId), link = tx.objectStore('sync_links').get(documentId);
      let result: LocalSyncLink | null = null;
      link.onsuccess = () => {
        const header = link.result as (Omit<LocalSyncLink, 'pending'> & { pendingId: string | null }) | undefined;
        if (!header) return;
        const { pendingId, ...rest } = header; result = { ...rest, pending: null };
        if (pendingId) {
          const pending = tx.objectStore('sync_outbox').get(pendingId);
          pending.onsuccess = () => { if (!pending.result) { tx.abort(); return; } result = { ...rest, pending: pending.result }; };
        }
      };
      tx.oncomplete = () => resolve({ record: record.result ?? null, link: result });
      tx.onabort = () => reject(new Error('Không đọc được trạng thái đồng bộ local. Không ghi đè dữ liệu.'));
    });
  }
  async syncCredential(deviceId: string) { return (await this.read<{ token?: string } | undefined>('device_credentials', (store) => store.get(deviceId)))?.token ?? null; }
  async workspaceRead(): Promise<WorkspaceState | null> {
    const record = await this.read<{ value: unknown } | undefined>('settings', (store) => store.get('workspace-v1'));
    return record ? WorkspaceStateSchema.parse(record.value) : null;
  }
  async workspaceWrite(input: WorkspaceCommit) {
    checkWorkspaceCommit(input); const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['settings', 'device_credentials'], 'readwrite', { durability: 'strict' }); let conflict = false;
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(conflict ? new LocalConflict() : new Error('Chưa ghi được kho trên máy.'));
      const store = tx.objectStore('settings'), current = store.get('workspace-v1');
      current.onsuccess = () => {
        const old = current.result?.value as WorkspaceState | undefined;
        if ((old?.generation ?? null) !== input.expectedGeneration || old && old.id !== input.state.id) { conflict = true; tx.abort(); return; }
        if (!old && !input.key) { tx.abort(); return; }
        if (old && input.key) {
          const previous = tx.objectStore('device_credentials').get(input.state.id);
          previous.onsuccess = () => { if (previous.result?.token !== input.key) { tx.abort(); return; } store.put({ key: 'workspace-v1', value: input.state }); };
        } else {
          store.put({ key: 'workspace-v1', value: input.state });
          if (input.key) tx.objectStore('device_credentials').put({ deviceId: input.state.id, token: input.key });
        }
      };
    });
  }
  async syncCommit(request: SyncCommit): Promise<void> {
    // Hash/schema work is outside the IndexedDB transaction; CAS validates that
    // none of the records or link generations changed while it was computed.
    for (const record of request.records) {
      const prepared = await prepareRecord({ document: JSON.parse(record.payload), expectedVersion: null, operationId: record.operationId });
      if (prepared.hash !== record.hash || prepared.documentId !== record.documentId) throw new Error('Bản ghi local không hợp lệ.');
    }
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'revisions', 'sync_links', 'sync_outbox', 'device_credentials'], 'readwrite', { durability: 'strict' });
      const documents = tx.objectStore('documents'), revisions = tx.objectStore('revisions'), links = tx.objectStore('sync_links'), outbox = tx.objectStore('sync_outbox'), credentials = tx.objectStore('device_credentials');
      let conflict = false;
      const fail = () => { conflict = true; tx.abort(); };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(conflict ? new LocalConflict() : new Error('Không ghi được local/outbox. Dữ liệu trong bộ nhớ được giữ nguyên.'));
      const current = documents.get(request.documentId), currentLink = links.get(request.documentId);
      currentLink.onsuccess = () => {
        const previous = current.result as StoredProject | undefined, oldLink = currentLink.result as (LocalSyncLink & { pendingId: string | null }) | undefined;
        if ((previous?.version ?? null) !== request.expectedVersion || (oldLink?.generation ?? null) !== request.expectedGeneration) { fail(); return; }
        if (request.link && (request.link.documentId !== request.documentId || request.link.generation !== (request.expectedGeneration ?? 0) + 1)) { fail(); return; }
        for (const record of request.records) {
          const expected = record.documentId === request.documentId ? (request.expectedVersion ?? 0) + 1 : 1;
          if (record.version !== expected) { fail(); return; }
          const existing = documents.get(record.documentId);
          existing.onsuccess = () => {
            if (record.documentId !== request.documentId && existing.result) { fail(); return; }
            documents.put(record); revisions.put(record);
            const keys = revisions.index('documentId').getAllKeys(record.documentId);
            keys.onsuccess = () => { for (const key of keys.result.slice(0, Math.max(0, keys.result.length - 20))) revisions.delete(key); };
          };
        }
        if (oldLink?.pendingId && oldLink.pendingId !== request.link?.pending?.operationId) outbox.delete(oldLink.pendingId);
        if (oldLink && oldLink.deviceId !== request.link?.deviceId) credentials.delete(oldLink.deviceId);
        if (request.link) {
          const { pending, ...header } = request.link;
          links.put({ ...header, pendingId: pending?.operationId ?? null });
          if (pending) outbox.put(pending);
        } else links.delete(request.documentId);
        if (request.credential) {
          if (request.credential.deviceId !== request.link?.deviceId || request.credential.projectId !== request.link.projectId) { fail(); return; }
          credentials.put(request.credential);
        }
      };
    });
  }
  async remove(id: string, expectedVersion: number): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'revisions', 'sync_links', 'sync_outbox', 'device_credentials'], 'readwrite', { durability: 'strict' }); let conflict = false;
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(conflict ? new LocalConflict() : new Error('Không xóa được bản lưu local.'));
      const documents = tx.objectStore('documents'), get = documents.get(id);
      get.onsuccess = () => {
        if ((get.result as StoredProject | undefined)?.version !== expectedVersion) { conflict = true; tx.abort(); return; }
        documents.delete(id);
        const links = tx.objectStore('sync_links'), link = links.get(id);
        link.onsuccess = () => {
          if (link.result?.pendingId) tx.objectStore('sync_outbox').delete(link.result.pendingId);
          if (link.result?.deviceId) tx.objectStore('device_credentials').delete(link.result.deviceId);
          links.delete(id);
        };
        const revisions = tx.objectStore('revisions'), cursor = revisions.index('documentId').openKeyCursor(id);
        cursor.onsuccess = () => { if (cursor.result) { revisions.delete(cursor.result.primaryKey); cursor.result.continue(); } };
      };
    });
  }
  async revisions(id: string) {
    const db = await this.open();
    return new Promise<StoredProject[]>((resolve, reject) => {
      const tx = db.transaction('revisions', 'readonly'), get = tx.objectStore('revisions').index('documentId').getAll(id);
      tx.oncomplete = () => resolve((get.result as StoredProject[]).sort((a, b) => b.version - a.version));
      tx.onabort = () => reject(new Error('Không đọc được checkpoint.'));
    });
  }
  async active() { return (await this.read<{ value: string } | undefined>('settings', (store) => store.get('active')))?.value ?? null; }
  async setActive(documentId: string) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ key: 'active', value: documentId });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(new Error('Không ghi được dự án mở gần nhất.'));
    });
  }
  close() { if (this.database) void this.database.then((db) => db.close(), () => { /* No connection was opened. */ }); this.database = null; }
}

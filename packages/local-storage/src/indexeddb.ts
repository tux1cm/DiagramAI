import { LocalConflict, prepareRecord, type LocalRepository, type ProjectSummary, type SaveRequest, type StoredProject } from './types';

export class IndexedDbRepository implements LocalRepository {
  readonly kind = 'indexeddb' as const;
  private database: Promise<IDBDatabase> | null = null;
  constructor(private name = 'diagramai-local-v1', private factory: IDBFactory | undefined = globalThis.indexedDB) {}
  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) { reject(new Error('Trình duyệt không cung cấp IndexedDB. Bản vẽ chỉ ở bộ nhớ.')); return; }
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('documents', { keyPath: 'documentId' });
        db.createObjectStore('revisions', { keyPath: ['documentId', 'version'] }).createIndex('documentId', 'documentId');
        db.createObjectStore('settings', { keyPath: 'key' });
        // Reserved for P5. P4 never queues or pretends to synchronize to cloud.
        db.createObjectStore('sync_outbox', { keyPath: 'operationId' });
        db.createObjectStore('device_credentials', { keyPath: 'deviceId' });
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
  async save(request: SaveRequest): Promise<StoredProject> {
    const prepared = await prepareRecord(request), db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'revisions'], 'readwrite', { durability: 'strict' }), documents = tx.objectStore('documents'), revisions = tx.objectStore('revisions');
      let result: StoredProject, failure: Error | null = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? new Error('Không ghi được IndexedDB (quyền hoặc dung lượng). Bản vẽ vẫn ở bộ nhớ; hãy xuất file dự phòng.'));
      const get = documents.get(prepared.documentId);
      get.onsuccess = () => {
        const previous = get.result as StoredProject | undefined;
        if (previous?.operationId === request.operationId && previous.hash === prepared.hash) { result = previous; return; }
        if ((previous?.version ?? null) !== request.expectedVersion) { failure = new LocalConflict(); tx.abort(); return; }
        result = { ...prepared, version: (previous?.version ?? 0) + 1, savedAt: Date.now() };
        documents.put(result); revisions.put(result);
        const keys = revisions.index('documentId').getAllKeys(prepared.documentId);
        keys.onsuccess = () => { for (const key of keys.result.slice(0, Math.max(0, keys.result.length - 20))) revisions.delete(key); };
      };
    });
  }
  async remove(id: string, expectedVersion: number): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'revisions'], 'readwrite', { durability: 'strict' }); let conflict = false;
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(conflict ? new LocalConflict() : new Error('Không xóa được bản lưu local.'));
      const documents = tx.objectStore('documents'), get = documents.get(id);
      get.onsuccess = () => {
        if ((get.result as StoredProject | undefined)?.version !== expectedVersion) { conflict = true; tx.abort(); return; }
        documents.delete(id);
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

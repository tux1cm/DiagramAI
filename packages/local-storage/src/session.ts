import { createDocument, DiagramStore, newId, parseDocument, serializeDocument, type DiagramDocument } from '@diagramai/diagram-core';
import { decodeRecord, LocalConflict, type LocalRepository, type ProjectSummary, type StoredProject } from './types';

export type SaveStatus = 'loading' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
export interface ProjectSessionSnapshot { store: DiagramStore; projects: ProjectSummary[]; status: SaveStatus; message: string; busy: boolean; version: number | null; savedAt: number | null; epoch: number }
export class ProjectSession {
  private externalUpdating = false;
  isExternalUpdating = () => this.externalUpdating;
  private state: ProjectSessionSnapshot;
  private listeners = new Set<() => void>();
  private savedPayload: string | null = null;
  private seenDocument: DiagramDocument | null = null;
  private seenPayload = '';
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private write: Promise<void> | null = null;
  private initializing: Promise<void> | null = null;
  private paused = false;
  constructor(readonly repository: LocalRepository, private seed: () => DiagramDocument, private debounceMs = 350) {
    this.state = { store: new DiagramStore(seed()), projects: [], status: 'loading', message: '', busy: false, version: null, savedAt: null, epoch: 0 };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<ProjectSessionSnapshot>) {
    if (!Object.entries(patch).some(([key, value]) => this.state[key as keyof ProjectSessionSnapshot] !== value)) return;
    this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener();
  }
  private payload() {
    const document = this.state.store.getSnapshot().document;
    if (document !== this.seenDocument) { this.seenDocument = document; this.seenPayload = serializeDocument(document); }
    return this.seenPayload;
  }
  hasUnsaved = () => Boolean(this.state.store.getSnapshot().interaction) || this.savedPayload !== this.payload();
  private attach(document: DiagramDocument, record: StoredProject | null, message = '') {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.unsubscribe?.(); this.seenDocument = null;
    this.savedPayload = record?.payload ?? null; this.paused = false;
    const store = new DiagramStore(document);
    this.publish({ store, version: record?.version ?? null, savedAt: record?.savedAt ?? null, status: record ? 'saved' : 'dirty', message, epoch: this.state.epoch + 1 });
    this.unsubscribe = store.subscribe(() => this.changed());
    void this.repository.setActive(document.documentId).catch(() => {
      if (this.state.store === store && this.state.status !== 'error' && this.state.status !== 'conflict') this.publish({ message: 'Bản vẽ đã giữ nguyên; không ghi được lựa chọn dự án mở gần nhất.' });
    });
  }
  initialize() {
    this.initializing ??= this.initializeOnce(); return this.initializing;
  }
  private async initializeOnce() {
    try {
      const projects = await this.repository.list(); this.publish({ projects });
      const active = await this.repository.active(), id = projects.find((project) => project.documentId === active)?.documentId ?? projects[0]?.documentId;
      if (!id) { this.attach(this.state.store.getSnapshot().document, null); await this.flush(); return; }
      const record = await this.repository.load(id);
      if (!record) throw new Error('Không tìm thấy bản lưu local.');
      try { this.attach(await decodeRecord(record), record); }
      catch {
        const revisions = await this.repository.revisions(id);
        for (const checkpoint of revisions) {
          try {
            const document = await decodeRecord(checkpoint);
            this.attach(document, null); this.paused = true;
            this.publish({ version: record.version, status: 'error', message: 'Bản lưu chính bị lỗi. Đã mở checkpoint trong bộ nhớ, chưa ghi đè bản cũ. Hãy xuất file hoặc lưu thành sơ đồ mới.' });
            return;
          } catch { /* Try older checkpoints without modifying the corrupted record. */ }
        }
        throw new Error('Bản lưu bị lỗi và chưa đọc được checkpoint. Dữ liệu trên máy chưa bị ghi đè. Hãy mở file dự phòng hoặc kiểm tra kho local.');
      }
    } catch (error) {
      if (!this.unsubscribe) this.attach(this.seed(), null);
      this.fail(error);
    }
  }
  private changed() {
    if (this.externalUpdating) { if (this.hasUnsaved()) this.publish({ status: 'dirty' }); return; }
    if (this.paused) return;
    if (this.write) { this.publish({ status: 'saving' }); return; }
    if (!this.hasUnsaved()) { this.publish({ status: 'saved' }); return; }
    this.publish({ status: this.write ? 'saving' : 'dirty', message: '' });
    if (this.timer) clearTimeout(this.timer);
    if (!this.state.store.getSnapshot().interaction) this.timer = setTimeout(() => { this.timer = null; void this.flush().catch(() => { /* Persistent status already explains the failure. */ }); }, this.debounceMs);
  }
  private fail(error: unknown) {
    this.paused = true;
    this.publish({ status: error instanceof LocalConflict ? 'conflict' : 'error', message: error instanceof Error ? error.message : 'Không lưu được trên máy. Hãy xuất file dự phòng.' });
  }
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    if (this.write) { await this.write; if (this.hasUnsaved()) return this.flush(); return; }
    if (this.paused) throw new Error(this.state.message);
    if (this.state.store.getSnapshot().interaction) throw new Error('Hãy kết thúc hoặc hủy thao tác kéo/sửa kích thước trước khi lưu.');
    if (!this.hasUnsaved()) { this.publish({ status: 'saved', message: '' }); return; }
    const store = this.state.store, document = store.getSnapshot().document, payload = this.payload(), expectedVersion = this.state.version;
    this.publish({ status: 'saving', message: '' });
    this.write = (async () => {
      try {
        const record = await this.repository.save({ document, expectedVersion, operationId: newId() });
        this.savedPayload = payload;
        this.publish({ version: record.version, savedAt: record.savedAt, status: this.hasUnsaved() ? 'dirty' : 'saved' });
        this.publish({ projects: await this.repository.list() });
      } catch (error) { this.fail(error); throw error; }
      finally { this.write = null; }
    })();
    await this.write;
    if (this.hasUnsaved() && !store.getSnapshot().interaction) await this.flush();
  }
  async retry() { this.paused = false; await this.flush(); }
  async refreshProjects() { this.publish({ projects: await this.repository.list() }); }
  async receiveExternal<T>(documentId: string, work: () => Promise<T>): Promise<T> {
    if (documentId !== this.state.store.getSnapshot().document.documentId) return work();
    if (this.externalUpdating || this.state.busy || this.write || this.hasUnsaved()) throw new Error('Hãy kết thúc lưu/chỉnh sửa local trước khi nhận cloud.');
    const store = this.state.store, payload = this.payload();
    this.externalUpdating = true; this.publish({ busy: true });
    try {
      const result = await work(), record = await this.repository.load(documentId);
      if (store !== this.state.store || this.payload() !== payload) throw new Error('Có chỉnh sửa mới trong bộ nhớ; chưa thay editor bằng bản cloud.');
      if (record && record.version !== this.state.version) this.attach(await decodeRecord(record), record);
      await this.refreshProjects(); return result;
    } catch (error) {
      if (store === this.state.store && this.payload() !== payload) this.fail(new Error('Có chỉnh sửa mới trong bộ nhớ khi nhận cloud. Bản trong bộ nhớ vẫn còn; hãy xuất file hoặc lưu thành sơ đồ mới trước khi tải lại.'));
      throw error;
    } finally { this.externalUpdating = false; this.publish({ busy: false }); }
  }
  private async action(work: () => Promise<void>) {
    if (this.state.busy) throw new Error('Đang xử lý dự án, vui lòng chờ.');
    this.publish({ busy: true });
    try { await work(); } finally { this.publish({ busy: false }); }
  }
  private async savedNew(document: DiagramDocument) {
    const record = await this.repository.save({ document, expectedVersion: null, operationId: newId() });
    this.attach(await decodeRecord(record), record); await this.refreshProjects();
  }
  createProject(title = 'Sơ đồ mới') { return this.action(async () => { await this.flush(); await this.savedNew(createDocument(title)); }); }
  openProject(id: string) { return this.action(async () => {
    if (id === this.state.store.getSnapshot().document.documentId) return;
    await this.flush(); const record = await this.repository.load(id);
    if (!record) throw new Error('Sơ đồ không còn tồn tại.');
    const document = await decodeRecord(record); this.attach(document, record); await this.refreshProjects();
  }); }
  importDocument(input: unknown) { return this.action(async () => {
    const document = parseDocument(input); await this.flush();
    if (await this.repository.load(document.documentId)) { document.documentId = newId(); document.title = `${document.title.slice(0, 87)} (bản nhập)`; }
    document.metadata.updatedAt = new Date().toISOString();
    await this.savedNew(document);
  }); }
  forkCurrent() { return this.action(async () => {
    if (this.write) await this.write.catch(() => { /* Fork is also the recovery path after a failed write. */ });
    if (this.state.store.getSnapshot().interaction) throw new Error('Hãy kết thúc thao tác kéo trước khi tạo bản sao.');
    const document = structuredClone(this.state.store.getSnapshot().document);
    document.documentId = newId(); document.title = `${document.title.slice(0, 88)} (bản sao)`;
    document.metadata = { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    // Save first. If writing fails, keep the complete unsaved source store alive.
    await this.savedNew(document);
  }); }
  duplicateProject(id: string) { return this.action(async () => {
    await this.flush(); const record = await this.repository.load(id);
    if (!record) throw new Error('Không tìm thấy sơ đồ.');
    const document = await decodeRecord(record); document.documentId = newId(); document.title = `${document.title.slice(0, 88)} (bản sao)`;
    document.metadata = { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await this.savedNew(document);
  }); }
  renameProject(id: string, title: string) { return this.action(async () => {
    await this.flush();
    if (id === this.state.store.getSnapshot().document.documentId) { this.state.store.execute([{ type: 'rename', title }]); await this.flush(); return; }
    const record = await this.repository.load(id); if (!record) throw new Error('Không tìm thấy sơ đồ.');
    const document = await decodeRecord(record); document.title = title; document.metadata.updatedAt = new Date().toISOString();
    await this.repository.save({ document, expectedVersion: record.version, operationId: newId() }); await this.refreshProjects();
  }); }
  removeProject(id: string, expectedVersion: number) { return this.action(async () => {
    await this.flush();
    const isActive = id === this.state.store.getSnapshot().document.documentId;
    await this.repository.remove(id, isActive ? this.state.version! : expectedVersion); await this.refreshProjects();
    if (isActive) {
      const next = this.state.projects[0], record = next ? await this.repository.load(next.documentId) : null;
      if (record) this.attach(await decodeRecord(record), record); else await this.savedNew(createDocument());
    }
  }); }
  checkpoints() { return this.repository.revisions(this.state.store.getSnapshot().document.documentId); }
  restoreCheckpoint(version: number) { return this.action(async () => {
    await this.flush(); const checkpoints = await this.checkpoints(), checkpoint = checkpoints.find((item) => item.version === version);
    if (!checkpoint) throw new Error('Checkpoint không còn tồn tại.');
    const document = await decodeRecord(checkpoint); document.metadata.updatedAt = new Date().toISOString();
    const record = await this.repository.save({ document, expectedVersion: this.state.version, operationId: newId() });
    this.attach(document, record, 'Đã khôi phục checkpoint thành một bản lưu mới.'); await this.refreshProjects();
  }); }
  reloadSaved() { return this.action(async () => {
    const record = await this.repository.load(this.state.store.getSnapshot().document.documentId);
    if (!record) throw new Error('Không tìm thấy bản trên máy.');
    this.attach(await decodeRecord(record), record); await this.refreshProjects();
  }); }
  dispose() { if (this.timer) clearTimeout(this.timer); this.unsubscribe?.(); this.listeners.clear(); this.repository.close(); }
}

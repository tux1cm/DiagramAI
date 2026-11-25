import { newId } from '@diagramai/diagram-core';
import { decodeRecord, LocalSyncJournal, WorkspaceJournal, type ProjectSession, type WorkspaceState } from '@diagramai/local-storage';
import { snapshotHash, SyncApiError, SyncClient, workspaceLink, workspaceLocalId, shareLink, type WorkspaceAccess } from '@diagramai/sync-core';

export interface LibrarySnapshot { loading: boolean; busy: boolean; state: WorkspaceState | null; error: string; view: 'projects' | 'drawings' | 'editor' }
export class WorkspaceLibrary {
  private snapshot: LibrarySnapshot = { loading: true, busy: false, state: null, error: '', view: 'editor' };
  private listeners = new Set<() => void>();
  private journal: WorkspaceJournal;
  private syncJournal: LocalSyncJournal;
  private running: Promise<void> | null = null;
  constructor(readonly session: ProjectSession, private client: SyncClient | null, private syncOne: (id: string, force?: boolean) => Promise<void>) {
    this.journal = new WorkspaceJournal(session.repository); this.syncJournal = new LocalSyncJournal(session.repository);
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<LibrarySnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  private api() { if (!this.client) throw new Error('Chưa cấu hình API kho chung. Dữ liệu local vẫn được giữ.'); return this.client; }
  private async reload() { const state = await this.session.repository.workspaceRead(); this.publish({ state, loading: false }); return state; }
  async initialize() { await this.session.initialize(); await this.reload(); }
  private async access(): Promise<WorkspaceAccess> {
    const state = await this.session.repository.workspaceRead();
    if (!state) throw new Error('Chưa mở kho chung.');
    const key = await this.session.repository.syncCredential(state.id);
    if (!key) throw new Error('Không đọc được quyền kho trên máy. Hãy dùng lại link riêng.');
    return { id: state.id, key };
  }
  private async update(work: (state: WorkspaceState) => WorkspaceState) { await this.journal.update(work); await this.reload(); }
  async perform(work: () => Promise<void>) {
    try { this.publish({ error: '' }); await work(); }
    catch (error) {
      const codes: Record<string, string> = { OWNER_REQUIRED: 'Bản vẽ P5 cũ cần được đưa vào kho từ thiết bị chủ dự án. Bản local và liên kết cũ được giữ nguyên.', CLOUD_PROJECT_LIMIT: 'Cloud đã đủ số bản vẽ của bản preview. Bản local vẫn được giữ.', CLOUD_STORAGE_LIMIT: 'Cloud đã chạm giới hạn dung lượng. Hãy xuất file dự phòng; bản local vẫn còn.', DRAWING_IN_OTHER_WORKSPACE: 'Bản vẽ này thuộc kho khác. Không tự chuyển quyền hoặc gộp dữ liệu.', FOLDER_CONFLICT: 'ID dự án không khớp dữ liệu đã có. Không tự ghi đè tên dự án.' };
      const message = error instanceof SyncApiError ? codes[error.code] ?? (error.status === 401 ? 'Link kho không còn hợp lệ hoặc thiếu quyền. Bản local vẫn còn.' : error.status === 429 ? 'Kho đang giới hạn yêu cầu. Bản local vẫn còn; hãy chờ rồi đồng bộ lại.' : 'Chưa kết nối/ghi được Neon. Kho và bản vẽ local vẫn còn; bấm Đồng bộ lại khi có mạng.') : error instanceof Error ? error.message : 'Chưa hoàn tất thao tác kho.';
      this.publish({ error: message });
    }
  }
  async create() {
    await this.session.flush();
    if (await this.session.repository.workspaceRead()) throw new Error('Máy này đã nhớ một kho. Không tạo kho mới tự động.');
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = `dai_workspace_v1_${btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
    const id = newId(), folderId = newId();
    const state: WorkspaceState = { id, generation: 1, provisionPending: true, selectedFolderId: folderId, folders: [{ id: folderId, title: 'Dự án đầu tiên', pending: true }], drawings: [], ignoredLocalIds: [] };
    // Persist the capability BEFORE network provisioning. A lost create response
    // can be retried with the same ID/key; never orphan an inaccessible workspace.
    await this.session.repository.workspaceWrite({ expectedGeneration: null, state, key });
    await this.reload(); await this.synchronize(true);
  }
  async connect(access: WorkspaceAccess) {
    await this.session.flush();
    const old = await this.session.repository.workspaceRead();
    if (old) {
      if (old.id !== access.id || (await this.access()).key !== access.key) throw new Error('Máy này đang nhớ kho khác. Không đổi kho hoặc bỏ hàng đợi chưa gửi tự động.');
      await this.synchronize(true); return;
    }
    const catalog = await this.api().workspaceCatalog(access), folderId = catalog.folders[0]?.id ?? newId();
    const state: WorkspaceState = { id: access.id, generation: 1, provisionPending: false, selectedFolderId: folderId,
      folders: catalog.folders.length ? catalog.folders.map((folder) => ({ ...folder, pending: false })) : [{ id: folderId, title: 'Dự án đầu tiên', pending: true }],
      drawings: [], ignoredLocalIds: (await this.session.repository.list()).map((record) => record.documentId) };
    await this.session.repository.workspaceWrite({ expectedGeneration: null, state, key: access.key });
    await this.reload(); await this.synchronize(true);
  }
  async shareLink(base: string) { return workspaceLink(base, await this.access()); }
  showProjects = () => this.publish({ view: 'projects' });
  showEditor = () => this.publish({ view: 'editor' });
  async createScopedLink(base: string, kind: 'project' | 'drawing', targetId: string) {
    await this.synchronize(true);
    let state = (await this.session.repository.workspaceRead())!;
    if (!state) throw new Error('Chưa mở kho.');
    let entry = state.shares?.find((item) => item.kind === kind && item.targetId === targetId);
    if (!entry) {
      const id = newId(), bytes = crypto.getRandomValues(new Uint8Array(32));
      const key = `dai_share_v1_${btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
      await this.session.repository.shareCredentialWrite({ id, key });
      await this.update((current) => current.shares?.some((item) => item.kind === kind && item.targetId === targetId) ? current : { ...current, shares: [...current.shares ?? [], { id, kind, targetId }] });
      state = (await this.session.repository.workspaceRead())!;
      entry = state.shares!.find((item) => item.kind === kind && item.targetId === targetId)!;
    }
    const key = await this.session.repository.syncCredential(entry.id);
    if (!key) throw new Error('Không đọc được link chia sẻ đã lưu.');
    await this.api().createShare(await this.access(), { ...entry, key });
    return shareLink(base, { id: entry.id, key });
  }
  async selectFolder(id: string) { await this.update((state) => { if (!state.folders.some((folder) => folder.id === id)) throw new Error('Dự án không còn trong kho.'); return { ...state, selectedFolderId: id }; }); this.publish({ view: 'drawings' }); }
  async createFolder(title: string) {
    title = title.trim(); if (!title || title.length > 100) throw new Error('Tên dự án cần từ 1 đến 100 ký tự.');
    const id = newId(); await this.update((state) => ({ ...state, selectedFolderId: id, folders: [...state.folders, { id, title, pending: true }] }));
    this.publish({ view: 'drawings' });
  }
  async enroll(localId: string, folderId?: string) {
    const link = await this.syncJournal.link(localId);
    await this.update((state) => state.drawings.some((drawing) => drawing.localId === localId) ? state : {
      ...state, ignoredLocalIds: state.ignoredLocalIds.filter((id) => id !== localId), drawings: [...state.drawings, { localId, folderId: folderId ?? state.selectedFolderId, cloudId: link?.projectId ?? newId(), operationId: newId(), published: false }],
    });
  }
  async createDrawing(title: string) {
    if (!title.trim()) throw new Error('Hãy nhập tên bản vẽ.');
    const folderId = this.snapshot.state?.selectedFolderId;
    await this.session.createProject(title.trim());
    await this.enroll(this.session.getSnapshot().store.getSnapshot().document.documentId, folderId);
    this.showEditor();
  }
  async open(localId: string) { await this.session.openProject(localId); this.showEditor(); }
  synchronize(force = false, includeOwner = false): Promise<void> {
    if (this.running) return force ? this.running.then(() => this.synchronize(true, includeOwner), () => this.synchronize(true, includeOwner)) : this.running;
    this.running = this.sync(force, includeOwner).finally(() => { this.running = null; this.publish({ busy: false }); });
    return this.running;
  }
  private async sync(force: boolean, includeOwner: boolean) {
    if (!includeOwner && await this.session.repository.shareContextRead()) return;
    await this.session.flush();
    let state = await this.reload(); if (!state) return;
    this.publish({ busy: true });
    const errors: unknown[] = [];
    const access = await this.access(), api = this.api();
    if (state.provisionPending) { await api.createWorkspace(access); await this.update((current) => ({ ...current, provisionPending: false })); }
    state = (await this.reload())!;
    for (const folder of state.folders.filter((folder) => folder.pending)) {
      try {
      await api.workspaceFolder(access, { id: folder.id, title: folder.title });
      await this.update((current) => ({ ...current, folders: current.folders.map((item) => item.id === folder.id ? { ...item, pending: false } : item) }));
      } catch (error) { errors.push(error); }
    }
    state = (await this.reload())!;
    for (const record of await this.session.repository.shareContextRead() ? [] : await this.session.repository.list()) {
      // Existing local files on a newly joined device and preserved conflict
      // branches stay local. New drawings/imports/copies join the selected project.
      if (!state.ignoredLocalIds.includes(record.documentId) && !state.drawings.some((drawing) => drawing.localId === record.documentId) && !record.title.includes('(xung đột local)')) await this.enroll(record.documentId);
    }
    state = (await this.reload())!;
    for (const drawing of state.drawings.filter((drawing) => !drawing.published)) {
      try {
      const record = await this.session.repository.load(drawing.localId); if (!record) continue;
      const link = await this.syncJournal.link(drawing.localId);
      if (link) {
        if (link.projectId !== drawing.cloudId) throw new Error('Liên kết bản vẽ đã đổi ở tab khác. Không tự chuyển kho hoặc ghi đè dữ liệu.');
        const token = await this.syncJournal.credential(drawing.localId); if (!token) throw new Error('Thiếu quyền sơ đồ cũ. Không đổi liên kết hoặc ghi đè dữ liệu.');
        await api.workspaceAdopt(access, { projectId: link.projectId, folderId: drawing.folderId, token, deviceLabel: 'Kho chung' });
      } else {
        const document = await decodeRecord(record);
        const binding = await api.workspaceCreateDrawing(access, { id: drawing.cloudId, folderId: drawing.folderId, project: { document, operationId: drawing.operationId, hash: await snapshotHash(document), deviceLabel: 'Kho chung' } });
        if (!await this.syncJournal.link(drawing.localId)) await this.syncJournal.bindExisting(drawing.localId, binding);
      }
      await this.update((current) => ({ ...current, drawings: current.drawings.map((item) => item.localId === drawing.localId ? { ...item, published: true } : item) }));
      } catch (error) { errors.push(error); }
    }
    const catalog = await api.workspaceCatalog(access);
    await this.update((current) => ({ ...current, folders: [...catalog.folders.map((folder) => ({ ...folder, pending: false })), ...current.folders.filter((folder) => folder.pending && !catalog.folders.some((remote) => remote.id === folder.id))] }));
    for (const drawing of catalog.drawings) {
      try {
      state = (await this.reload())!;
      if (state.drawings.some((item) => item.cloudId === drawing.id)) continue;
      let localId: string | undefined;
      for (const record of await this.session.repository.list()) if ((await this.syncJournal.link(record.documentId))?.projectId === drawing.id) { localId = record.documentId; break; }
      if (!localId) {
        let candidate = await workspaceLocalId(access.id, drawing.id);
        if (await this.session.repository.load(candidate) && (await this.syncJournal.link(candidate))?.projectId !== drawing.id) candidate = newId();
        const binding = await api.workspaceDrawing(access, drawing.id);
        try { localId = await this.syncJournal.join(binding, candidate); }
        catch (error) { if ((await this.syncJournal.link(candidate))?.projectId !== drawing.id) throw error; localId = candidate; }
      }
      const found = localId;
      await this.update((current) => current.drawings.some((item) => item.cloudId === drawing.id) ? current : { ...current, drawings: [...current.drawings, { localId: found, cloudId: drawing.id, folderId: drawing.folderId, operationId: newId(), published: true }] });
      } catch (error) { errors.push(error); }
    }
    state = (await this.reload())!;
    const active = this.session.getSnapshot().store.getSnapshot().document.documentId;
    // Run active last so the existing cloud status always ends on the open drawing.
    for (const drawing of [...state.drawings].sort((a, b) => Number(a.localId === active) - Number(b.localId === active))) {
      const remote = catalog.drawings.find((item) => item.id === drawing.cloudId);
      if (!force && drawing.localId !== active && remote) {
        const link = await this.syncJournal.link(drawing.localId);
        if (link && !link.pending && !link.conflict && link.baseRevision === remote.revision) continue;
      }
      if (drawing.published && catalog.drawings.some((remote) => remote.id === drawing.cloudId) && await this.session.repository.load(drawing.localId)) {
        try { await this.syncOne(drawing.localId, force); } catch (error) { errors.push(error); }
      }
    }
    await this.session.refreshProjects(); await this.reload();
    if (errors.length) throw errors[0];
    this.publish({ error: '' });
  }
}

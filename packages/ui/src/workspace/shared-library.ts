import { newId } from '@diagramai/diagram-core';
import { LocalSyncJournal, WorkspaceJournal, type ProjectSession } from '@diagramai/local-storage';
import { ShareKeySchema, SyncApiError, SyncClient, workspaceLocalId, shareLink, parseShareLink, parseShortLink, type ShareAccess, type ShareCatalog } from '@diagramai/sync-core';
import { resolveShort, rememberShort } from './short-links';

interface SharedSnapshot { active: boolean; busy: boolean; error: string; catalog: ShareCatalog | null; mappings: { cloudId: string; localId: string }[]; view: 'drawings' | 'editor' }
export class SharedLibrary {
  private snapshot: SharedSnapshot = { active: false, busy: false, error: '', catalog: null, mappings: [], view: 'drawings' };
  private listeners = new Set<() => void>();
  private access: ShareAccess | null = null;
  private running: Promise<void> | null = null;
  constructor(private session: ProjectSession, private client: SyncClient | null, private syncOne: (id: string, force?: boolean) => Promise<void>) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SharedSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  private api() { if (!this.client) throw new Error('Chưa kết nối API chia sẻ.'); return this.client; }
  private async catalog(access: ShareAccess) {
    try { const catalog = await this.api().shareCatalog(access); await this.session.repository.shareCatalogWrite(catalog); return catalog; }
    catch (error) {
      if (!(error instanceof SyncApiError) || error.status !== 0 && error.status !== 503 || await this.session.repository.syncCredential(access.id) !== access.key) throw error;
      const cached = await this.session.repository.shareCatalogRead(access.id); if (!cached) throw error; return cached;
    }
  }
  async perform(work: () => Promise<void>) {
    try { await work(); this.publish({ error: '' }); }
    catch { this.publish({ busy: false, error: 'Chưa mở/cập nhật được link chia sẻ. Kiểm tra mạng và link; bản local vẫn được giữ.' }); }
  }
  async connect(id: string, key?: string) {
    await this.session.initialize(); await this.session.flush();
    this.publish({ active: true, busy: true, view: 'drawings', catalog: null, mappings: [] });
    const stored = key ?? await this.session.repository.syncCredential(id);
    const access = { id, key: ShareKeySchema.parse(stored) };
    const cached = !key ? await this.session.repository.shareCatalogRead(id) : null;
    if (cached) {
      const journal = new LocalSyncJournal(this.session.repository), mappings: SharedSnapshot['mappings'] = [];
      for (const record of await this.session.repository.list()) {
        const link = await journal.link(record.documentId);
        if (link && cached.drawings.some((item) => item.id === link.projectId)) mappings.push({ cloudId: link.projectId, localId: record.documentId });
      }
      this.access = access;
      await this.session.repository.shareContextWrite(id);
      this.publish({ catalog: cached, mappings, busy: false });
      const active = this.session.getSnapshot().store.getSnapshot().document.documentId;
      if (mappings.some((item) => item.localId === active)) this.showEditor();
      else if (cached.kind === 'drawing' && mappings[0]) await this.open(mappings[0].localId);
      return;
    }
    const catalog = await this.catalog(access);
    await this.session.repository.shareCredentialWrite(access);
    await this.session.repository.shareContextWrite(id);
    this.access = access; this.publish({ catalog, mappings: [] });
    await this.synchronize(true);
    if (catalog.kind === 'drawing' && this.snapshot.mappings[0]) await this.open(this.snapshot.mappings[0].localId);
    else if (!key) {
      const active = this.session.getSnapshot().store.getSnapshot().document.documentId;
      if (this.snapshot.mappings.some((item) => item.localId === active)) await this.open(active);
    }
  }
  async connectLink(text: string) {
    const reference = parseShortLink(text);
    if (!reference) { const access = parseShareLink(text); return this.connect(access.id, access.key); }
    if (reference.kind !== 'share') throw new Error('Cần link Project/bản vẽ, không phải link kho chính.');
    this.publish({ active: true, busy: true, view: 'drawings' });
    const resolution = await resolveShort(this.session.repository, this.api(), reference);
    if (resolution.kind !== 'share') throw new Error('Link ngắn không đúng phạm vi.');
    await this.connect(resolution.access.id, resolution.access.key);
    await rememberShort(this.session.repository, reference, resolution);
  }
  showList = () => this.publish({ view: 'drawings' });
  showEditor = () => this.publish({ view: 'editor' });
  leave = async () => { await this.session.repository.shareContextWrite(null); this.access = null; this.publish({ active: false, catalog: null, mappings: [], error: '', busy: false, view: 'drawings' }); };
  currentLink(base: string) { if (!this.access) throw new Error('Chưa mở link.'); return shareLink(base, this.access); }
  async open(localId: string) {
    if (!this.snapshot.mappings.some((item) => item.localId === localId)) throw new Error('Bản vẽ không nằm trong link này.');
    await this.session.openProject(localId); this.showEditor();
  }
  synchronize(force = false): Promise<void> {
    if (this.running) return force ? this.running.then(() => this.synchronize(true), () => this.synchronize(true)) : this.running;
    this.running = this.sync(force).finally(() => { this.running = null; this.publish({ busy: false }); }); return this.running;
  }
  private async sync(force: boolean) {
    if (!this.access) return;
    const access = this.access; this.publish({ busy: true });
    const catalog = await this.api().shareCatalog(access), journal = new LocalSyncJournal(this.session.repository);
    await this.session.repository.shareCatalogWrite(catalog);
    const mappings: SharedSnapshot['mappings'] = [];
    for (const drawing of catalog.drawings) {
      let localId: string | undefined;
      for (const record of await this.session.repository.list()) if ((await journal.link(record.documentId))?.projectId === drawing.id) { localId = record.documentId; break; }
      if (!localId) {
        let candidate = await workspaceLocalId(access.id, drawing.id);
        if (await this.session.repository.load(candidate) && (await journal.link(candidate))?.projectId !== drawing.id) candidate = newId();
        const binding = await this.api().shareDrawing(access, drawing.id);
        try { localId = await journal.join(binding, candidate); }
        catch (error) { if ((await journal.link(candidate))?.projectId !== drawing.id) throw error; localId = candidate; }
      }
      mappings.push({ cloudId: drawing.id, localId });
    }
    // Opening an external editable share must never adopt/upload those imported
    // drawings into a different workspace the recipient already owns.
    if (await this.session.repository.workspaceRead()) await new WorkspaceJournal(this.session.repository).update((state) => ({
      ...state, ignoredLocalIds: [...new Set([...state.ignoredLocalIds, ...mappings.filter((item) => !state.drawings.some((own) => own.localId === item.localId)).map((item) => item.localId)])],
    }));
    if (this.access?.id !== access.id) return;
    this.publish({ catalog, mappings });
    const active = this.session.getSnapshot().store.getSnapshot().document.documentId;
    const errors: unknown[] = [];
    for (const drawing of [...mappings].sort((a, b) => Number(a.localId === active) - Number(b.localId === active))) {
      if (this.access?.id !== access.id) return;
      const remote = catalog.drawings.find((item) => item.id === drawing.cloudId)!, link = await journal.link(drawing.localId);
      if (force || drawing.localId === active || link?.pending || remote.revision !== link?.baseRevision) {
        try { await this.syncOne(drawing.localId, force); } catch (error) { errors.push(error); }
      }
    }
    await this.session.refreshProjects();
    if (errors.length) throw errors[0];
    this.publish({ error: '' });
  }
}

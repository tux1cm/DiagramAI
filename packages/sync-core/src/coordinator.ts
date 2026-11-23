import { SyncApiError, type SyncClient } from './client';
import type { CloudSnapshot, SyncLink, SyncStatus } from './protocol';

// Implemented by local platform repositories. Every mutating method must be an
// atomic local transaction; no optimistic in-memory "synced" acknowledgement.
export interface SyncPersistence {
  link(documentId: string): Promise<SyncLink | null>;
  stage(documentId: string): Promise<SyncLink | null>;
  credential(documentId: string): Promise<string | null>;
  acknowledge(documentId: string, operationId: string, revision: number, hash: string): Promise<void>;
  receive(documentId: string, snapshot: CloudSnapshot): Promise<'applied' | 'unchanged' | 'conflict'>;
  conflict(documentId: string, snapshot: CloudSnapshot): Promise<void>;
}
export interface SyncState { documentId: string | null; status: SyncStatus; message: string; retryAt: number | null; revision: number | null }
export class SyncCoordinator {
  private state: SyncState = { documentId: null, status: 'local', message: '', retryAt: null, revision: null };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private failures = 0;
  private documentId: string | null = null;
  constructor(private storage: SyncPersistence, private client: Pick<SyncClient, 'push' | 'pull'>, private flushLocal: (documentId: string) => Promise<void>, private canReceive: (documentId: string) => boolean, private clock = () => Date.now()) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SyncState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  synchronize(documentId: string, force = false): Promise<void> {
    if (this.running) return force ? this.running.then(() => this.synchronize(documentId, true)) : this.running;
    if (documentId !== this.documentId) { this.documentId = documentId; this.failures = 0; this.publish({ documentId, status: 'local', message: '', retryAt: null, revision: null }); }
    if (!force && (this.state.retryAt !== null && this.state.retryAt > this.clock() || ['conflict', 'revoked', 'error'].includes(this.state.status))) return Promise.resolve();
    if (force) { this.failures = 0; this.publish({ retryAt: null }); }
    this.running = this.run(documentId).finally(() => { this.running = null; });
    return this.running;
  }
  private async run(documentId: string) {
    try {
      if (!this.canReceive(documentId)) { this.publish({ status: 'pending', message: 'Chờ kết thúc thao tác/sửa chữ để đồng bộ.' }); return; }
      await this.flushLocal(documentId);
      let link = await this.storage.stage(documentId);
      if (!link) { this.publish({ status: 'local', message: '', retryAt: null, revision: null }); return; }
      if (link.conflict) { this.publish({ status: 'conflict', message: 'Đã giữ bản local và bản cloud để giải quyết xung đột.', revision: link.baseRevision }); return; }
      const credential = await this.storage.credential(documentId);
      if (!credential) { this.publish({ status: 'revoked', message: 'Thiếu quyền thiết bị. Bản local được giữ nguyên; hãy liên kết hoặc khôi phục quyền.' }); return; }
      this.publish({ status: 'syncing', message: '', retryAt: null, revision: link.baseRevision });
      // Bound each tick: continuously editing cannot monopolize the API.
      for (let count = 0; link.pending && count < 4; count++) {
        const { localVersion: _localVersion, ...request } = link.pending;
        void _localVersion;
        try {
          const receipt = await this.client.push(link.projectId, credential, request);
          await this.storage.acknowledge(documentId, request.operationId, receipt.acceptedRevision, receipt.hash);
        } catch (error) {
          if (!(error instanceof SyncApiError) || error.status !== 409 || error.code !== 'REVISION_CONFLICT') throw error;
          const cloud = await this.client.pull(link.projectId, credential, 0);
          if (!cloud || cloud.document.documentId !== link.cloudDocumentId) throw new SyncApiError(502, 'DOCUMENT_MISMATCH');
          await this.storage.conflict(documentId, cloud);
          this.publish({ status: 'conflict', message: 'Xung đột: đã lưu bản sao local và giữ bản cloud, chưa ghi đè nhánh nào.', revision: link.baseRevision }); return;
        }
        link = await this.storage.stage(documentId);
        if (!link) { this.publish({ status: 'local', message: '', revision: null }); return; }
      }
      if (link.pending || !this.canReceive(documentId)) { this.publish({ status: 'pending', message: 'Còn thay đổi trên máy chưa đồng bộ.', revision: link.baseRevision }); return; }
      const remote = await this.client.pull(link.projectId, credential, link.baseRevision);
      if (remote) {
        if (remote.document.documentId !== link.cloudDocumentId) throw new SyncApiError(502, 'DOCUMENT_MISMATCH');
        if (!this.canReceive(documentId)) { this.publish({ status: 'pending', message: 'Chờ kết thúc chỉnh sửa trước khi nhận bản cloud.' }); return; }
        const result = await this.storage.receive(documentId, remote);
        if (result === 'conflict') { this.publish({ status: 'conflict', message: 'Có thay đổi local mới; đã giữ cả hai bản.' }); return; }
      }
      const latest = await this.storage.stage(documentId);
      if (!latest) { this.publish({ status: 'local', message: '', revision: null, retryAt: null }); return; }
      if (!this.canReceive(documentId)) { this.publish({ status: 'pending', message: 'Còn thay đổi đang chỉnh trên máy.', retryAt: null, revision: latest.baseRevision }); return; }
      this.failures = 0;
      this.publish({ status: latest?.conflict ? 'conflict' : latest?.pending ? 'pending' : 'synced', message: '', retryAt: null, revision: latest?.baseRevision ?? link.baseRevision });
    } catch (error) {
      if (error instanceof SyncApiError && error.status === 401) { this.publish({ status: 'revoked', message: 'Quyền thiết bị không còn hợp lệ. Dữ liệu local chưa bị xóa.', retryAt: null }); return; }
      const transient = error instanceof SyncApiError && (error.status === 0 || error.status === 429 || error.status >= 500);
      this.failures++;
      if (transient && this.failures <= 8) {
        const delay = Math.max(error.retryAfterMs, Math.min(60000, 1000 * 2 ** this.failures));
        this.publish({ status: error.status === 0 ? 'offline' : 'pending', message: 'Đã giữ thay đổi trên máy; chờ thử đồng bộ lại.', retryAt: this.clock() + delay });
      } else this.publish({ status: 'error', message: 'Chưa đồng bộ được. Bản local vẫn được giữ; có thể xuất file và thử lại thủ công.', retryAt: null });
    }
  }
}

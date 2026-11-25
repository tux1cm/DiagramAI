import { invoke } from '@tauri-apps/api/core';
import { LocalConflict, type LocalRepository, type ProjectSummary, type SaveRequest, type StoredProject } from './types';
import { saveWithSync } from './sync-journal';
import type { SyncBackend, SyncCommit, SyncRead } from './sync-types';
import { checkWorkspaceCommit, WorkspaceStateSchema, type WorkspaceCommit } from './workspace';
import { ShareAccessSchema, ShareCatalogSchema, type ShareAccess, type ShareCatalog } from '@diagramai/sync-core';

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try { return await invoke<T>(command, args); }
  catch (error) { if (String(error).includes('LOCAL_CONFLICT')) throw new LocalConflict(); throw new Error('Không truy cập được SQLite local. Bản vẽ vẫn ở bộ nhớ; hãy xuất file dự phòng.'); }
}
export class SqliteRepository implements LocalRepository, SyncBackend {
  readonly kind = 'sqlite' as const;
  list() { return call<ProjectSummary[]>('local_list'); }
  load(documentId: string) { return call<StoredProject | null>('local_load', { documentId }); }
  save(request: SaveRequest) { return saveWithSync(this, request); }
  syncRead(documentId: string) { return call<SyncRead>('sync_read', { documentId }); }
  syncCommit(request: SyncCommit) { return call<void>('sync_commit', { request }); }
  syncCredential(deviceId: string) { return call<string | null>('sync_credential', { deviceId }); }
  shareCredentialWrite(access: ShareAccess) { return call<void>('share_credential_write', { access: ShareAccessSchema.parse(access) }); }
  async shareCatalogRead(id: string) { const value = await call<unknown>('share_catalog_read', { id }); return value === null ? null : ShareCatalogSchema.parse(value); }
  async workspaceArchives() { return (await call<unknown[]>('workspace_archives')).map((value) => WorkspaceStateSchema.parse(value)); }
  shareCatalogWrite(catalog: ShareCatalog) { return call<void>('share_catalog_write', { catalog: ShareCatalogSchema.parse(catalog) }); }
  shareContextRead() { return call<string | null>('share_context_read'); }
  shareContextWrite(id: string | null) { if (id !== null) ShareAccessSchema.shape.id.parse(id); return call<void>('share_context_write', { id }); }
  async workspaceRead() { const state = await call<unknown>('workspace_read'); return state === null ? null : WorkspaceStateSchema.parse(state); }
  workspaceWrite(input: WorkspaceCommit) { checkWorkspaceCommit(input); return call<void>('workspace_write', { input }); }
  remove(documentId: string, expectedVersion: number) { return call<void>('local_remove', { documentId, expectedVersion }); }
  revisions(documentId: string) { return call<StoredProject[]>('local_revisions', { documentId }); }
  active() { return call<string | null>('local_active'); }
  setActive(documentId: string) { return call<void>('local_set_active', { documentId }); }
  close() { /* Connections are scoped to native transactions. */ }
}

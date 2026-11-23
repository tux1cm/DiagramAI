import { invoke } from '@tauri-apps/api/core';
import { LocalConflict, type LocalRepository, type ProjectSummary, type SaveRequest, type StoredProject } from './types';
import { saveWithSync } from './sync-journal';
import type { SyncBackend, SyncCommit, SyncRead } from './sync-types';

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
  remove(documentId: string, expectedVersion: number) { return call<void>('local_remove', { documentId, expectedVersion }); }
  revisions(documentId: string) { return call<StoredProject[]>('local_revisions', { documentId }); }
  active() { return call<string | null>('local_active'); }
  setActive(documentId: string) { return call<void>('local_set_active', { documentId }); }
  close() { /* Connections are scoped to native transactions. */ }
}

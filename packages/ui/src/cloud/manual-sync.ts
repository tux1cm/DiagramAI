import { LocalSyncJournal, type ProjectSession } from '@diagramai/local-storage';
import type { WorkspaceLibrary } from '../workspace/library';
import type { SharedLibrary } from '../workspace/shared-library';

// Local inspection only. A saved local record is NOT a cloud acknowledgement.
export async function hasPendingCloud(session: ProjectSession) {
  const state = await session.repository.workspaceRead();
  if (state?.provisionPending || state?.folders.some((item) => item.pending) || state?.drawings.some((item) => !item.published)) return true;
  const journal = new LocalSyncJournal(session.repository);
  for (const record of await session.repository.list()) {
    const link = await journal.link(record.documentId);
    if (link?.pending || link?.conflict) return true;
    if (state && !link && !state.ignoredLocalIds.includes(record.documentId) && !record.title.includes('(xung đột local)')) return true;
  }
  return false;
}

export async function synchronizeAll(session: ProjectSession, workspace: WorkspaceLibrary, shared: SharedLibrary, syncOne: (id: string, force?: boolean) => Promise<void>) {
  await session.flush();
  const errors: unknown[] = [];
  // Try every independent scope/record even if another one fails.
  try { await workspace.synchronize(true, true); } catch (error) { errors.push(error); }
  if (shared.getSnapshot().active) try { await shared.synchronize(true); } catch (error) { errors.push(error); }
  const journal = new LocalSyncJournal(session.repository);
  const owned = (await session.repository.workspaceRead())?.drawings.map((item) => item.localId) ?? [];
  const scoped = shared.getSnapshot().mappings.map((item) => item.localId);
  for (const record of await session.repository.list()) {
    if (owned.includes(record.documentId) || scoped.includes(record.documentId) || !await journal.link(record.documentId)) continue;
    try { await syncOne(record.documentId, true); } catch (error) { errors.push(error); }
  }
  await session.refreshProjects();
  if (errors.length) throw errors[0];
  if (await hasPendingCloud(session)) throw new Error('Còn bản vẽ chưa gửi hoặc có xung đột. Dữ liệu local được giữ; chưa đồng bộ hết.');
}

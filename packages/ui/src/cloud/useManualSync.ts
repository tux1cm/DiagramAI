import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectSession, ProjectSessionSnapshot } from '@diagramai/local-storage';
import type { WorkspaceController } from '../workspace/useWorkspace';
import type { SharedController } from '../workspace/useShared';
import { hasEditorDraft } from '../editor/drafts';
import { hasPendingCloud, synchronizeAll } from './manual-sync';
import { SyncApiError } from '@diagramai/sync-core';

export function useManualSync(session: ProjectSession, local: ProjectSessionSnapshot, workspace: WorkspaceController, shared: SharedController, syncOne: (id: string, force?: boolean) => Promise<void>) {
  const [pending, setPending] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const pendingRef = useRef(true), running = useRef<Promise<void> | null>(null);
  const revision = local.projects.map((item) => `${item.documentId}:${item.version}`).join(',');
  useEffect(() => {
    let live = true; pendingRef.current = true;
    void hasPendingCloud(session).then((value) => { if (live) { pendingRef.current = value; setPending(value); } }).catch(() => { if (live) { pendingRef.current = true; setPending(true); } });
    return () => { live = false; };
  }, [session, revision, local.status, workspace.state?.generation, shared.catalog]);
  const synchronize = useCallback((): Promise<void> => {
    if (running.current) return running.current;
    setBusy(true); setError('');
    running.current = Promise.resolve().then(async () => {
      try {
        if (hasEditorDraft()) throw new Error('Hãy kết thúc sửa chữ trước khi đồng bộ.');
        await synchronizeAll(session, workspace.library, shared.library, syncOne);
        pendingRef.current = false; setPending(false);
        setLastSyncedAt(Date.now());
      } catch (cause) {
        pendingRef.current = true; setPending(true);
        setError(cause instanceof SyncApiError ? cause.status === 429 ? 'Cloud đang giới hạn yêu cầu. Bản local vẫn còn; hãy chờ rồi bấm Đồng bộ lại.' : 'Chưa gửi/nhận được cloud. Bản local và hàng đợi vẫn còn; kiểm tra mạng/quyền rồi bấm Đồng bộ lại.' : cause instanceof Error ? cause.message : 'Chưa đồng bộ hết. Dữ liệu local vẫn còn.');
        throw cause;
      }
    }).finally(() => { running.current = null; setBusy(false); });
    return running.current;
  }, [session, workspace.library, shared.library, syncOne]);
  const run = () => { void synchronize().catch(() => {}); };
  return { synchronize, run, pending: pending || session.hasUnsaved(), pendingRef, busy, error, lastSyncedAt };
}
export type ManualSyncController = ReturnType<typeof useManualSync>;

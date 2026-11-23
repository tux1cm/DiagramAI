import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { newId } from '@diagramai/diagram-core';
import { LocalSyncJournal, type LocalSyncLink, type ProjectSession, type ProjectSessionSnapshot } from '@diagramai/local-storage';
import { SyncApiError, SyncClient, SyncCoordinator, type SyncPersistence, type SyncState } from '@diagramai/sync-core';
import { hasEditorDraft as hasDraft } from '../editor/drafts';

const localState: SyncState = { documentId: null, status: 'local', message: '', retryAt: null, revision: null };
const noopSubscribe = () => () => {};
const readLocalState = () => localState;
const messages: Record<string, string> = {
  NETWORK_UNAVAILABLE: 'Chưa kết nối được cloud. Bản local vẫn được giữ.',
  PAIRING_INVALID: 'Mã liên kết không đúng, đã dùng hoặc đã hết hạn.',
  RECOVERY_INVALID: 'Mã khôi phục không hợp lệ.',
  OWNER_REQUIRED: 'Thao tác này cần quyền chủ dự án.',
  RATE_LIMITED: 'Đã chạm giới hạn yêu cầu. Chờ một lúc rồi thử lại.',
  DAILY_LIMIT: 'Đã chạm giới hạn cloud hôm nay (UTC). Bản local vẫn còn; hãy thử ngày sau hoặc xuất file dự phòng.',
  SYNC_DISABLED: 'Dịch vụ đồng bộ chưa bật hoặc đang tạm dừng.',
  DEVICE_LIMIT: 'Dự án đã chạm giới hạn thiết bị. Có thể khôi phục bằng mã riêng và chọn thu hồi thiết bị cũ.',
  CLOUD_PROJECT_LIMIT: 'Cloud đã đủ số dự án cho bản preview. Có thể dùng thiết bị chủ để xóa dự án cloud không cần nữa; bản local vẫn được giữ.',
  CLOUD_STORAGE_LIMIT: 'Cloud đã chạm giới hạn dung lượng. Hãy giữ bản local và xuất file dự phòng.',
  CREATION_ALREADY_COMMITTED: 'Server đã nhận lần tạo trước nhưng không thể cấp lại mã bí mật. Bản local vẫn còn; chưa liên kết tự động.',
};
const message = (error: unknown) => error instanceof SyncApiError ? messages[error.code] ?? 'Yêu cầu cloud chưa hoàn tất. Bản local được giữ nguyên.' : error instanceof Error ? error.message : 'Thao tác cloud chưa hoàn tất.';

export function useCloud(session: ProjectSession, local: ProjectSessionSnapshot, baseUrl: string) {
  const journal = useMemo(() => new LocalSyncJournal(session.repository), [session]);
  const client = useMemo(() => { try { return baseUrl ? new SyncClient(baseUrl) : null; } catch { return null; } }, [baseUrl]);
  const [link, setLink] = useState<LocalSyncLink | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [recovery, setRecovery] = useState<{ projectId: string; title: string; key: string } | null>(null);
  const [pairing, setPairing] = useState<{ projectId: string; code: string; expiresAt: string } | null>(null);
  const [deviceList, setDeviceList] = useState<{ projectId: string | null; items: Awaited<ReturnType<SyncClient['devices']>> }>({ projectId: null, items: [] });
  const running = useRef(false);
  const id = local.store.getSnapshot().document.documentId;
  const safe = useCallback((documentId: string) => {
    const state = session.getSnapshot();
    return state.store.getSnapshot().document.documentId !== documentId || !state.busy && !session.isExternalUpdating() && !session.hasUnsaved() && !hasDraft() && state.status === 'saved';
  }, [session]);
  const external = useCallback(async <T,>(documentId: string, work: () => Promise<T>) => {
    const active = session.getSnapshot().store.getSnapshot().document.documentId === documentId;
    const root = active ? document.querySelector<HTMLElement>('.editor-root') : null, wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    try { return await session.receiveExternal(documentId, work); }
    finally { if (root) root.inert = wasInert; }
  }, [session]);
  const storage = useMemo<SyncPersistence>(() => ({
    link: (id) => journal.link(id), stage: (id) => journal.stage(id), credential: (id) => journal.credential(id),
    acknowledge: (id, operation, revision, hash) => journal.acknowledge(id, operation, revision, hash),
    receive: async (id, snapshot) => safe(id) ? external(id, () => journal.receive(id, snapshot)) : 'unchanged',
    conflict: async (id, snapshot) => { await journal.conflict(id, snapshot); await session.refreshProjects(); },
  }), [journal, safe, external, session]);
  const coordinator = useMemo(() => client ? new SyncCoordinator(storage, client, async (documentId) => {
    if (session.getSnapshot().store.getSnapshot().document.documentId === documentId) await session.flush();
  }, safe) : null, [client, storage, session, safe]);
  const syncState = useSyncExternalStore(coordinator?.subscribe ?? noopSubscribe, coordinator?.getSnapshot ?? readLocalState);
  const refresh = useCallback(async () => {
    const documentId = session.getSnapshot().store.getSnapshot().document.documentId;
    const current = await journal.link(documentId);
    if (session.getSnapshot().store.getSnapshot().document.documentId === documentId) setLink(current);
    return current;
  }, [journal, session]);
  useEffect(() => {
    if (local.status === 'loading') return;
    let active = true;
    void journal.link(id).then((current) => { if (active) setLink(current); }).catch(() => { if (active) setError('Không đọc được liên kết cloud local.'); });
    return () => { active = false; };
  }, [journal, id, local.version, local.status, syncState.revision, syncState.status]);
  const linked = Boolean(link);
  useEffect(() => {
    if (!coordinator || !linked || local.status === 'loading') return;
    const run = () => {
      if (document.visibilityState === 'hidden' || !safe(id)) return;
      void coordinator.synchronize(id).then(refresh).catch(() => setError('Chưa hoàn tất đồng bộ.'));
    };
    const first = setTimeout(run, 800), timer = setInterval(run, 15000);
    window.addEventListener('focus', run); window.addEventListener('online', run);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener('focus', run); window.removeEventListener('online', run); };
  }, [coordinator, id, linked, local.version, local.status, refresh, safe]);
  const operation = async (work: () => Promise<void>) => {
    if (running.current) return; running.current = true; setBusy(true); setError('');
    try { await work(); await refresh(); }
    catch (error) { setError(message(error)); }
    finally { running.current = false; setBusy(false); }
  };
  const api = () => { if (!client) throw new Error('Chưa cấu hình địa chỉ API đồng bộ. Vẽ/lưu local vẫn dùng bình thường.'); return client; };
  const access = async () => {
    const documentId = session.getSnapshot().store.getSnapshot().document.documentId;
    const current = await journal.link(documentId), credential = await journal.credential(documentId);
    if (!current || !credential) throw new Error('Thiết bị chưa có quyền với dự án cloud này.');
    return { link: current, token: credential };
  };
  return {
    link: link?.documentId === id ? link : null, busy, error, recovery, pairing: pairing?.projectId === link?.projectId ? pairing : null, devices: deviceList.projectId === link?.projectId ? deviceList.items : [],
    state: syncState.documentId === id ? syncState : localState,
    create: () => operation(async () => {
      if (hasDraft()) throw new Error('Hãy kết thúc sửa chữ trước khi bật đồng bộ.');
      await session.flush();
      const document = session.getSnapshot().store.getSnapshot().document;
      const created = await api().create(document, newId(), session.repository.kind === 'sqlite' ? 'Desktop Windows' : 'Web');
      // Preserve the one-time key in the AppShell hook even if local binding fails
      // or the editor remounts. It never enters document JSON or local storage.
      setRecovery({ projectId: created.credentials.projectId, title: document.title, key: created.recoveryKey });
      await journal.bindExisting(document.documentId, created);
      await coordinator?.synchronize(document.documentId, true);
    }),
    join: (code: string) => operation(async () => {
      await session.flush(); const joined = await api().join(code.trim().toUpperCase(), session.repository.kind === 'sqlite' ? 'Desktop Windows' : 'Web');
      const next = await journal.join(joined); await session.refreshProjects(); await session.openProject(next);
    }),
    recover: (text: string, revokeOtherDevices = false) => operation(async () => {
      const match = text.trim().match(/^diagramai-recovery-v1:([a-f0-9-]{36}):(dai_recovery_v1_[A-Za-z0-9_-]{43})$/i);
      if (!match) throw new Error('Dán đầy đủ chuỗi khôi phục gồm ID dự án và khóa bí mật.');
      await session.flush(); const joined = await api().recover(match[1], match[2], session.repository.kind === 'sqlite' ? 'Desktop Windows khôi phục' : 'Web khôi phục', revokeOtherDevices);
      const next = await journal.join(joined); await session.refreshProjects(); await session.openProject(next);
    }),
    makeCode: () => operation(async () => { const current = await access(); setPairing({ projectId: current.link.projectId, ...await api().pairing(current.link.projectId, current.token) }); }),
    loadDevices: () => operation(async () => { const current = await access(), result = await api().devices(current.link.projectId, current.token); setDeviceList({ projectId: current.link.projectId, items: result }); }),
    revoke: (deviceId: string) => operation(async () => { const current = await access(); await api().revoke(current.link.projectId, current.token, deviceId); const result = await api().devices(current.link.projectId, current.token); setDeviceList({ projectId: current.link.projectId, items: result }); }),
    syncNow: () => operation(async () => { await session.flush(); await coordinator?.synchronize(id, true); }),
    useCloud: (openCopy: boolean) => operation(async () => {
      await session.flush(); const copy = await external(id, () => journal.useCloud(id));
      if (openCopy && copy) await session.openProject(copy); else await coordinator?.synchronize(id, true);
    }),
    unlink: () => operation(async () => { await session.flush(); await journal.unlink(id); setPairing(null); setDeviceList({ projectId: null, items: [] }); await coordinator?.synchronize(id, true); }),
    deleteProject: () => operation(async () => {
      await session.flush(); const current = await access(); await api().deleteProject(current.link.projectId, current.token);
      await journal.unlink(id); setPairing(null); setDeviceList({ projectId: null, items: [] }); await coordinator?.synchronize(id, true);
    }),
    confirmRecoverySaved: () => setRecovery(null),
  };
}
export type CloudController = ReturnType<typeof useCloud>;

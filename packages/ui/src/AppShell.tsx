import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Background, ReactFlow } from '@xyflow/react';
import { checkHealth } from '@diagramai/shared';
import '@xyflow/react/dist/style.css';
import { EditorShell } from './editor/EditorShell';
import { IndexedDbRepository, ProjectSession, SqliteRepository } from '@diagramai/local-storage';
import { isTauri } from '@tauri-apps/api/core';
import { createInitialDocument } from './editor/initial-document';
import { useCloud } from './cloud/useCloud';
import { hasEditorDraft } from './editor/drafts';
import { useWorkspace } from './workspace/useWorkspace';
import { useShared } from './workspace/useShared';
import { useManualSync } from './cloud/useManualSync';

const nodes = [
  { id: 'p0-a', position: { x: 0, y: 0 }, data: { label: 'React Flow v12' } },
  { id: 'p0-b', position: { x: 240, y: 0 }, data: { label: 'Chữ tiếng Việt' } },
];
const edges = [{ id: 'p0-ab', source: 'p0-a', target: 'p0-b' }];

export function AppShell({ basePath, apiBaseUrl }: { basePath: string; apiBaseUrl: string }) {
  const [session] = useState(() => new ProjectSession(isTauri() ? new SqliteRepository() : new IndexedDbRepository(), createInitialDocument));
  const local = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const cloud = useCloud(session, local, apiBaseUrl);
  const shared = useShared(session, local, apiBaseUrl, cloud.synchronizeDocument);
  const workspace = useWorkspace(session, local, apiBaseUrl, cloud.synchronizeDocument);
  const manual = useManualSync(session, local, workspace, shared, cloud.synchronizeDocument);
  const manualRef = useRef(manual);
  useEffect(() => { manualRef.current = manual; }, [manual]);
  const [route, setRoute] = useState(window.location.hash);
  const [health, setHealth] = useState('Chưa kiểm tra');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    void session.initialize();
    const hasDraft = hasEditorDraft;
    const warn = (event: BeforeUnloadEvent) => { if (session.hasUnsaved() || session.getSnapshot().status === 'saving' || hasDraft() || manualRef.current.pendingRef.current || manualRef.current.busy) { event.preventDefault(); event.returnValue = ''; } };
    const flush = () => { if (!hasDraft()) void session.flush().catch(() => {}); };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', flush);
    let disposed = false, unlisten: (() => void) | undefined;
    if (isTauri()) void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      let closing = false;
      const stop = await win.onCloseRequested(async (event) => {
        event.preventDefault();
        if (closing) return; closing = true;
        const active = document.activeElement; if (active instanceof HTMLElement) active.blur();
        const root = document.querySelector<HTMLElement>('.editor-root'), wasInert = root?.inert ?? false;
        if (root) root.inert = true;
        try { await session.initialize(); await session.flush(); await manualRef.current.synchronize(); await win.destroy(); }
        catch {
          const { confirm } = await import('@tauri-apps/plugin-dialog');
          if (!session.hasUnsaved() && session.getSnapshot().status === 'saved' && !hasDraft()) {
            if (await confirm('Chưa đồng bộ hết lên cloud (mất mạng, thiếu quyền hoặc xung đột). Bản local đã lưu và hàng đợi vẫn được giữ. Thoát mà chưa đồng bộ?', { title: 'DiagramAI · Chưa đồng bộ', kind: 'warning' })) await win.destroy();
          } else if (await confirm('Chưa lưu được bản vẽ trên máy. Đóng và bỏ thay đổi chưa lưu? Nên hủy để xuất file dự phòng.', { title: 'DiagramAI · Chưa lưu', kind: 'warning' })) await win.destroy();
        }
        finally { closing = false; if (root) root.inert = wasInert; }
      });
      if (disposed) stop(); else unlisten = stop;
    });
    return () => { disposed = true; unlisten?.(); window.removeEventListener('beforeunload', warn); window.removeEventListener('pagehide', flush); };
  }, [session]);
  async function probe() {
    setBusy(true);
    setHealth('Đang kiểm tra…');
    try {
      await checkHealth(apiBaseUrl);
      setHealth('API và PostgreSQL phản hồi OK');
    } catch {
      setHealth('Không xác minh được API/DB. Kiểm tra URL, CORS và log backend.');
    } finally {
      setBusy(false);
    }
  }
  if (route !== '#/spike') return local.status === 'loading' ? <main className="spike-page" role="status">Đang mở dữ liệu trên máy…</main> : <div className="editor-root" inert={session.isExternalUpdating()}><EditorShell key={local.epoch} store={local.store} session={session} local={local} basePath={basePath} cloud={cloud} workspace={workspace} shared={shared} manual={manual}/></div>;
  return (
    <main className="spike-page">
      <h1>DiagramAI · P0</h1>
      <p>Shell React dùng chung Web/Tauri. Đây là spike công nghệ, chưa phải editor sản phẩm.</p>
      <a href="#/">← Về trình vẽ</a>
      <p><a href={`${basePath}reference/DiagramAI_Mockup.html`}>Mockup gốc để đối chiếu</a></p>
      <section>
        <h2>React Flow v12</h2>
        <p>Hai node và một cạnh để kiểm tra thư viện tải được; không lưu dữ liệu.</p>
        <div className="flow-spike" data-testid="flow-spike">
          <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false}>
            <Background />
          </ReactFlow>
        </div>
      </section>
      <section>
        <h2>Neon Functions / PostgreSQL</h2>
        <p>Chỉ kiểm tra theo yêu cầu, không tự gửi nội dung sơ đồ.</p>
        <p>{apiBaseUrl ? 'Đã cấu hình URL API công khai.' : 'Chưa cấu hình VITE_API_BASE_URL — chưa kiểm chứng Neon.'}</p>
        <button onClick={() => void probe()} disabled={!apiBaseUrl || busy}>Kiểm tra API</button>
        <p role="status">{health}</p>
      </section>
      <p>Editor P5 lưu local và đồng bộ kho riêng qua Neon. Trang kiểm tra này chỉ query health, không gửi sơ đồ. AI chưa bật.</p>
    </main>
  );
}

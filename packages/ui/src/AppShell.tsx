import { useEffect, useState, useSyncExternalStore } from 'react';
import { Background, ReactFlow } from '@xyflow/react';
import { checkHealth } from '@diagramai/shared';
import '@xyflow/react/dist/style.css';
import { EditorShell } from './editor/EditorShell';
import { IndexedDbRepository, ProjectSession, SqliteRepository } from '@diagramai/local-storage';
import { isTauri } from '@tauri-apps/api/core';
import { createInitialDocument } from './editor/initial-document';
import { useCloud } from './cloud/useCloud';
import { hasEditorDraft } from './editor/drafts';

const nodes = [
  { id: 'p0-a', position: { x: 0, y: 0 }, data: { label: 'React Flow v12' } },
  { id: 'p0-b', position: { x: 240, y: 0 }, data: { label: 'Chữ tiếng Việt' } },
];
const edges = [{ id: 'p0-ab', source: 'p0-a', target: 'p0-b' }];

export function AppShell({ basePath, apiBaseUrl }: { basePath: string; apiBaseUrl: string }) {
  const [session] = useState(() => new ProjectSession(isTauri() ? new SqliteRepository() : new IndexedDbRepository(), createInitialDocument));
  const local = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const cloud = useCloud(session, local, apiBaseUrl);
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
    const warn = (event: BeforeUnloadEvent) => { if (session.hasUnsaved() || session.getSnapshot().status === 'saving' || hasDraft()) { event.preventDefault(); event.returnValue = ''; } };
    const flush = () => { if (!hasDraft()) void session.flush().catch(() => {}); };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', flush);
    let disposed = false, unlisten: (() => void) | undefined;
    if (isTauri()) void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const stop = await win.onCloseRequested(async (event) => {
        event.preventDefault();
        const active = document.activeElement; if (active instanceof HTMLElement) active.blur();
        try { await session.initialize(); await session.flush(); await win.destroy(); }
        catch {
          const { confirm } = await import('@tauri-apps/plugin-dialog');
          if (await confirm('Chưa lưu được bản vẽ trên máy. Đóng và bỏ thay đổi chưa lưu? Nên hủy để xuất file dự phòng.', { title: 'DiagramAI · Chưa lưu', kind: 'warning' })) await win.destroy();
        }
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
  if (route !== '#/spike') return local.status === 'loading' ? <main className="spike-page" role="status">Đang mở dữ liệu trên máy…</main> : <div className="editor-root" inert={session.isExternalUpdating()}><EditorShell key={local.epoch} store={local.store} session={session} local={local} basePath={basePath} cloud={cloud}/></div>;
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
      <p>Editor P4 lưu local trên máy. AI và đồng bộ cloud chưa bật; trang kiểm tra không gửi nội dung sơ đồ.</p>
    </main>
  );
}

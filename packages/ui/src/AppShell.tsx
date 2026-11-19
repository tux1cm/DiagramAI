import { useEffect, useState } from 'react';
import { Background, ReactFlow } from '@xyflow/react';
import { checkHealth } from '@diagramai/shared';
import '@xyflow/react/dist/style.css';
import { EditorShell } from './editor/EditorShell';
import { DiagramStore } from '@diagramai/diagram-core';
import { createInitialDocument } from './editor/initial-document';

const nodes = [
  { id: 'p0-a', position: { x: 0, y: 0 }, data: { label: 'React Flow v12' } },
  { id: 'p0-b', position: { x: 240, y: 0 }, data: { label: 'Chữ tiếng Việt' } },
];
const edges = [{ id: 'p0-ab', source: 'p0-a', target: 'p0-b' }];

export function AppShell({ basePath, apiBaseUrl }: { basePath: string; apiBaseUrl: string }) {
  const [store] = useState(() => new DiagramStore(createInitialDocument()));
  const [route, setRoute] = useState(window.location.hash);
  const [health, setHealth] = useState('Chưa kiểm tra');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (store.getSnapshot().dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [store]);
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
  if (route !== '#/spike') return <EditorShell store={store}/>;
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
      <p>Engine P2 chỉnh sửa được trong bộ nhớ. AI, đồng bộ, lưu local và file production chưa triển khai; đi lại giữa trang kiểm tra và canvas không làm mất sơ đồ đang mở.</p>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { Background, ReactFlow } from '@xyflow/react';
import { checkHealth } from '@diagramai/shared';
import '@xyflow/react/dist/style.css';

const nodes = [
  { id: 'p0-a', position: { x: 0, y: 0 }, data: { label: 'React Flow v12' } },
  { id: 'p0-b', position: { x: 240, y: 0 }, data: { label: 'Chữ tiếng Việt' } },
];
const edges = [{ id: 'p0-ab', source: 'p0-a', target: 'p0-b' }];

export function P0Shell({ basePath, apiBaseUrl }: { basePath: string; apiBaseUrl: string }) {
  const [route, setRoute] = useState(window.location.hash);
  const [health, setHealth] = useState('Chưa kiểm tra');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
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
  if (route !== '#/spike') return (
    <main className="reference-shell">
      <iframe
        title="Giao diện tham chiếu DiagramAI — chưa phải editor sản phẩm"
        src={`${basePath}reference/DiagramAI_Mockup.html`}
        sandbox="allow-scripts allow-downloads allow-modals"
      />
      <a className="p0-badge" href="#/spike">P0 · Tham chiếu / Kiểm tra nền tảng</a>
    </main>
  );
  return (
    <main className="spike-page">
      <h1>DiagramAI · P0</h1>
      <p>Shell React dùng chung Web/Tauri. Đây là spike công nghệ, chưa phải editor sản phẩm.</p>
      <a href="#/">← Về giao diện tham chiếu</a>
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
      <p>AI, đồng bộ, lưu local và file production chưa triển khai. Dữ liệu trong mockup là dữ liệu demo.</p>
    </main>
  );
}

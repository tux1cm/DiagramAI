import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CanvasPreview } from './CanvasPreview';
import { createFixture, viewReducer, type Selection } from './fixture';
import { Icon } from './Icon';
import { Inspector, type InspectorTab } from './Inspector';
import { Modal } from './Modal';
import { Palette } from './Palette';
import { fitPreview } from './preview-layout';
import { Toolbar } from './Toolbar';
import { Topbar } from './Topbar';

type Dialog = 'help' | 'cloud' | 'files' | 'shapes' | null;
export function EditorShell() {
  const [state, dispatch] = useReducer(viewReducer, undefined, createFixture);
  const [tab, setTab] = useState<InspectorTab>('ai');
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => window.innerWidth < 930);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setDialog(null), []);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const view = fitPreview(state.nodes, size.width, size.height, zoom);
  const select = (selection: Selection) => dispatch({ type: 'select', selection });
  const showAi = () => { setInspectorCollapsed(false); setTab('ai'); };
  return <div id="app" className="editor-app" data-phase="p1">
    <Topbar title={state.title} rename={(title) => dispatch({ type: 'rename', title })} open={setDialog}/>
    <section className="workarea">
      <aside className="rail" aria-label="Công cụ">
        <button className={`railbtn ${paletteCollapsed ? '' : 'active'}`} title="Hình khối" aria-expanded={!paletteCollapsed} onClick={() => setPaletteCollapsed(!paletteCollapsed)}><Icon name="grid" size="lg"/></button>
        <button className="railbtn" title="Chọn đối tượng" onClick={() => host.current?.focus()}><Icon name="cursor" size="lg"/></button>
        <button className="railbtn" disabled title="Di chuyển canvas · P2"><Icon name="hand" size="lg"/></button>
        <button className="railbtn" disabled title="Tạo đường nối · P2"><Icon name="link" size="lg"/></button>
        <button className="railbtn" title="Trợ lý AI" aria-expanded={!inspectorCollapsed} onClick={() => { setInspectorCollapsed(!inspectorCollapsed); setTab('ai'); }}><Icon name="sparkle" size="lg"/></button>
        <div className="rail-spacer"/><button className="railbtn" title="Hướng dẫn và trạng thái P1" onClick={() => setDialog('help')}><Icon name="help" size="lg"/></button>
      </aside>
      <Palette collapsed={paletteCollapsed} pending={() => setDialog('shapes')}/>
      <main className="canvas-column"><Toolbar zoom={view.zoom} changeZoom={setZoom} fit={() => setZoom(null)}/><CanvasPreview state={state} hostRef={host} view={view} ready={size.width > 0} select={select} onFit={() => setZoom(null)} onAi={showAi}/></main>
      <Inspector state={state} activeTab={tab} setTab={setTab} collapsed={inspectorCollapsed} setFill={(value) => dispatch({ type: 'fill', value })}/>
      {dialog && <Modal title={{ help: 'DiagramAI · Giao diện P1', cloud: 'Đồng bộ chưa được bật', files: 'File và xuất ảnh · P4', shapes: 'Thư viện hình khối · P1' }[dialog]} close={close}>
        {dialog === 'help' && <><p>Giao diện đã chuyển sang React, giữ bố cục mockup. Chọn hình mẫu rồi mở Thuộc tính để thử màu; tìm hình và thu gọn panel có thể dùng ngay.</p><p>Chưa có engine vẽ, kéo thả, resize, sửa chữ, Undo/Redo (P2/P3); lưu và xuất file thuộc P4. Không dùng bản P1 để lưu công việc thật.</p><a className="diagnostic-link" href="#/spike">Kiểm tra nền tảng</a></>}
        {dialog === 'cloud' && <><p>Chưa có đồng bộ dự án. Thay đổi hiện chỉ nằm trong bộ nhớ và mất khi tải lại. Đồng bộ Desktop ↔ Web thuộc P5; không có tài khoản hay token dự án được tạo.</p><a className="diagnostic-link" href="#/spike">Kiểm tra nền tảng</a></>}
        {dialog === 'files' && <p>Tạo/quản lý nhiều sơ đồ, mở/lưu .diagramai và xuất SVG/PNG/PDF sẽ triển khai ở P4. Phiên P1 chưa lưu hay xuất dữ liệu; không có tải file giả.</p>}
        {dialog === 'shapes' && <p>Đủ 21 mục thư viện theo mockup. Kéo/thêm hình vào canvas thuộc engine P2; hiện bạn có thể chọn hình mẫu đang có và thử màu trong tab Thuộc tính.</p>}
      </Modal>}
    </section>
    <footer className="footer"><span>DiagramAI · <b>P1 giao diện React</b> · Chưa lưu dữ liệu · <a href="#/spike">Kiểm tra nền tảng</a></span><span><span className="hide-small">Sơ đồ mẫu &nbsp;·&nbsp; </span><b>{state.nodes.length} hình · {state.edges.length} đường nối</b> &nbsp;·&nbsp; <span>{Math.round(view.zoom * 100)}%</span></span></footer>
  </div>;
}

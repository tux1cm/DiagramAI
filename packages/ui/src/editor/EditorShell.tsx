import { useCallback, useEffect, useRef, useState } from 'react';
import { arrangeCommands, decodeFragment, groupCommands, NODE_SHAPES, ungroupCommands, type Arrange, type DiagramCommand, type DiagramEdge, type DiagramStore, type EdgePatch, type NodePatch, type NodeShape, type PaletteShape } from '@diagramai/diagram-core';
import { DiagramCanvas, executeSafely, useDiagram, type CanvasHandle, type EditorTool } from '@diagramai/editor';
import { Icon } from './Icon';
import { Inspector, type InspectorTab } from './Inspector';
import { Modal } from './Modal';
import { Palette } from './Palette';
import { Toolbar } from './Toolbar';
import { Topbar } from './Topbar';

type Dialog = 'help' | 'cloud' | 'files' | null;
export function EditorShell({ store }: { store: DiagramStore }) {
  const state = useDiagram(store), document = state.document;
  const [tab, setTab] = useState<InspectorTab>('ai');
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => window.innerWidth < 930);
  const [dialog, setDialog] = useState<Dialog>(null), [notice, setNotice] = useState('');
  const [tool, setTool] = useState<EditorTool>('select'), [snap, setSnap] = useState(true), [zoom, setZoom] = useState(1);
  const [connectionStyle, setConnectionStyle] = useState<Pick<DiagramEdge, 'kind' | 'markerStart' | 'markerEnd'>>({ kind: 'curved', markerStart: 'none', markerEnd: 'arrow' });
  const canvas = useRef<CanvasHandle>(null);
  const close = useCallback(() => setDialog(null), []);
  const onError = useCallback((message: string) => setNotice(message), []);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timeout); }, [notice]);
  const execute = useCallback((commands: DiagramCommand[], label: string) => executeSafely(store, commands, label, onError), [store, onError]);
  const remove = useCallback(() => { const selected = store.getSnapshot().selection; if (selected.nodeIds.length || selected.edgeIds.length) execute([{ type: 'remove', ...selected }], 'Xóa đối tượng'); }, [store, execute]);
  const duplicate = useCallback(() => { try { store.duplicate(); } catch { onError('Không thể nhân đôi: vượt giới hạn hoặc thiếu đầu nối.'); } }, [store, onError]);
  const group = useCallback(() => { const current = store.getSnapshot(); execute(groupCommands(current.document, current.selection), 'Nhóm hình'); }, [store, execute]);
  const ungroup = useCallback(() => { const current = store.getSnapshot(); execute(ungroupCommands(current.document, current.selection), 'Bỏ nhóm'); }, [store, execute]);
  const arrange = (kind: Arrange) => execute(arrangeCommands(document, state.selection.nodeIds, kind), 'Căn chỉnh/lớp');
  const nodePatch = (patch: NodePatch) => state.selection.nodeIds.length > 0 && execute([{ type: 'update_nodes', ids: state.selection.nodeIds, patch }], 'Thuộc tính hình');
  const edgePatch = (patch: EdgePatch) => state.selection.edgeIds.length > 0 && execute([{ type: 'update_edges', ids: state.selection.edgeIds, patch }], 'Thuộc tính cạnh');
  const geometry = (patch: { x?: number; y?: number; width?: number; height?: number }) => state.selection.nodeIds.length > 0 && execute([{ type: 'geometry', values: state.selection.nodeIds.map((id) => ({ id, ...patch })) }], 'Vị trí/kích thước');
  const showAi = useCallback(() => { setInspectorCollapsed(false); setTab('ai'); }, []);
  const lineTool = useCallback((shape: PaletteShape) => {
    const style: Pick<DiagramEdge, 'kind' | 'markerStart' | 'markerEnd'> = { kind: shape === 'line' ? 'straight' : 'orthogonal', markerStart: shape === 'bidirectional' ? 'arrow' : 'none', markerEnd: shape === 'line' ? 'none' : 'arrow' };
    const { edgeIds } = store.getSnapshot().selection;
    if (edgeIds.length) {
      execute([{ type: 'update_edges', ids: edgeIds, patch: style }], 'Đổi loại đường nối');
      return;
    }
    setTool('link');
    setConnectionStyle(style);
    setNotice('Kéo từ một điểm neo của hình này sang hình khác để nối.');
  }, [store, execute]);
  const addShape = (shape: PaletteShape) => { if ((NODE_SHAPES as readonly string[]).includes(shape)) canvas.current?.addShape(shape as NodeShape); else lineTool(shape); };
  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable=true]'));
    const paste = async () => {
      try {
        if (store.hasClipboard()) { store.paste(); return; }
        const raw = await navigator.clipboard?.readText();
        if (!raw) return;
        store.setClipboard(decodeFragment(raw)); store.paste();
      } catch { onError('Clipboard không có dữ liệu DiagramAI hợp lệ hoặc quyền clipboard bị chặn.'); }
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || typing(event.target) || globalThis.document.querySelector('[aria-modal=true]')) return;
      const key = event.key.toLowerCase(), ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && ['z', 'y', 'a', 'c', 'v', 'x', 'd', 's', 'g'].includes(key)) {
        event.preventDefault();
        if (key === 'z') { if (event.shiftKey) store.redo(); else store.undo(); return; }
        if (key === 'y') { store.redo(); return; }
        if (key === 'a') { store.selectAll(); return; }
        if (key === 'd') { duplicate(); return; }
        if (key === 's') { setDialog('files'); return; }
        if (key === 'g') { if (event.shiftKey) ungroup(); else group(); return; }
        if (key === 'v') { void paste(); return; }
        const fragment = store.copySelection();
        if (fragment) {
          void navigator.clipboard?.writeText(JSON.stringify(fragment)).catch(() => { /* Internal clipboard still works. */ });
          if (key === 'x') remove();
          else setNotice('Đã sao chép. Clipboard nội bộ luôn dùng được trong phiên này.');
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
      else if (event.key === 'Escape') { store.cancelInteraction(); store.select([], []); setTool('select'); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const current = store.getSnapshot(), step = event.shiftKey ? 10 : 1;
        const selected = current.document.nodes.filter((node) => current.selection.nodeIds.includes(node.id));
        if (selected.length) { event.preventDefault(); execute([{ type: 'geometry', values: selected.map((node) => ({ id: node.id, x: node.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: node.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) })) }], 'Di chuyển bằng phím'); }
      } else if (!ctrl && !event.altKey && key === 'v') setTool('select');
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [store, execute, duplicate, remove, group, ungroup, onError]);
  const hasSelection = Boolean(state.selection.nodeIds.length || state.selection.edgeIds.length);
  return <div id="app" className="editor-app" data-phase="p3">
    <Topbar title={document.title} dirty={state.dirty} rename={(title) => execute([{ type: 'rename', title }], 'Đổi tên sơ đồ')} open={setDialog}/>
    <section className="workarea">
      <aside className="rail" aria-label="Công cụ">
        <button className={`railbtn ${paletteCollapsed ? '' : 'active'}`} title="Hình khối" aria-expanded={!paletteCollapsed} onClick={() => setPaletteCollapsed(!paletteCollapsed)}><Icon name="grid" size="lg"/></button>
        <button className={`railbtn ${tool === 'select' ? 'selected-tool' : ''}`} title="Chọn đối tượng" onClick={() => setTool('select')}><Icon name="cursor" size="lg"/></button>
        <button className={`railbtn ${tool === 'pan' ? 'active' : ''}`} title="Di chuyển canvas" onClick={() => setTool('pan')}><Icon name="hand" size="lg"/></button>
        <button className={`railbtn ${tool === 'link' ? 'active' : ''}`} title="Tạo đường nối" onClick={() => setTool('link')}><Icon name="link" size="lg"/></button>
        <button className="railbtn" title="Trợ lý AI" aria-expanded={!inspectorCollapsed} onClick={() => { setInspectorCollapsed(!inspectorCollapsed); setTab('ai'); }}><Icon name="sparkle" size="lg"/></button>
        <div className="rail-spacer"/><button className="railbtn" title="Hướng dẫn và trạng thái P3" onClick={() => setDialog('help')}><Icon name="help" size="lg"/></button>
      </aside>
      <Palette collapsed={paletteCollapsed} addShape={addShape}/>
      <main className="canvas-column"><Toolbar zoom={zoom} tool={tool} setTool={setTool} changeZoom={(value) => canvas.current?.zoomTo(value)} fit={() => canvas.current?.fit()} undo={() => store.undo()} redo={() => store.redo()} canUndo={Boolean(state.past.length || state.interaction)} canRedo={Boolean(state.future.length)} duplicate={duplicate} remove={remove} hasSelection={hasSelection}/>
        <DiagramCanvas ref={canvas} store={store} tool={tool} snap={snap} connectionStyle={connectionStyle} onTool={setTool} onZoom={setZoom} onLineTool={lineTool} onError={onError} onAi={showAi} fitIcon={<Icon name="fit"/>} aiIcon={<Icon name="sparkle"/>}/>
      </main>
      <Inspector document={document} selection={state.selection} activeTab={tab} setTab={setTab} collapsed={inspectorCollapsed} nodePatch={nodePatch} edgePatch={edgePatch} geometry={geometry} arrange={arrange} group={group} ungroup={ungroup} duplicate={duplicate} remove={remove} snap={snap} setSnap={setSnap}/>
      {notice && <div className="toast-stack" role="status"><div className="toast">{notice}</div></div>}
      {dialog && <Modal title={{ help: 'DiagramAI · Smart Connector P3', cloud: 'Đồng bộ chưa được bật', files: 'File và xuất ảnh · P4' }[dialog]} close={close}>
        {dialog === 'help' && <><p>Kéo/thả hình từ thư viện, kéo điểm neo để nối. Chọn hình để resize hoặc chỉnh kích thước ở Thuộc tính. Nhấp đúp hình/nhãn cạnh để sửa chữ; Enter xác nhận, Shift+Enter xuống dòng, Esc hủy.</p><p>Thả hình rời lên đường nối sáng tím để chèn A→C→B; Ctrl+Z khôi phục cả cạnh và vị trí hình. Không tự chèn hình đã có cạnh/nhóm hoặc tại nhiều đường chồng nhau. Nhãn điều kiện giữ trên đoạn trước hình mới.</p><p>Shift+Click hoặc kéo vùng trống để đa chọn. Ctrl+C/V/X/D/A, Ctrl+Z/Y, Ctrl+G/Shift+G, Delete và phím mũi tên; Space+kéo để pan. Lưới/guideline có thể tắt ở Thuộc tính. Nhấp đúp phần trăm zoom để nhập mức chính xác.</p><p>Chưa lưu local/file (P4), chưa sync/AI (P5/P6). Không đóng/refresh nếu muốn giữ nội dung phiên này.</p><a className="diagnostic-link" href="#/spike">Kiểm tra nền tảng</a></>}
        {dialog === 'cloud' && <><p>Chưa có đồng bộ dự án. Thay đổi hiện chỉ nằm trong bộ nhớ và mất khi tải lại. Đồng bộ Desktop ↔ Web thuộc P5; không có tài khoản hay token dự án được tạo.</p><a className="diagnostic-link" href="#/spike">Kiểm tra nền tảng</a></>}
        {dialog === 'files' && <p>Tạo/quản lý nhiều sơ đồ, mở/lưu .diagramai và xuất SVG/PNG/PDF sẽ triển khai ở P4. Ctrl+S hiện chỉ mở thông báo này, không giả báo đã lưu hoặc tự tải file.</p>}
      </Modal>}
    </section>
    <footer className="footer"><span>DiagramAI · <b>P3 smart connector</b> · Chưa lưu dữ liệu · <a href="#/spike">Kiểm tra nền tảng</a></span><span><span className="hide-small">{state.selection.nodeIds.length + state.selection.edgeIds.length} đang chọn &nbsp;·&nbsp; </span><b>{document.nodes.length} hình · {document.edges.length} đường nối</b> &nbsp;·&nbsp; <span>{Math.round(zoom * 100)}%</span></span></footer>
  </div>;
}

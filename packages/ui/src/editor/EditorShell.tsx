import { useCallback, useEffect, useRef, useState } from 'react';
import { arrangeCommands, decodeFragment, groupCommands, NODE_SHAPES, ungroupCommands, type Arrange, type DiagramCommand, type DiagramEdge, type DiagramStore, type EdgePatch, type NodePatch, type NodeShape, type PaletteShape } from '@diagramai/diagram-core';
import { DiagramCanvas, executeSafely, useDiagram, type CanvasHandle, type EditorTool } from '@diagramai/editor';
import { Icon } from './Icon';
import { Inspector, type InspectorTab } from './Inspector';
import { Modal } from './Modal';
import { Palette } from './Palette';
import { Toolbar } from './Toolbar';
import { Topbar } from './Topbar';
import type { ProjectSession, ProjectSessionSnapshot } from '@diagramai/local-storage';
import { useFileActions } from '../files/useFileActions';
import { ProjectsPanel } from '../files/ProjectsPanel';
import { ExportPanel } from '../files/ExportPanel';
import { CloudPanel, CLOUD_LABELS } from '../cloud/CloudPanel';
import type { CloudController } from '../cloud/useCloud';
import type { WorkspaceController } from '../workspace/useWorkspace';
import { WorkspacePanel } from '../workspace/WorkspacePanel';
import { isTauri } from '@tauri-apps/api/core';
import type { SharedController } from '../workspace/useShared';

type Dialog = 'help' | 'cloud' | 'files' | 'export' | null;
export function EditorShell({ store, session, local, basePath, cloud, workspace, shared }: { store: DiagramStore; session: ProjectSession; local: ProjectSessionSnapshot; basePath: string; cloud: CloudController; workspace: WorkspaceController; shared: SharedController }) {
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
  const files = useFileActions(session, onError);
  const saveFile = files.save;
  const saveStatus = { loading: 'Đang mở…', dirty: 'Chưa lưu · Có thay đổi', saving: 'Đang lưu trên máy…', saved: 'Đã lưu trên máy', error: 'Lỗi lưu trên máy', conflict: 'Xung đột · Chưa lưu' }[local.status];
  const browsing = shared.active ? shared.view !== 'editor' || !shared.catalog : workspace.view !== 'editor';
  const browse = () => { setDialog(null); if (shared.active) shared.library.showList(); else workspace.library.showProjects(); };
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
  const addShape = (shape: PaletteShape) => { if (browsing) return; if ((NODE_SHAPES as readonly string[]).includes(shape)) canvas.current?.addShape(shape as NodeShape); else lineTool(shape); };
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
      if (session.isExternalUpdating()) return;
      if (browsing) return;
      if (event.defaultPrevented || event.isComposing || typing(event.target) || globalThis.document.querySelector('[aria-modal=true]')) return;
      const key = event.key.toLowerCase(), ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && ['z', 'y', 'a', 'c', 'v', 'x', 'd', 's', 'g'].includes(key)) {
        event.preventDefault();
        if (key === 'z') { if (event.shiftKey) store.redo(); else store.undo(); return; }
        if (key === 'y') { store.redo(); return; }
        if (key === 'a') { store.selectAll(); return; }
        if (key === 'd') { duplicate(); return; }
         if (key === 's') { void saveFile(event.shiftKey); return; }
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
  }, [store, execute, duplicate, remove, group, ungroup, onError, saveFile, session, browsing]);
  const hasSelection = Boolean(state.selection.nodeIds.length || state.selection.edgeIds.length);
  const membership = workspace.state?.drawings.find((drawing) => drawing.localId === document.documentId);
  const projectTitle = shared.active ? shared.catalog?.folders[0]?.title : membership ? workspace.state?.folders.find((folder) => folder.id === membership.folderId)?.title : 'Chỉ trên máy';
  return <div id="app" className="editor-app" data-phase="p5">
    <Topbar title={document.title} projectTitle={projectTitle ?? 'Project'} browseTitle={browsing ? shared.active ? projectTitle ?? 'Link chia sẻ' : workspace.view === 'projects' ? 'Kho / Tất cả Project' : workspace.state?.folders.find((folder) => folder.id === workspace.state?.selectedFolderId)?.title ?? 'Project' : undefined} status={saveStatus} cloudStatus={!cloud.link ? membership ? 'Chờ gửi' : 'Chỉ local' : cloud.link.conflict ? 'Xung đột' : CLOUD_LABELS[cloud.state.status === 'local' ? 'pending' : cloud.state.status]} cloudBusy={cloud.busy || cloud.state.status === 'syncing'} save={() => void files.save()} openFile={() => void files.open()} rename={(title) => execute([{ type: 'rename', title }], 'Đổi tên sơ đồ')} open={(kind) => { if (kind === 'workspace' || kind === 'cloud' && !cloud.link) browse(); else setDialog(kind); }}/>
    {(local.status === 'error' || local.status === 'conflict' || local.message) && <div className="storage-banner" role="alert">{local.message} <button onClick={() => setDialog('files')}>Dự phòng / Khôi phục</button></div>}
    <section className="workarea">
      <aside className="rail" aria-label="Công cụ">
        <button className={`railbtn ${paletteCollapsed ? '' : 'active'}`} title="Hình khối" aria-expanded={!paletteCollapsed} onClick={() => setPaletteCollapsed(!paletteCollapsed)}><Icon name="grid" size="lg"/></button>
        <button className={`railbtn ${tool === 'select' ? 'selected-tool' : ''}`} title="Chọn đối tượng" onClick={() => setTool('select')}><Icon name="cursor" size="lg"/></button>
        <button className={`railbtn ${tool === 'pan' ? 'active' : ''}`} title="Di chuyển canvas" onClick={() => setTool('pan')}><Icon name="hand" size="lg"/></button>
        <button className={`railbtn ${tool === 'link' ? 'active' : ''}`} title="Tạo đường nối" onClick={() => setTool('link')}><Icon name="link" size="lg"/></button>
        <button className="railbtn" title="Trợ lý AI" aria-expanded={!inspectorCollapsed} onClick={() => { setInspectorCollapsed(!inspectorCollapsed); setTab('ai'); }}><Icon name="sparkle" size="lg"/></button>
        <button className={`railbtn ${browsing ? 'active' : ''}`} aria-busy={shared.active ? shared.busy : workspace.busy} title="Quản lý dự án" aria-label="Kho" onClick={browse}><Icon name="file" size="lg"/></button>
        <div className="rail-spacer"/><button className="railbtn" title="Hướng dẫn và trạng thái P5" onClick={() => setDialog('help')}><Icon name="help" size="lg"/></button>
      </aside>
      <Palette collapsed={paletteCollapsed} addShape={addShape}/>
      <main className="canvas-column"><Toolbar zoom={zoom} tool={tool} setTool={setTool} changeZoom={(value) => canvas.current?.zoomTo(value)} fit={() => canvas.current?.fit()} undo={() => { if (!browsing) store.undo(); }} redo={() => { if (!browsing) store.redo(); }} canUndo={!browsing && Boolean(state.past.length || state.interaction)} canRedo={!browsing && Boolean(state.future.length)} duplicate={duplicate} remove={remove} hasSelection={!browsing && hasSelection}/>
        {browsing ? <WorkspacePanel workspace={workspace} shared={shared} local={local} linkBase={isTauri() ? 'https://tux1cm.github.io/DiagramAI/' : new URL(basePath, window.location.origin).href} files={() => setDialog('files')}/> : <DiagramCanvas ref={canvas} store={store} tool={tool} snap={snap} connectionStyle={connectionStyle} onTool={setTool} onZoom={setZoom} onLineTool={lineTool} onError={onError} onAi={showAi} fitIcon={<Icon name="fit"/>} aiIcon={<Icon name="sparkle"/>}/>}
      </main>
      {!browsing && <Inspector document={document} selection={state.selection} activeTab={tab} setTab={setTab} collapsed={inspectorCollapsed} nodePatch={nodePatch} edgePatch={edgePatch} geometry={geometry} arrange={arrange} group={group} ungroup={ungroup} duplicate={duplicate} remove={remove} snap={snap} setSnap={setSnap}/>}
      {notice && <div className="toast-stack" role="status"><div className="toast">{notice}</div></div>}
       {dialog && <Modal title={{ help: 'DiagramAI · Đồng bộ P5', cloud: 'Trạng thái đồng bộ bản vẽ', files: 'Sơ đồ và file trên máy', export: 'Xuất SVG / PNG / PDF' }[dialog]} close={close}>
        {dialog === 'help' && <><p>Kéo/thả hình từ thư viện, kéo điểm neo để nối. Ctrl+kéo thân hình để nhân đôi; Ctrl+kéo góc để resize giữ tỷ lệ quanh tâm. Nhấp đúp hình/nhãn cạnh để sửa chữ; Enter xác nhận, Shift+Enter xuống dòng, Esc hủy.</p><p>Thả hình rời lên đường nối sáng tím để chèn A→C→B; Ctrl+Z khôi phục cả cạnh và vị trí hình. Nhãn điều kiện giữ trên đoạn trước hình mới.</p><p>Shift+Click hoặc kéo vùng trống để đa chọn. Ctrl+C/V/X/D/A, Ctrl+Z/Y, Ctrl+G/Shift+G, Delete và phím mũi tên; Space+kéo để pan.</p><p>Tự lưu local sau khi kết thúc chỉnh sửa. Ctrl+S lưu file, Ctrl+Shift+S lưu thành file mới. Quản lý chứa Dự án → Bản vẽ, dùng cùng link kho riêng trên Web/Desktop, không ghép từng bản. File/local/checkpoint vẫn riêng để dự phòng. Cloud giữ cả hai nhánh khi xung đột; hãy giữ link riêng và xuất .diagramai định kỳ. AI vẫn thuộc P6.</p><a className="diagnostic-link" href="#/spike">Kiểm tra nền tảng</a></>}
          {dialog === 'cloud' && <CloudPanel cloud={cloud} workspaceMode={Boolean(membership) || shared.active} document={document} notice={onError} saveLocal={() => void files.save(true, true)}/>}
         {dialog === 'files' && <ProjectsPanel session={session} state={local} close={close} notice={onError} saveFile={files.save} openFile={files.open}/>}
         {dialog === 'export' && <ExportPanel session={session} basePath={basePath} notice={onError}/>}
      </Modal>}
    </section>
    <footer className="footer"><span>DiagramAI · <b>P5 local + cloud</b> · {saveStatus} · <a href="#/spike">Kiểm tra nền tảng</a></span><span><span className="hide-small">{state.selection.nodeIds.length + state.selection.edgeIds.length} đang chọn &nbsp;·&nbsp; </span><b>{document.nodes.length} hình · {document.edges.length} đường nối</b> &nbsp;·&nbsp; <span>{Math.round(zoom * 100)}%</span></span></footer>
  </div>;
}

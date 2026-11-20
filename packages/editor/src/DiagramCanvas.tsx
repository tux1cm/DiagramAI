import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ForwardedRef, type ReactNode } from 'react';
import {
  ConnectionLineType, ConnectionMode, ReactFlow, ReactFlowProvider, SelectionMode, useNodesInitialized, useReactFlow,
  type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import { canInsertNode, insertNodeOnEdge, snapNode, createEdge, createNode, NODE_SHAPES, SHAPE_DEFINITIONS, type DiagramStore, type DiagramCommand, type DiagramEdge, type DiagramNode, type SnapGuide, type NodeShape, type PaletteShape } from '@diagramai/diagram-core';
import { EngineContext, executeSafely, useDiagram } from './context';
import { DiagramNodeView, type FlowNode } from './DiagramNode';
import { DiagramEdgeView, type FlowEdge } from './DiagramEdge';
import { hitTestEdges, type EdgeHit } from './hit-testing';
import { useDuplicateDrag } from './useDuplicateDrag';

export type EditorTool = 'select' | 'pan' | 'link' | 'text';
export interface CanvasHandle { zoomTo: (zoom: number) => void; fit: () => void; addShape: (shape: NodeShape) => void }
interface CanvasProps {
  store: DiagramStore; tool: EditorTool; snap: boolean;
  connectionStyle: Pick<DiagramEdge, 'kind' | 'markerStart' | 'markerEnd'>;
  onZoom: (zoom: number) => void; onTool: (tool: EditorTool) => void;
  onLineTool: (shape: PaletteShape) => void; onError: (message: string) => void; onAi: () => void;
  fitIcon?: ReactNode; aiIcon?: ReactNode;
}
const nodeTypes = { diagram: DiagramNodeView }, edgeTypes = { diagram: DiagramEdgeView };
function CanvasInner(props: CanvasProps & { canvasRef: ForwardedRef<CanvasHandle> }) {
  const { store, onError, onZoom, onTool, snap } = props;
  const state = useDiagram(store), document = state.document;
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const host = useRef<HTMLDivElement>(null), frame = useRef(0), additions = useRef(0);
  const [fitted, setFitted] = useState(false), [space, setSpace] = useState(false);
  const [insertion, setInsertion] = useState<EdgeHit | null>(null), [guides, setGuides] = useState<SnapGuide[]>([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [dragIds, setDragIds] = useState<string[]>([]);
  const dragging = useRef<{ ids: string[]; cancelled: boolean } | null>(null);
  const clearCues = useCallback(() => { setInsertion(null); setGuides([]); }, []);
  const duplicateCues = useCallback((hit: EdgeHit | null, lines: SnapGuide[]) => { setInsertion(hit); setGuides(lines); }, []);
  const duplicate = useDuplicateDrag({ store, host, enabled: props.tool === 'select' && !space, snap, onError, onCues: duplicateCues });
  const measured = useNodesInitialized();
  const execute = useCallback((commands: DiagramCommand[], label: string) => executeSafely(store, commands, label, onError), [store, onError]);
  const fit = useCallback(() => {
    const bounds = host.current?.getBoundingClientRect();
    if (!bounds) return;
    const nodes = store.getSnapshot().document.nodes;
    let view = { x: 0, y: 0, zoom: 1 };
    if (nodes.length) {
      const minX = Math.min(...nodes.map((node) => node.x)), minY = Math.min(...nodes.map((node) => node.y));
      const width = Math.max(...nodes.map((node) => node.x + node.width)) - minX, height = Math.max(...nodes.map((node) => node.y + node.height)) - minY;
      const zoom = Math.min(1, Math.max(.2, Math.min((bounds.width - 100) / Math.max(width, 1), (bounds.height - 140) / Math.max(height, 1))));
      view = { zoom, x: (bounds.width - width * zoom) / 2 - minX * zoom, y: (bounds.height - height * zoom) / 2 - minY * zoom + 10 };
    }
    void flow.setViewport(view, { duration: 0 }).then(() => { onZoom(view.zoom); setFitted(true); });
  }, [store, flow, onZoom]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable=true],[role=dialog]'));
    const cancel = () => { if (dragging.current) { dragging.current.cancelled = true; store.cancelInteraction(); } setDragIds([]); clearCues(); };
    const down = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !typing(event.target) && !documentGlobal().querySelector('[aria-modal=true]')) { event.preventDefault(); setSpace(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    const blur = () => { setSpace(false); cancel(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('pointercancel', cancel); };
  }, [store, clearCues]);
  const addAt = useCallback((shape: NodeShape, screen: { x: number; y: number }, allowInsert = false) => {
    const point = flow.screenToFlowPosition(screen), size = SHAPE_DEFINITIONS[shape].defaultSize;
    const x = point.x - size.width / 2, y = point.y - size.height / 2;
    const node = createNode(shape, snap ? Math.round(x / 10) * 10 : x, snap ? Math.round(y / 10) * 10 : y);
    const hit = allowInsert && host.current ? hitTestEdges(host.current, screen) : null;
    const command = hit ? insertNodeOnEdge(hit.edgeId, node, hit.point, hit.tangent) : { type: 'add_nodes' as const, nodes: [node] };
    if (execute([command], hit ? 'Chèn hình vào đường nối' : 'Thêm hình')) {
      store.select([node.id], []); onTool('select');
      if (hit && document.edges.find((edge) => edge.id === hit.edgeId)?.label) onError('Đã giữ nhãn điều kiện trên đoạn trước hình mới. Bạn có thể đổi nhãn ở Thuộc tính.');
    }
    clearCues();
  }, [flow, snap, onTool, store, execute, document.edges, onError, clearCues]);
  useImperativeHandle(props.canvasRef, () => ({
    fit,
    zoomTo: (zoom) => { void flow.zoomTo(Math.max(.2, Math.min(3, zoom)), { duration: 0 }).then(() => onZoom(flow.getZoom())); },
    addShape: (shape) => { const bounds = host.current?.getBoundingClientRect(); if (bounds) { const offset = additions.current++ % 5 * 20; addAt(shape, { x: bounds.left + bounds.width / 2 + offset, y: bounds.top + bounds.height / 2 + offset }); } },
  }), [fit, flow, onZoom, addAt]);
  const nodes: FlowNode[] = useMemo(() => [...document.nodes, ...duplicate.previews.filter((preview) => !document.nodes.some((node) => node.id === preview.id))].map((node) => ({
    // A preview has no handles. Use a distinct RF-only key so the committed
    // copy mounts with fresh handle measurements instead of cached empty bounds.
    id: duplicate.previews.includes(node) ? `preview-${node.id}` : node.id, type: 'diagram', position: { x: node.x, y: node.y }, data: { value: node, preview: duplicate.previews.includes(node) },
    // Fixed-size SVG nodes have authoritative dimensions. Keep RF's controlled
    // measured field in the adapter, not in document/history, so initialization
    // and handle measurement do not keep resetting after every domain update.
    style: { width: node.width, height: node.height }, width: node.width, height: node.height, measured: { width: node.width, height: node.height },
    selected: state.selection.nodeIds.includes(node.id), zIndex: duplicate.previews.includes(node) ? 10001 : node.zIndex,
    draggable: duplicate.previews.includes(node) ? false : undefined, selectable: duplicate.previews.includes(node) ? false : undefined, connectable: duplicate.previews.includes(node) ? false : undefined,
    className: duplicate.previews.includes(node) ? 'duplicate-preview-node' : undefined,
    ariaLabel: duplicate.previews.includes(node) ? undefined : `Hình ${node.text || SHAPE_DEFINITIONS[node.type].name}`, ariaRole: duplicate.previews.includes(node) ? 'presentation' : 'button',
  })), [document.nodes, state.selection.nodeIds, duplicate.previews]);
  const edges: FlowEdge[] = useMemo(() => document.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
    type: 'diagram', data: { value: edge }, selected: state.selection.edgeIds.includes(edge.id), ariaLabel: `Đường nối ${edge.label || 'không nhãn'}`, ariaRole: 'button',
  })), [document.edges, state.selection.edgeIds]);
  const geometry = (values: { id: string; x?: number; y?: number }[]) => {
    if (!values.length) return;
    if (dragging.current?.cancelled) return;
    try {
      const current = store.getSnapshot();
      if (snap && dragging.current && values[0].x !== undefined && values[0].y !== undefined) {
        const moving = current.document.nodes.find((node) => node.id === values[0].id)!;
        const result = snapNode({ ...moving, x: values[0].x, y: values[0].y }, current.document.nodes.filter((node) => !dragging.current!.ids.includes(node.id)), flow.getZoom());
        const dx = result.x - values[0].x, dy = result.y - values[0].y;
        values = values.map((value) => ({ ...value, x: value.x === undefined ? undefined : value.x + dx, y: value.y === undefined ? undefined : value.y + dy }));
        setGuides(result.guides);
      }
      if (store.getSnapshot().interaction) store.updateInteraction([{ type: 'geometry', values }]);
      else execute([{ type: 'geometry', values }], 'Di chuyển');
    } catch { store.cancelInteraction(); onError('Vị trí hình không hợp lệ.'); }
  };
  const insertionFor = (node: DiagramNode) => {
    if (!host.current || !canInsertNode(store.getSnapshot().document, node.id)) return null;
    const center = flow.flowToScreenPosition({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
    return hitTestEdges(host.current, center, new Set([node.id]));
  };
  const startDrag = (moved: FlowNode[]) => {
    dragging.current = { ids: moved.map((node) => node.id), cancelled: false };
    setDragIds(dragging.current.ids);
    if (!store.getSnapshot().interaction) store.beginInteraction('Di chuyển');
  };
  const stopDrag = (moved: FlowNode[]) => {
    if (dragging.current?.cancelled) { dragging.current = null; setDragIds([]); clearCues(); return; }
    if (!store.getSnapshot().interaction) { setDragIds([]); clearCues(); return; }
    const draft = store.getSnapshot();
    const hasMoved = moved.some((item) => {
      const before = draft.interaction?.before.nodes.find((node) => node.id === item.id), live = draft.document.nodes.find((node) => node.id === item.id);
      return before && live && (before.x !== live.x || before.y !== live.y);
    });
    // With a zero drag threshold a plain click also reaches this callback.
    // Never grid-snap that click or consume history just by selecting a shape.
    if (!hasMoved) { store.finishInteraction(); dragging.current = null; setDragIds([]); clearCues(); return; }
    geometry(moved.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })));
    const current = store.getSnapshot(), node = moved.length === 1 ? current.document.nodes.find((item) => item.id === moved[0].id) : undefined;
    const before = node ? current.interaction?.before.nodes.find((item) => item.id === node.id) : undefined;
    const hit = node && before && (node.x !== before.x || node.y !== before.y) ? insertionFor(node) : null;
    try {
      store.finishInteraction(hit && node ? [insertNodeOnEdge(hit.edgeId, node, hit.point, hit.tangent)] : [], hit ? 'Chèn hình vào đường nối' : undefined);
      if (hit && current.document.edges.find((edge) => edge.id === hit.edgeId)?.label) onError('Đã giữ nhãn điều kiện trên đoạn trước hình mới. Bạn có thể đổi nhãn ở Thuộc tính.');
    } catch { store.finishInteraction(); onError('Không thể chèn hình vào đường nối; đã giữ nguyên các cạnh.'); }
    dragging.current = null; setDragIds([]); clearCues();
  };
  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    const current = store.getSnapshot(), selection = new Set(current.selection.nodeIds);
    let changed = false;
    for (const change of changes) if (change.type === 'select') { changed = true; if (change.selected) selection.add(change.id); else selection.delete(change.id); }
    if (changed) store.select([...selection], current.selection.edgeIds);
    const positions = changes.filter((change) => change.type === 'position' && change.position && current.document.nodes.some((node) => node.id === change.id));
    if (positions.some((change) => change.type === 'position' && change.dragging) && !store.getSnapshot().interaction) store.beginInteraction('Di chuyển');
    geometry(positions.flatMap((change) => change.type === 'position' && change.position ? [{ id: change.id, x: change.position.x, y: change.position.y }] : []));
  };
  const onEdgesChange = (changes: EdgeChange<FlowEdge>[]) => {
    const current = store.getSnapshot(), selection = new Set(current.selection.edgeIds);
    for (const change of changes) if (change.type === 'select') { if (change.selected) selection.add(change.id); else selection.delete(change.id); }
    store.select(current.selection.nodeIds, [...selection]);
  };
  const connect = (connection: Connection) => {
    if (!connection.sourceHandle || !connection.targetHandle) return;
    const edge = createEdge(connection.source, connection.target, connection.sourceHandle as DiagramEdge['sourceHandle'], connection.targetHandle as DiagramEdge['targetHandle'], props.connectionStyle);
    if (execute([{ type: 'add_edges', edges: [edge] }], 'Nối hình')) store.select([], [edge.id]);
  };
  const context = useMemo(() => ({ store, onError, insertionEdgeId: insertion?.edgeId, routingExcludedNodeIds: dragIds }), [store, onError, insertion?.edgeId, dragIds]);
  return <EngineContext.Provider value={context}><div id="canvasHost" className={`canvas-host engine-host tool-${props.tool}`} ref={host} data-insert-edge={insertion?.edgeId} data-ready={fitted && (measured || !nodes.length) ? 'true' : 'false'} tabIndex={0} aria-label="Vùng vẽ sơ đồ"
    onPointerDownCapture={duplicate.start} onMouseDownCapture={(event) => { if (duplicate.active()) { event.preventDefault(); event.stopPropagation(); } }}>
    <div className="stage-header"><div className="stage-eyebrow">KHÔNG GIAN LÀM VIỆC</div><div className="stage-title">{document.title}</div><div className="stage-description">Kéo thả hình khối • nối thông minh • AI hỗ trợ</div></div>
    <ReactFlow<FlowNode, FlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onInit={() => { frame.current = requestAnimationFrame(fit); }} onMove={(_event, view) => { props.onZoom(view.zoom); setViewport(view); }}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onNodeDragStart={(_event, _node, moved) => startDrag(moved)}
      onNodeDrag={(_event, node, moved) => { const live = store.getSnapshot().document.nodes.find((item) => item.id === node.id); setInsertion(moved.length === 1 && live && !dragging.current?.cancelled ? insertionFor({ ...live, x: node.position.x, y: node.position.y }) : null); }}
      onNodeDragStop={(_event, _node, moved) => stopDrag(moved)}
      onSelectionDragStart={(_event, moved) => startDrag(moved)}
      onSelectionDragStop={(_event, moved) => stopDrag(moved)}
       onConnect={connect} connectionMode={ConnectionMode.Loose} isValidConnection={(connection) => Boolean(connection.source && connection.target && connection.source !== connection.target)}
       connectionLineType={props.connectionStyle.kind === 'curved' ? ConnectionLineType.Bezier : props.connectionStyle.kind === 'straight' ? ConnectionLineType.Straight : props.connectionStyle.kind === 'smoothstep' ? ConnectionLineType.SmoothStep : ConnectionLineType.Step}
      onReconnect={(edge, connection) => { if (connection.sourceHandle && connection.targetHandle) execute([{ type: 'update_edges', ids: [edge.id], patch: { source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle as DiagramEdge['sourceHandle'], targetHandle: connection.targetHandle as DiagramEdge['targetHandle'] } }], 'Đổi đầu nối'); }}
      onPaneClick={(event) => { if (props.tool === 'text') addAt('text', { x: event.clientX, y: event.clientY }); else store.select([], []); }}
      minZoom={.2} maxZoom={3} zoomOnDoubleClick={false} snapToGrid={false} nodeDragThreshold={0}
      nodesDraggable={props.tool === 'select' && !space} nodesConnectable={props.tool !== 'pan' && !space}
      selectionOnDrag={props.tool === 'select' && !space} selectionMode={SelectionMode.Partial} selectionKeyCode={null}
      multiSelectionKeyCode={['Shift', 'Control', 'Meta']} panOnDrag={props.tool === 'pan' || space ? true : [1]} panActivationKeyCode={null}
      deleteKeyCode={null} disableKeyboardA11y proOptions={{ hideAttribution: true }} onError={(_code, message) => onError(message)}
      onDrop={(event) => { event.preventDefault(); const shape = event.dataTransfer.getData('application/x-diagramai-shape'); if ((NODE_SHAPES as readonly string[]).includes(shape)) addAt(shape as NodeShape, { x: event.clientX, y: event.clientY }, true); else if (['arrow', 'line', 'bidirectional'].includes(shape)) props.onLineTool(shape as PaletteShape); clearCues(); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-diagramai-shape')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setInsertion(host.current ? hitTestEdges(host.current, { x: event.clientX, y: event.clientY }) : null); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) clearCues(); }}/>
    <svg className="snap-overlay" aria-hidden="true">{guides.map((guide) => guide.axis === 'x'
      ? <line key="x" data-guide="x" x1={viewport.x + guide.position * viewport.zoom} x2={viewport.x + guide.position * viewport.zoom} y1={viewport.y + guide.start * viewport.zoom} y2={viewport.y + guide.end * viewport.zoom}/>
      : <line key="y" data-guide="y" y1={viewport.y + guide.position * viewport.zoom} y2={viewport.y + guide.position * viewport.zoom} x1={viewport.x + guide.start * viewport.zoom} x2={viewport.x + guide.end * viewport.zoom}/>)}
      {insertion && <circle className="insertion-point" cx={viewport.x + insertion.point.x * viewport.zoom} cy={viewport.y + insertion.point.y * viewport.zoom} r="8"/>}</svg>
    {insertion && <div className="insertion-hint" role="status">Thả để chèn vào đường nối · Ctrl+Z để hoàn tác</div>}
    {!!duplicate.previews.length && !insertion && <div className="insertion-hint" role="status">Thả để nhân đôi · Esc để hủy</div>}
    <div className="floating-hint"><span className="kbd">Space</span> Di chuyển <span className="kbd">Ctrl+D</span> Nhân đôi <span className="kbd">Delete</span> Xóa</div>
    <div className="canvas-actions"><button className="circular" title="Khôi phục khung nhìn" onClick={fit}>{props.fitIcon ?? '↔'}</button><button className="circular" title="Hiện trợ lý AI" onClick={props.onAi}>{props.aiIcon ?? '✦'}</button></div>
  </div></EngineContext.Provider>;
}
// Avoid shadowing the browser document with the domain document above.
function documentGlobal() { return globalThis.document; }
export const DiagramCanvas = forwardRef<CanvasHandle, CanvasProps>(function DiagramCanvas(props, ref) { return <ReactFlowProvider><CanvasInner {...props} canvasRef={ref}/></ReactFlowProvider>; });

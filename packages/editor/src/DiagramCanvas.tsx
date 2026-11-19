import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ForwardedRef, type ReactNode } from 'react';
import {
  ConnectionMode, ReactFlow, ReactFlowProvider, SelectionMode, useNodesInitialized, useReactFlow,
  type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import { createEdge, createNode, NODE_SHAPES, SHAPE_DEFINITIONS, type DiagramStore, type DiagramCommand, type DiagramEdge, type NodeShape, type PaletteShape } from '@diagramai/diagram-core';
import { EngineContext, executeSafely, useDiagram } from './context';
import { DiagramNodeView, type FlowNode } from './DiagramNode';
import { DiagramEdgeView, type FlowEdge } from './DiagramEdge';

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
    const down = (event: KeyboardEvent) => { if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !typing(event.target) && !documentGlobal().querySelector('[aria-modal=true]')) { event.preventDefault(); setSpace(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  const addAt = useCallback((shape: NodeShape, screen: { x: number; y: number }) => {
    const point = flow.screenToFlowPosition(screen), size = SHAPE_DEFINITIONS[shape].defaultSize;
    const x = point.x - size.width / 2, y = point.y - size.height / 2;
    const node = createNode(shape, snap ? Math.round(x / 10) * 10 : x, snap ? Math.round(y / 10) * 10 : y);
    if (execute([{ type: 'add_nodes', nodes: [node] }], 'Thêm hình')) { store.select([node.id], []); onTool('select'); }
  }, [flow, snap, onTool, store, execute]);
  useImperativeHandle(props.canvasRef, () => ({
    fit,
    zoomTo: (zoom) => { void flow.zoomTo(Math.max(.2, Math.min(3, zoom)), { duration: 0 }).then(() => onZoom(flow.getZoom())); },
    addShape: (shape) => { const bounds = host.current?.getBoundingClientRect(); if (bounds) { const offset = additions.current++ % 5 * 20; addAt(shape, { x: bounds.left + bounds.width / 2 + offset, y: bounds.top + bounds.height / 2 + offset }); } },
  }), [fit, flow, onZoom, addAt]);
  const nodes: FlowNode[] = useMemo(() => document.nodes.map((node) => ({
    id: node.id, type: 'diagram', position: { x: node.x, y: node.y }, data: { value: node },
    // Fixed-size SVG nodes have authoritative dimensions. Keep RF's controlled
    // measured field in the adapter, not in document/history, so initialization
    // and handle measurement do not keep resetting after every domain update.
    style: { width: node.width, height: node.height }, width: node.width, height: node.height, measured: { width: node.width, height: node.height },
    selected: state.selection.nodeIds.includes(node.id), zIndex: node.zIndex,
    ariaLabel: `Hình ${node.text || SHAPE_DEFINITIONS[node.type].name}`, ariaRole: 'button',
  })), [document.nodes, state.selection.nodeIds]);
  const edges: FlowEdge[] = useMemo(() => document.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
    type: 'diagram', data: { value: edge }, selected: state.selection.edgeIds.includes(edge.id), ariaLabel: `Đường nối ${edge.label || 'không nhãn'}`, ariaRole: 'button',
  })), [document.edges, state.selection.edgeIds]);
  const geometry = (values: { id: string; x?: number; y?: number }[]) => {
    if (!values.length) return;
    try {
      if (store.getSnapshot().interaction) store.updateInteraction([{ type: 'geometry', values }]);
      else execute([{ type: 'geometry', values }], 'Di chuyển');
    } catch { store.cancelInteraction(); onError('Vị trí hình không hợp lệ.'); }
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
  const context = useMemo(() => ({ store, onError }), [store, onError]);
  return <EngineContext.Provider value={context}><div id="canvasHost" className={`canvas-host engine-host tool-${props.tool}`} ref={host} data-ready={fitted && (measured || !nodes.length) ? 'true' : 'false'} tabIndex={0} aria-label="Vùng vẽ sơ đồ">
    <div className="stage-header"><div className="stage-eyebrow">KHÔNG GIAN LÀM VIỆC</div><div className="stage-title">{document.title}</div><div className="stage-description">Kéo thả hình khối • nối thông minh • AI hỗ trợ</div></div>
    <ReactFlow<FlowNode, FlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onInit={() => { frame.current = requestAnimationFrame(fit); }} onMove={(_event, view) => props.onZoom(view.zoom)}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onNodeDragStart={() => { if (!store.getSnapshot().interaction) store.beginInteraction('Di chuyển'); }}
      onNodeDragStop={(_event, _node, moved) => { geometry(moved.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }))); store.finishInteraction(); }}
      onSelectionDragStart={() => { if (!store.getSnapshot().interaction) store.beginInteraction('Di chuyển nhóm'); }}
      onSelectionDragStop={(_event, moved) => { geometry(moved.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }))); store.finishInteraction(); }}
      onConnect={connect} connectionMode={ConnectionMode.Loose} isValidConnection={(connection) => Boolean(connection.source && connection.target && connection.source !== connection.target)}
      onReconnect={(edge, connection) => { if (connection.sourceHandle && connection.targetHandle) execute([{ type: 'update_edges', ids: [edge.id], patch: { source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle as DiagramEdge['sourceHandle'], targetHandle: connection.targetHandle as DiagramEdge['targetHandle'] } }], 'Đổi đầu nối'); }}
      onPaneClick={(event) => { if (props.tool === 'text') addAt('text', { x: event.clientX, y: event.clientY }); else store.select([], []); }}
      minZoom={.2} maxZoom={3} zoomOnDoubleClick={false} snapToGrid={props.snap} snapGrid={[10, 10]}
      nodesDraggable={props.tool === 'select' && !space} nodesConnectable={props.tool !== 'pan' && !space}
      selectionOnDrag={props.tool === 'select' && !space} selectionMode={SelectionMode.Partial} selectionKeyCode={null}
      multiSelectionKeyCode={['Shift', 'Control', 'Meta']} panOnDrag={props.tool === 'pan' || space ? true : [1]} panActivationKeyCode={null}
      deleteKeyCode={null} disableKeyboardA11y proOptions={{ hideAttribution: true }} onError={(_code, message) => onError(message)}
      onDrop={(event) => { event.preventDefault(); const shape = event.dataTransfer.getData('application/x-diagramai-shape'); if ((NODE_SHAPES as readonly string[]).includes(shape)) addAt(shape as NodeShape, { x: event.clientX, y: event.clientY }); else if (['arrow', 'line', 'bidirectional'].includes(shape)) props.onLineTool(shape as PaletteShape); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-diagramai-shape')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}/>
    <div className="floating-hint"><span className="kbd">Space</span> Di chuyển <span className="kbd">Ctrl+D</span> Nhân đôi <span className="kbd">Delete</span> Xóa</div>
    <div className="canvas-actions"><button className="circular" title="Khôi phục khung nhìn" onClick={fit}>{props.fitIcon ?? '↔'}</button><button className="circular" title="Hiện trợ lý AI" onClick={props.onAi}>{props.aiIcon ?? '✦'}</button></div>
  </div></EngineContext.Provider>;
}
// Avoid shadowing the browser document with the domain document above.
function documentGlobal() { return globalThis.document; }
export const DiagramCanvas = forwardRef<CanvasHandle, CanvasProps>(function DiagramCanvas(props, ref) { return <ReactFlowProvider><CanvasInner {...props} canvasRef={ref}/></ReactFlowProvider>; });

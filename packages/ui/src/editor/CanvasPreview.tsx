import type { RefObject } from 'react';
import type { EditorViewState, Port, Selection } from './fixture';
import { edgeGeometry, portPoint, previewTextLines } from './preview-layout';
import { Shape } from './Shape';
import { Icon } from './Icon';

export function CanvasPreview({ state, hostRef, view, ready, select, onFit, onAi }: {
  state: EditorViewState; hostRef: RefObject<HTMLDivElement | null>;
  view: { zoom: number; x: number; y: number }; ready: boolean;
  select: (selection: Selection) => void; onFit: () => void; onAi: () => void;
}) {
  return <div id="canvasHost" className="canvas-host" ref={hostRef} tabIndex={0} aria-label="Vùng xem sơ đồ mẫu" data-ready={ready ? 'true' : 'false'} onClick={() => select(null)} onKeyDown={(event) => { if (event.key === 'Escape') select(null); }}>
    <div className="stage-header"><div className="stage-eyebrow">KHÔNG GIAN LÀM VIỆC</div><div className="stage-title">{state.title}</div><div className="stage-description">Kéo thả hình khối • nối thông minh • AI hỗ trợ</div></div>
    <svg id="diagram" className="diagram-svg" xmlns="http://www.w3.org/2000/svg" aria-label="Sơ đồ mẫu P1, chỉ xem và thử màu">
      <defs>{['arrowHead', 'arrowBlue'].map((id) => <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={id === 'arrowHead' ? '#8392ad' : '#566dfa'}/></marker>)}</defs>
      <g id="diagramScene" transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        <g id="edgeLayer">{state.edges.map((edge) => {
          const geometry = edgeGeometry(edge, state.nodes);
          if (!geometry) return null;
          const selected = state.selection?.kind === 'edge' && state.selection.id === edge.id;
          return <g key={edge.id} data-edge={edge.id} className={selected ? 'edge-selected' : ''} role="button" tabIndex={0} aria-label={`Đường nối ${edge.label || edge.id}`} onClick={(event) => { event.stopPropagation(); select({ kind: 'edge', id: edge.id }); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select({ kind: 'edge', id: edge.id }); } }}>
            <path className="edge-hit" d={geometry.path}/>
            <path className="edge-line" d={geometry.path} fill="none" stroke="#8392ad" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${selected ? 'arrowBlue' : 'arrowHead'})`}/>
            {edge.label && <><rect x={geometry.label.x - 24} y={geometry.label.y - 18} width="48" height="21" rx="8" fill="#fff" stroke="#e9edf5"/><text x={geometry.label.x} y={geometry.label.y - 4} textAnchor="middle" fontSize="11" fontFamily="Inter,Segoe UI,Arial" fontWeight="700" fill="#6b7890">{edge.label}</text></>}
          </g>;
        })}</g>
        <g id="nodeLayer">{state.nodes.map((node) => {
          const selected = state.selection?.kind === 'node' && state.selection.id === node.id;
          const lines = previewTextLines(node.label, node.w);
          return <g key={node.id} data-node={node.id} className={`svg-node ${selected ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`Hình mẫu ${node.label}`} onClick={(event) => { event.stopPropagation(); select({ kind: 'node', id: node.id }); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select({ kind: 'node', id: node.id }); } }}>
            {selected && <rect x={node.x - 4} y={node.y - 4} width={node.w + 8} height={node.h + 8} rx="7" fill="none" stroke="#546df4" strokeWidth="1.4" strokeDasharray="4 4" pointerEvents="none"/>}
            <g className="node-border" fill={node.fill} stroke={node.stroke} strokeWidth="1.7" strokeLinejoin="round"><Shape type={node.type} x={node.x} y={node.y} w={node.w} h={node.h}/></g>
            {lines.map((line, i) => <text key={i} x={node.x + node.w / 2} y={node.y + node.h / 2 - (lines.length - 1) * 8 + 4 + i * 16} fill="#314363" fontFamily="Inter, Segoe UI, Arial" fontSize="13" fontWeight="600" textAnchor="middle" pointerEvents="none">{line}</text>)}
            {(['top', 'right', 'bottom', 'left'] as Port[]).map((port) => { const point = portPoint(node, port); return <circle key={port} data-port={port} cx={point.x} cy={point.y} r="5.7" fill="#fff" stroke="#5875f5" strokeWidth="2" className="port" pointerEvents="none"><title>Điểm neo tham chiếu · Nối hình thuộc P2</title></circle>; })}
          </g>;
        })}</g>
      </g>
    </svg>
    <div className="floating-hint"><span className="kbd">P1</span> Chọn hình để thử màu · Chưa lưu dữ liệu</div>
    <div className="canvas-actions"><button className="circular" onClick={(event) => { event.stopPropagation(); onFit(); }} title="Khôi phục khung nhìn"><Icon name="fit"/></button><button className="circular" onClick={(event) => { event.stopPropagation(); onAi(); }} title="Hiện trợ lý AI"><Icon name="sparkle"/></button></div>
  </div>;
}

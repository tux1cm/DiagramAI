import { renderToStaticMarkup } from 'react-dom/server';
import { getSmoothStepPath, Position } from '@xyflow/react';
import { parseDocument, SHAPE_DEFINITIONS, type DiagramDocument, type DiagramEdge, type DiagramNode, type Port } from '@diagramai/diagram-core';
import { Shape } from './Shape';
import { arrowSize, curvedPath, orthogonalPath } from './edge-geometry';
import { ArrowMarker } from './ArrowMarker';
import { linesFor } from './text-layout';

const positions = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
function port(node: DiagramNode, side: Port) {
  return { x: node.x + (side === 'left' ? 0 : side === 'right' ? node.width : node.width / 2), y: node.y + (side === 'top' ? 0 : side === 'bottom' ? node.height : node.height / 2) };
}
function edgeGeometry(edge: DiagramEdge, document: DiagramDocument) {
  const source = port(document.nodes.find((node) => node.id === edge.source)!, edge.sourceHandle), target = port(document.nodes.find((node) => node.id === edge.target)!, edge.targetHandle);
  const params = { sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y, sourcePosition: positions[edge.sourceHandle], targetPosition: positions[edge.targetHandle] };
  if (edge.kind === 'curved') return curvedPath(params, Math.max(20, arrowSize(edge.style.strokeWidth) + 4));
  if (edge.kind === 'smoothstep') return getSmoothStepPath(params);
  if (edge.kind === 'orthogonal') return orthogonalPath(params, document.nodes, edge.source, edge.target);
  return [`M${source.x},${source.y} L${target.x},${target.y}`, (source.x + target.x) / 2, (source.y + target.y) / 2] as const;
}
export function renderDiagramSvg(input: DiagramDocument, options: { transparent?: boolean; fontFamily?: string; fontCss?: string } = {}) {
  const document = parseDocument(input), edges = document.edges.map((edge) => ({ edge, geometry: edgeGeometry(edge, document), labelWidth: Math.max(48, edge.label.length * edge.style.fontSize * .57 + 12) }));
  const boxes = document.nodes.map((node) => ({ x: node.x, y: node.y, right: node.x + node.width, bottom: node.y + node.height }));
  for (const { edge, geometry, labelWidth } of edges) {
    const values = geometry[0].match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    for (let i = 0; i < values.length; i += 2) boxes.push({ x: values[i], y: values[i + 1], right: values[i], bottom: values[i + 1] });
    if (edge.label) boxes.push({ x: geometry[1] - labelWidth / 2, right: geometry[1] + labelWidth / 2, y: geometry[2] - 22, bottom: geometry[2] + 10 });
  }
  const padding = Math.max(32, ...document.edges.map((edge) => edge.style.strokeWidth * 8));
  const x = boxes.length ? Math.min(...boxes.map((box) => box.x)) - padding : 0, y = boxes.length ? Math.min(...boxes.map((box) => box.y)) - padding : 0;
  const width = boxes.length ? Math.max(64, Math.max(...boxes.map((box) => box.right)) + padding - x) : 640;
  const height = boxes.length ? Math.max(64, Math.max(...boxes.map((box) => box.bottom)) + padding - y) : 480;
  const svg = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${x} ${y} ${width} ${height}`} role="img" aria-label={document.title}>
    <title>{document.title}</title>{options.fontCss && <style>{options.fontCss}</style>}
    {!options.transparent && <rect x={x} y={y} width={width} height={height} fill="#ffffff"/>}
    <g strokeLinecap="round" strokeLinejoin="round">{edges.map(({ edge, geometry: [path, lx, ly], labelWidth }) => <g key={edge.id}>
      <defs>{(['start', 'end'] as const).map((end) => <ArrowMarker key={end} id={`export-${end}-${edge.id}`} color={edge.style.stroke} size={arrowSize(edge.style.strokeWidth)}/>)}</defs>
      <path d={path} fill="none" stroke={edge.style.stroke} strokeWidth={edge.style.strokeWidth} strokeDasharray={edge.style.dashed ? '6 4' : undefined} markerStart={edge.markerStart === 'arrow' ? `url(#export-start-${edge.id})` : undefined} markerEnd={edge.markerEnd === 'arrow' ? `url(#export-end-${edge.id})` : undefined}/>
      {edge.label && <g><rect x={lx - labelWidth / 2} y={ly - 18} width={labelWidth} height="21" rx="8" fill="#ffffff" stroke="#e9edf5"/><text x={lx} y={ly - 4} textAnchor="middle" fontSize={edge.style.fontSize} fontFamily={options.fontFamily ?? 'Inter, Segoe UI, Arial'} fontWeight="700" fill={edge.style.textColor}>{edge.label}</text></g>}
    </g>)}</g>
    {[...document.nodes].sort((a, b) => a.zIndex - b.zIndex).map((node) => {
      const region = SHAPE_DEFINITIONS[node.type].textRegion, rx = region.x * node.width, ry = region.y * node.height, rw = region.width * node.width, rh = region.height * node.height;
      const lines = linesFor(node.text, rw, node.style.fontSize), lineHeight = node.style.fontSize * 16 / 13;
      const baseline = ry + rh / 2 - (lines.length - 1) * lineHeight / 2 + node.style.fontSize * 4 / 13;
      return <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
        <defs><clipPath id={`export-text-${node.id}`}><rect x={rx} y={ry} width={rw} height={rh}/></clipPath></defs>
        <g fill={node.style.fill} stroke={node.style.stroke} strokeWidth={node.style.strokeWidth} strokeDasharray={node.style.dashed ? '6 4' : undefined} strokeLinejoin="round"><Shape type={node.type} x={0} y={0} w={node.width} h={node.type === 'actor' ? node.height * .73 : node.height}/></g>
        <g clipPath={`url(#export-text-${node.id})`}>{lines.map((line, i) => <text key={i} x={rx + rw / 2} y={baseline + i * lineHeight} textAnchor="middle" fill={node.style.textColor} fontFamily={options.fontFamily ?? node.style.fontFamily} fontSize={node.style.fontSize} fontWeight={node.style.fontWeight}>{line}</text>)}</g>
      </g>;
    })}
  </svg>);
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, width, height, bounds: { x, y, width, height } };
}

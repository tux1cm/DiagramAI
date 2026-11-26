import { useEffect, useRef, useState } from 'react';
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { DiagramEdge } from '@diagramai/diagram-core';
import { executeSafely, useDiagram, useEngine } from './context';
import { arrowSize, curvedPath, orthogonalPath } from './edge-geometry';
import { ArrowMarker } from './ArrowMarker';

export type FlowEdge = Edge<{ value: DiagramEdge }, 'diagram'>;
export function DiagramEdgeView(props: EdgeProps<FlowEdge>) {
  const { store, onError, insertionEdgeId, routingExcludedNodeIds } = useEngine();
  const edge = props.data!.value;
  const document = useDiagram(store).document;
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(edge.label);
  const input = useRef<HTMLInputElement>(null), cancelled = useRef(false);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  // React Flow attaches to the outside of a 12px handle; our ports are
  // centered on the shape boundary, so route from their centers instead.
  const centerOffset = { top: { x: 0, y: 6 }, bottom: { x: 0, y: -6 }, left: { x: 6, y: 0 }, right: { x: -6, y: 0 } };
  const geometry = { ...props, sourceX: props.sourceX + centerOffset[props.sourcePosition].x, sourceY: props.sourceY + centerOffset[props.sourcePosition].y, targetX: props.targetX + centerOffset[props.targetPosition].x, targetY: props.targetY + centerOffset[props.targetPosition].y };
  let path: string, x: number, y: number, fallback = false;
  if (edge.kind === 'curved') [path, x, y] = curvedPath(geometry, Math.max(20, arrowSize(edge.style.strokeWidth) + 4));
  else if (edge.kind === 'smoothstep') [path, x, y] = getSmoothStepPath(geometry);
  else if (edge.kind === 'orthogonal') [path, x, y, fallback] = orthogonalPath(geometry, document.nodes.filter((node) => !routingExcludedNodeIds?.includes(node.id) || node.id === edge.source || node.id === edge.target), edge.source, edge.target);
  else {
    const a = { x: geometry.sourceX, y: geometry.sourceY }, b = { x: geometry.targetX, y: geometry.targetY };
    const points = [a, b];
    const rounded = points.map((point) => ({ x: Number(point.x.toFixed(1)), y: Number(point.y.toFixed(1)) }));
    const unique = rounded.filter((point, i) => !i || point.x !== rounded[i - 1].x || point.y !== rounded[i - 1].y);
    path = 'M' + unique.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L');
    const segments = unique.slice(1).map((point, i) => ({ a: unique[i], b: point, length: Math.hypot(point.x - unique[i].x, point.y - unique[i].y) }));
    let remaining = segments.reduce((sum, segment) => sum + segment.length, 0) / 2;
    x = a.x; y = a.y;
    for (const segment of segments) {
      if (remaining <= segment.length) { const t = segment.length ? remaining / segment.length : 0; x = segment.a.x + (segment.b.x - segment.a.x) * t; y = segment.a.y + (segment.b.y - segment.a.y) * t; break; }
      remaining -= segment.length;
    }
  }
  const inserting = insertionEdgeId === edge.id;
  const stroke = inserting ? '#7056ec' : props.selected ? '#4f65f4' : edge.style.stroke;
  const finish = () => { if (!cancelled.current) executeSafely(store, [{ type: 'update_edges', ids: [edge.id], patch: { label: draft } }], 'Sửa nhãn đường nối', onError); setEditing(false); };
  const start = () => { cancelled.current = false; setDraft(edge.label); setEditing(true); };
  const width = Math.max(48, edge.label.length * edge.style.fontSize * .57 + 12);
  return <g data-edge={edge.id} data-route-fallback={fallback ? 'true' : undefined} data-insert-highlight={inserting ? 'true' : undefined} data-kind={edge.kind} data-source={edge.source} data-target={edge.target} data-source-handle={edge.sourceHandle} data-target-handle={edge.targetHandle} onDoubleClick={(event) => { event.stopPropagation(); start(); }}>
    <defs>{(['start', 'end'] as const).map((end) => <ArrowMarker key={end} id={`${end}-${edge.id}`} color={stroke} size={arrowSize(edge.style.strokeWidth)}/>)}</defs>
    <BaseEdge id={edge.id} path={path} interactionWidth={20} markerStart={edge.markerStart === 'arrow' ? `url(#start-${edge.id})` : undefined} markerEnd={edge.markerEnd === 'arrow' ? `url(#end-${edge.id})` : undefined} style={{ stroke, strokeWidth: inserting ? Math.max(4, edge.style.strokeWidth) : props.selected ? Math.max(2.6, edge.style.strokeWidth) : edge.style.strokeWidth, strokeDasharray: edge.style.dashed ? '6 4' : undefined, strokeLinecap: 'round', strokeLinejoin: 'round' }}/>
    {edge.label && !editing && <g className="edge-label" style={{ cursor: 'text' }}><rect x={x - width / 2} y={y - 18} width={width} height="21" rx="8" fill="#fff" stroke="#e9edf5"/><text x={x} y={y - 4} textAnchor="middle" fontSize={edge.style.fontSize} fontFamily="Inter,Segoe UI,Arial" fontWeight="700" fill={edge.style.textColor}>{edge.label}</text></g>}
    {editing && <foreignObject x={x - 80} y={y - 22} width="160" height="44"><input ref={input} className="inline-edge-editor nodrag nopan nowheel" aria-label="Sửa nhãn đường nối" value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} onBlur={finish} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setEditing(false); } else if (event.key === 'Enter') { event.preventDefault(); finish(); } }}/></foreignObject>}
  </g>;
}

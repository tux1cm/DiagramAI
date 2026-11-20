import { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { PORTS, resizeWithRatio, SHAPE_DEFINITIONS, type DiagramNode, type ResizeCorner } from '@diagramai/diagram-core';
import { executeSafely, useEngine } from './context';
import { Shape } from './Shape';
import { linesFor } from './text-layout';

export type FlowNode = Node<{ value: DiagramNode; preview?: boolean }, 'diagram'>;
const positions = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };

export function DiagramNodeView({ id, data, selected, isConnectable }: NodeProps<FlowNode>) {
  const { store, onError } = useEngine();
  const node = data.value, definition = SHAPE_DEFINITIONS[node.type];
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(node.text);
  const flow = useReactFlow(), root = useRef<HTMLDivElement>(null);
  const ratioGesture = useRef<{ node: DiagramNode; corner: ResizeCorner; pointerId: number; start: { x: number; y: number } } | null>(null);
  const resizing = useRef(false), resizeCancelled = useRef(false);
  const cancelled = useRef(false), input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  const region = { x: definition.textRegion.x * node.width, y: definition.textRegion.y * node.height, width: definition.textRegion.width * node.width, height: definition.textRegion.height * node.height };
  const lines = linesFor(node.text, region.width, node.style.fontSize);
  const lineHeight = node.style.fontSize * 16 / 13;
  const baseline = region.y + region.height / 2 - (lines.length - 1) * lineHeight / 2 + node.style.fontSize * 4 / 13;
  const commitText = () => {
    if (!cancelled.current) executeSafely(store, [{ type: 'update_nodes', ids: [id], patch: { text: draft } }], 'Sửa chữ', onError);
    setEditing(false);
  };
  const resize = useCallback((values: { x: number; y: number; width: number; height: number }) => {
    if (resizeCancelled.current) return;
    try {
      if (!store.getSnapshot().interaction) store.beginInteraction('Đổi kích thước');
      // onResize also carries RF-only `direction`; never leak adapter fields
      // into the strict domain command (or cancel every live pointer update).
      const { x, y, width, height } = values;
      store.updateInteraction([{ type: 'geometry', values: [{ id, x, y, width, height }] }]);
    } catch { store.cancelInteraction(); onError('Kích thước hình không hợp lệ.'); }
  }, [id, store, onError]);
  useEffect(() => {
    if (!selected || data.preview) return;
    const release = () => { const active = ratioGesture.current; ratioGesture.current = null; if (active && root.current?.hasPointerCapture(active.pointerId)) root.current.releasePointerCapture(active.pointerId); };
    const cancel = () => { if (resizing.current) { resizeCancelled.current = true; resizing.current = false; release(); store.cancelInteraction(); } };
    const update = (event: PointerEvent) => {
      const active = ratioGesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      resize(resizeWithRatio(active.node, active.corner, { x: point.x - active.start.x, y: point.y - active.start.y }));
    };
    const end = (event: PointerEvent) => {
      if (!ratioGesture.current || ratioGesture.current.pointerId !== event.pointerId) return;
      update(event); resizing.current = false; release();
      if (!resizeCancelled.current) store.finishInteraction();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) cancel(); };
    window.addEventListener('keydown', key, true); window.addEventListener('blur', cancel); window.addEventListener('pointercancel', cancel);
    window.addEventListener('pointermove', update); window.addEventListener('pointerup', end);
    return () => {
      window.removeEventListener('keydown', key, true); window.removeEventListener('blur', cancel); window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('pointermove', update); window.removeEventListener('pointerup', end);
    };
  }, [selected, data.preview, store, flow, resize]);
  return <div ref={root} data-node={data.preview ? undefined : id} data-duplicate-preview={data.preview ? node.id : undefined} data-type={node.type} data-x={node.x} data-y={node.y} data-width={node.width} data-height={node.height} className={`engine-node ${data.preview ? 'duplicate-preview' : selected ? 'selected' : ''}`}
    onPointerDownCapture={(event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest('.react-flow__resize-control');
      if (!control) return;
      // Latch at pointer-down, before RF's mouse resize starts. Ctrl on the
      // body remains duplicate; Ctrl on a corner locks only this resize.
      const corner = control.classList.contains('handle') && (control.classList.contains('top') || control.classList.contains('bottom')) && (control.classList.contains('left') || control.classList.contains('right'));
      if (!event.ctrlKey || !corner || data.preview) return;
      // RF's D3 resize deliberately filters Ctrl-mousedown. Handle this gesture
      // through pointer capture, rather than faking mouse events into the library.
      event.preventDefault(); event.stopPropagation();
      const initial = store.getSnapshot().document.nodes.find((item) => item.id === id);
      if (!initial || store.getSnapshot().interaction) return;
      ratioGesture.current = { node: initial, corner: `${control.classList.contains('top') ? 'top' : 'bottom'}.${control.classList.contains('left') ? 'left' : 'right'}` as ResizeCorner, pointerId: event.pointerId, start: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) };
      resizing.current = true; resizeCancelled.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
      store.beginInteraction('Đổi kích thước giữ tỷ lệ');
    }}
    onMouseDownCapture={(event) => { if (ratioGesture.current) { event.preventDefault(); event.stopPropagation(); } }}
    onDoubleClick={(event) => { event.stopPropagation(); if (data.preview) return; cancelled.current = false; setDraft(node.text); setEditing(true); }}>
    <NodeResizer isVisible={selected && !editing && !data.preview} minWidth={definition.minSize.width} minHeight={definition.minSize.height} maxWidth={4096} maxHeight={4096} color="#546df4"
      handleStyle={{ width: 8, height: 8, borderRadius: 2 }} lineStyle={{ borderStyle: 'dashed', borderWidth: 1 }}
      shouldResize={() => !resizeCancelled.current}
      onResizeStart={() => { resizing.current = true; resizeCancelled.current = false; store.beginInteraction('Đổi kích thước'); }}
      onResize={(_event, values) => resize(values)} onResizeEnd={(_event, values) => { resizing.current = false; if (resizeCancelled.current) return; resize(values); store.finishInteraction(); }}/>
    <svg className="node-svg" width="100%" height="100%" viewBox={`0 0 ${node.width} ${node.height}`} aria-hidden="true">
      <defs><clipPath id={`text-${id}`}><rect x={region.x} y={region.y} width={region.width} height={region.height}/></clipPath></defs>
      <g className="node-border" fill={node.style.fill} stroke={node.style.stroke} strokeWidth={node.style.strokeWidth} strokeDasharray={node.style.dashed ? '6 4' : undefined} strokeLinejoin="round"><Shape type={node.type} x={0} y={0} w={node.width} h={node.type === 'actor' ? node.height * .73 : node.height}/></g>
      {!editing && <g clipPath={`url(#text-${id})`} pointerEvents="none">{lines.map((line, index) => <text key={index} x={region.x + region.width / 2} y={baseline + index * lineHeight} fill={node.style.textColor} fontFamily={node.style.fontFamily} fontSize={node.style.fontSize} fontWeight={node.style.fontWeight} textAnchor="middle">{line}</text>)}</g>}
    </svg>
    {editing && <textarea ref={input} className="inline-node-editor nodrag nopan nowheel" aria-label="Sửa chữ trong hình" maxLength={4000} value={draft}
      style={{ left: region.x, top: Math.max(0, region.y), width: Math.max(60, region.width), height: Math.max(34, region.height), fontFamily: node.style.fontFamily, fontSize: node.style.fontSize, color: node.style.textColor }}
      onChange={(event) => setDraft(event.target.value)} onBlur={commitText} onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setEditing(false); } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitText(); } }}/>} 
    {!data.preview && PORTS.map((port) => <Handle key={port} id={port} type="source" position={positions[port]} isConnectable={isConnectable && !editing} aria-label={`Neo ${port}`} className={`engine-port port-${port}`}/>)}
  </div>;
}

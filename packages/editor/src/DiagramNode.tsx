import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import { PORTS, SHAPE_DEFINITIONS, type DiagramNode } from '@diagramai/diagram-core';
import { executeSafely, useEngine } from './context';
import { Shape } from './Shape';

export type FlowNode = Node<{ value: DiagramNode }, 'diagram'>;
const positions = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
function linesFor(text: string, width: number, fontSize: number): string[] {
  const limit = Math.max(4, Math.floor(width / (fontSize * .6)));
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > limit && line) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    lines.push(line);
  }
  return lines;
}

export function DiagramNodeView({ id, data, selected, isConnectable }: NodeProps<FlowNode>) {
  const { store, onError } = useEngine();
  const node = data.value, definition = SHAPE_DEFINITIONS[node.type];
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(node.text);
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
  const resize = (values: { x: number; y: number; width: number; height: number }) => {
    try {
      if (!store.getSnapshot().interaction) store.beginInteraction('Đổi kích thước');
      // onResize also carries RF-only `direction`; never leak adapter fields
      // into the strict domain command (or cancel every live pointer update).
      const { x, y, width, height } = values;
      store.updateInteraction([{ type: 'geometry', values: [{ id, x, y, width, height }] }]);
    } catch { store.cancelInteraction(); onError('Kích thước hình không hợp lệ.'); }
  };
  return <div data-node={id} data-type={node.type} data-x={node.x} data-y={node.y} data-width={node.width} data-height={node.height} className={`engine-node ${selected ? 'selected' : ''}`} onDoubleClick={(event) => { event.stopPropagation(); cancelled.current = false; setDraft(node.text); setEditing(true); }}>
    <NodeResizer isVisible={selected && !editing} minWidth={definition.minSize.width} minHeight={definition.minSize.height} color="#546df4"
      handleStyle={{ width: 8, height: 8, borderRadius: 2 }} lineStyle={{ borderStyle: 'dashed', borderWidth: 1 }}
      onResizeStart={() => store.beginInteraction('Đổi kích thước')}
      onResize={(_event, values) => resize(values)} onResizeEnd={(_event, values) => { resize(values); store.finishInteraction(); }}/>
    <svg className="node-svg" width="100%" height="100%" viewBox={`0 0 ${node.width} ${node.height}`} aria-hidden="true">
      <defs><clipPath id={`text-${id}`}><rect x={region.x} y={region.y} width={region.width} height={region.height}/></clipPath></defs>
      <g className="node-border" fill={node.style.fill} stroke={node.style.stroke} strokeWidth={node.style.strokeWidth} strokeDasharray={node.style.dashed ? '6 4' : undefined} strokeLinejoin="round"><Shape type={node.type} x={0} y={0} w={node.width} h={node.type === 'actor' ? node.height * .73 : node.height}/></g>
      {!editing && <g clipPath={`url(#text-${id})`} pointerEvents="none">{lines.map((line, index) => <text key={index} x={region.x + region.width / 2} y={baseline + index * lineHeight} fill={node.style.textColor} fontFamily={node.style.fontFamily} fontSize={node.style.fontSize} fontWeight={node.style.fontWeight} textAnchor="middle">{line}</text>)}</g>}
    </svg>
    {editing && <textarea ref={input} className="inline-node-editor nodrag nopan nowheel" aria-label="Sửa chữ trong hình" maxLength={4000} value={draft}
      style={{ left: region.x, top: Math.max(0, region.y), width: Math.max(60, region.width), height: Math.max(34, region.height), fontFamily: node.style.fontFamily, fontSize: node.style.fontSize, color: node.style.textColor }}
      onChange={(event) => setDraft(event.target.value)} onBlur={commitText} onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setEditing(false); } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitText(); } }}/>} 
    {PORTS.map((port) => <Handle key={port} id={port} type="source" position={positions[port]} isConnectable={isConnectable && !editing} aria-label={`Neo ${port}`} className={`engine-port port-${port}`}/>)}
  </div>;
}

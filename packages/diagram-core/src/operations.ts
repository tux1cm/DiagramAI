import type { DiagramCommand } from './commands';
import { newId } from './registry';
import type { DiagramDocument } from './schema';
import type { GraphSelection } from './store';

export type Arrange = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical' | 'front' | 'back';
export function arrangeCommands(document: DiagramDocument, ids: string[], kind: Arrange): DiagramCommand[] {
  const selected = document.nodes.filter((node) => ids.includes(node.id));
  if (!selected.length) return [];
  if (kind === 'front' || kind === 'back') {
    const ordered = [...document.nodes].sort((a, b) => a.zIndex - b.zIndex);
    const picked = ordered.filter((node) => ids.includes(node.id)), others = ordered.filter((node) => !ids.includes(node.id));
    return (kind === 'front' ? [...others, ...picked] : [...picked, ...others]).map((node, zIndex) => ({ type: 'update_nodes', ids: [node.id], patch: { zIndex } }));
  }
  if (selected.length < 2) return [];
  const left = Math.min(...selected.map((node) => node.x)), right = Math.max(...selected.map((node) => node.x + node.width));
  const top = Math.min(...selected.map((node) => node.y)), bottom = Math.max(...selected.map((node) => node.y + node.height));
  if (kind === 'horizontal' || kind === 'vertical') {
    if (selected.length < 3) return [];
    const horizontal = kind === 'horizontal';
    const center = (node: typeof selected[number]) => horizontal ? node.x + node.width / 2 : node.y + node.height / 2;
    const sorted = [...selected].sort((a, b) => center(a) - center(b));
    const first = center(sorted[0]), last = center(sorted[sorted.length - 1]);
    return [{ type: 'geometry', values: sorted.map((node, i) => ({ id: node.id, ...(horizontal ? { x: first + (last - first) * i / (sorted.length - 1) - node.width / 2 } : { y: first + (last - first) * i / (sorted.length - 1) - node.height / 2 }) })) }];
  }
  return [{ type: 'geometry', values: selected.map((node) => ({ id: node.id,
    ...(kind === 'left' ? { x: left } : kind === 'center' ? { x: (left + right - node.width) / 2 } : kind === 'right' ? { x: right - node.width } : kind === 'top' ? { y: top } : kind === 'middle' ? { y: (top + bottom - node.height) / 2 } : { y: bottom - node.height }),
  })) }];
}
export function groupCommands(document: DiagramDocument, selection: GraphSelection): DiagramCommand[] {
  const nodeIds = document.nodes.filter((node) => selection.nodeIds.includes(node.id)).map((node) => node.id);
  return nodeIds.length >= 2 ? [{ type: 'group', group: { id: newId(), name: 'Nhóm', nodeIds } }] : [];
}
export function ungroupCommands(document: DiagramDocument, selection: GraphSelection): DiagramCommand[] {
  const groupIds = document.groups.filter((group) => group.nodeIds.some((id) => selection.nodeIds.includes(id))).map((group) => group.id);
  return groupIds.length ? [{ type: 'ungroup', groupIds }] : [];
}

import { newId, type Port } from './registry';
import type { DiagramCommand } from './commands';
import type { DiagramDocument, DiagramNode } from './schema';

export function canInsertNode(document: DiagramDocument, nodeId: string): boolean {
  return !document.edges.some((edge) => edge.source === nodeId || edge.target === nodeId) && !document.groups.some((group) => group.nodeIds.includes(nodeId));
}
export function insertNodeOnEdge(edgeId: string, nodeData: DiagramNode, point: { x: number; y: number }, tangent: { x: number; y: number }): DiagramCommand {
  const horizontal = Math.abs(tangent.x) > Math.abs(tangent.y);
  const entry: Port = horizontal ? tangent.x >= 0 ? 'left' : 'right' : tangent.y >= 0 ? 'top' : 'bottom';
  const exit: Port = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[entry] as Port;
  return { type: 'insert_node_on_edge', edgeId, nodeData, position: { x: point.x - nodeData.width / 2, y: point.y - nodeData.height / 2 }, entry, exit, edgeIds: [newId(), newId()] };
}

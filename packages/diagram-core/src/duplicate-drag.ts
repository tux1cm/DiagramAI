import { applyCommands, type DiagramCommand } from './commands';
import { copyFragment, pasteFragment } from './clipboard';
import type { DiagramDocument, DiagramNode } from './schema';

export interface DuplicateDragPlan { commands: DiagramCommand[]; nodes: DiagramNode[]; sourceIds: string[]; nodeIds: string[]; edgeIds: string[] }
export function prepareDuplicateDrag(document: DiagramDocument, nodeIds: string[]): DuplicateDragPlan {
  if (!nodeIds.length || new Set(nodeIds).size !== nodeIds.length || nodeIds.some((id) => !document.nodes.some((node) => node.id === id))) throw new Error('Hình nhân đôi không hợp lệ');
  // Deliberately independent of both internal and operating-system clipboards.
  // Only edges wholly inside the copied selection belong to the duplicate.
  const fragment = copyFragment(document, { nodeIds, edgeIds: [] })!;
  const result = pasteFragment(document, fragment, 0);
  applyCommands(document, result.commands); // Fail caps/validation before showing a preview.
  const nodes = result.commands.flatMap((command) => command.type === 'add_nodes' ? command.nodes : []);
  return { commands: result.commands, nodes, sourceIds: fragment.nodes.map((node) => node.id), ...result.selection };
}
export function moveDuplicateDrag(plan: DuplicateDragPlan, dx: number, dy: number): { commands: DiagramCommand[]; nodes: DiagramNode[] } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('Vị trí nhân đôi không hợp lệ');
  const nodes = plan.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }));
  return { nodes, commands: plan.commands.map((command) => command.type === 'add_nodes' ? { ...command, nodes } : command) };
}

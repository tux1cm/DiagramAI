import { z } from 'zod';
import { EdgeSchema, GroupSchema, IdSchema, NodeSchema, type DiagramDocument } from './schema';
import { newId } from './registry';
import type { DiagramCommand } from './commands';
import type { GraphSelection } from './store';

export const FragmentSchema = z.object({
  format: z.literal('diagramai-fragment'), formatVersion: z.literal(1), sourceDocumentId: IdSchema,
  nodes: z.array(NodeSchema).max(500), edges: z.array(EdgeSchema).max(1000), groups: z.array(GroupSchema).max(250),
}).strict().superRefine((fragment, context) => {
  const ids = [...fragment.nodes, ...fragment.edges, ...fragment.groups].map((item) => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Clipboard có ID trùng' });
  const members = new Set(fragment.nodes.map((node) => node.id));
  const grouped = new Set<string>();
  for (const group of fragment.groups) for (const id of group.nodeIds) {
    if (!members.has(id) || grouped.has(id)) context.addIssue({ code: 'custom', message: 'Nhóm clipboard không hợp lệ' });
    grouped.add(id);
  }
});
export type DiagramFragment = z.infer<typeof FragmentSchema>;
export function copyFragment(document: DiagramDocument, selection: GraphSelection): DiagramFragment | null {
  const selected = new Set(selection.nodeIds);
  const nodes = document.nodes.filter((node) => selected.has(node.id));
  const edges = document.edges.filter((edge) => selection.edgeIds.includes(edge.id) || (selected.has(edge.source) && selected.has(edge.target)));
  if (!nodes.length && !edges.length) return null;
  const groups = document.groups.filter((group) => group.nodeIds.every((id) => selected.has(id)));
  return FragmentSchema.parse({ format: 'diagramai-fragment', formatVersion: 1, sourceDocumentId: document.documentId, nodes, edges, groups });
}
export function decodeFragment(text: string): DiagramFragment {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error('Clipboard quá lớn');
  return FragmentSchema.parse(JSON.parse(text));
}
export function pasteFragment(document: DiagramDocument, input: unknown, offset = 30): { commands: DiagramCommand[]; selection: GraphSelection } {
  const fragment = FragmentSchema.parse(input);
  const ids = new Map(fragment.nodes.map((node) => [node.id, newId()]));
  const known = new Set(document.nodes.map((node) => node.id));
  const endpoint = (id: string): string => {
    const mapped = ids.get(id);
    if (mapped) return mapped;
    if (fragment.sourceDocumentId === document.documentId && known.has(id)) return id;
    throw new Error('Không thể dán cạnh thiếu hình đầu/cuối từ tài liệu khác');
  };
  const nodes = fragment.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, x: node.x + offset, y: node.y + offset }));
  const edges = fragment.edges.map((edge) => ({ ...edge, id: newId(), source: endpoint(edge.source), target: endpoint(edge.target) }));
  const groups = fragment.groups.map((group) => ({ ...group, id: newId(), nodeIds: group.nodeIds.map((id) => ids.get(id)!) }));
  const commands: DiagramCommand[] = [];
  if (nodes.length) commands.push({ type: 'add_nodes', nodes });
  if (edges.length) commands.push({ type: 'add_edges', edges });
  for (const group of groups) commands.push({ type: 'group', group });
  return { commands, selection: { nodeIds: nodes.map((node) => node.id), edgeIds: edges.map((edge) => edge.id) } };
}

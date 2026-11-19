import { z } from 'zod';
import { DocumentSchema, EdgeSchema, EdgeStyleSchema, GroupSchema, IdSchema, NodeSchema, NodeStyleSchema, type DiagramDocument } from './schema';

const nodePatch = z.object({ text: z.string().max(4000).optional(), style: NodeStyleSchema.partial().optional(), zIndex: z.number().int().min(-10000).max(10000).optional() }).strict();
const edgePatch = EdgeSchema.omit({ id: true, style: true }).partial().extend({ style: EdgeStyleSchema.partial().optional() }).strict();
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_nodes'), nodes: z.array(NodeSchema).min(1).max(500) }).strict(),
  z.object({ type: z.literal('add_edges'), edges: z.array(EdgeSchema).min(1).max(1000) }).strict(),
  z.object({ type: z.literal('update_nodes'), ids: z.array(IdSchema).min(1).max(500), patch: nodePatch }).strict(),
  z.object({ type: z.literal('update_edges'), ids: z.array(IdSchema).min(1).max(1000), patch: edgePatch }).strict(),
  z.object({ type: z.literal('geometry'), values: z.array(z.object({ id: IdSchema, x: z.number().finite().optional(), y: z.number().finite().optional(), width: z.number().finite().optional(), height: z.number().finite().optional() }).strict()).min(1).max(500) }).strict(),
  z.object({ type: z.literal('remove'), nodeIds: z.array(IdSchema).max(500), edgeIds: z.array(IdSchema).max(1000) }).strict(),
  z.object({ type: z.literal('rename'), title: z.string().trim().min(1).max(100) }).strict(),
  z.object({ type: z.literal('group'), group: GroupSchema }).strict(),
  z.object({ type: z.literal('ungroup'), groupIds: z.array(IdSchema).max(250) }).strict(),
]);
export type DiagramCommand = z.infer<typeof CommandSchema>;
export type NodePatch = z.infer<typeof nodePatch>;
export type EdgePatch = z.infer<typeof edgePatch>;

export function applyCommands(document: DiagramDocument, inputs: readonly unknown[]): DiagramDocument {
  if (inputs.length > 1000) throw new Error('Quá nhiều lệnh trong một transaction');
  const commands = inputs.map((input) => CommandSchema.parse(input));
  const draft = structuredClone(document);
  const requireIds = (ids: string[], kind: 'nodes' | 'edges' | 'groups') => {
    const known = new Set(draft[kind].map((item) => item.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) throw new Error('ID không tồn tại hoặc bị trùng trong lệnh');
  };
  for (const command of commands) {
    switch (command.type) {
      case 'add_nodes': draft.nodes.push(...command.nodes); break;
      case 'add_edges': draft.edges.push(...command.edges); break;
      case 'update_nodes':
        requireIds(command.ids, 'nodes');
        draft.nodes = draft.nodes.map((node) => command.ids.includes(node.id) ? { ...node, ...command.patch, style: { ...node.style, ...command.patch.style } } : node);
        break;
      case 'update_edges':
        requireIds(command.ids, 'edges');
        draft.edges = draft.edges.map((edge) => command.ids.includes(edge.id) ? { ...edge, ...command.patch, style: { ...edge.style, ...command.patch.style } } : edge);
        break;
      case 'geometry': {
        requireIds(command.values.map((value) => value.id), 'nodes');
        const values = new Map(command.values.map((value) => [value.id, value]));
        draft.nodes = draft.nodes.map((node) => ({ ...node, ...values.get(node.id) }));
        break;
      }
      case 'remove': {
        requireIds(command.nodeIds, 'nodes'); requireIds(command.edgeIds, 'edges');
        const removed = new Set(command.nodeIds);
        draft.nodes = draft.nodes.filter((node) => !removed.has(node.id));
        draft.edges = draft.edges.filter((edge) => !command.edgeIds.includes(edge.id) && !removed.has(edge.source) && !removed.has(edge.target));
        draft.groups = draft.groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !removed.has(id)) })).filter((group) => group.nodeIds.length >= 2);
        break;
      }
      case 'rename': draft.title = command.title; break;
      case 'group': {
        requireIds(command.group.nodeIds, 'nodes');
        const members = new Set(command.group.nodeIds);
        draft.groups = draft.groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !members.has(id)) })).filter((group) => group.nodeIds.length >= 2);
        draft.groups.push(command.group);
        break;
      }
      case 'ungroup':
        requireIds(command.groupIds, 'groups');
        draft.groups = draft.groups.filter((group) => !command.groupIds.includes(group.id));
        break;
    }
  }
  return DocumentSchema.parse(draft); // Reject the entire transaction, never partial graph changes.
}

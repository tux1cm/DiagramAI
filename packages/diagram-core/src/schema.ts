import { z } from 'zod';
import { NODE_SHAPES, PORTS, SHAPE_DEFINITIONS, newId, type NodeShape } from './registry';

export const IdSchema = z.string().uuid();
export const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const NodeStyleSchema = z.object({
  fill: z.union([ColorSchema, z.literal('transparent')]), stroke: ColorSchema, textColor: ColorSchema,
  strokeWidth: z.number().min(0).max(12), fontSize: z.number().min(8).max(96),
  fontFamily: z.enum(['Inter, Segoe UI, Arial', 'Segoe UI', 'Arial', 'monospace']),
  fontWeight: z.union([z.literal(400), z.literal(600), z.literal(700)]), dashed: z.boolean(),
}).strict();
export const NodeSchema = z.object({
  id: IdSchema, type: z.enum(NODE_SHAPES), x: coordinate, y: coordinate,
  width: z.number().finite().min(1).max(4096), height: z.number().finite().min(1).max(4096),
  text: z.string().max(4000), style: NodeStyleSchema, zIndex: z.number().int().min(-10000).max(10000),
}).strict().superRefine((node, context) => {
  const minimum = SHAPE_DEFINITIONS[node.type].minSize;
  if (node.width < minimum.width || node.height < minimum.height) context.addIssue({ code: 'custom', message: 'Kích thước nhỏ hơn giới hạn của hình', path: ['width'] });
});
export const EdgeStyleSchema = z.object({ stroke: ColorSchema, strokeWidth: z.number().min(.5).max(12), textColor: ColorSchema, fontSize: z.number().min(8).max(48), dashed: z.boolean() }).strict();
export const EdgeSchema = z.object({
  id: IdSchema, source: IdSchema, sourceHandle: z.enum(PORTS), target: IdSchema, targetHandle: z.enum(PORTS),
  kind: z.enum(['orthogonal', 'straight', 'smoothstep', 'curved']), label: z.string().max(500),
  markerStart: z.enum(['none', 'arrow']), markerEnd: z.enum(['none', 'arrow']), style: EdgeStyleSchema,
}).strict();
export const GroupSchema = z.object({ id: IdSchema, name: z.string().min(1).max(100), nodeIds: z.array(IdSchema).min(2).max(500) }).strict();
export const DocumentSchema = z.object({
  format: z.literal('diagramai'), formatVersion: z.literal(1), documentId: IdSchema, title: z.string().trim().min(1).max(100),
  nodes: z.array(NodeSchema).max(500), edges: z.array(EdgeSchema).max(1000), groups: z.array(GroupSchema).max(250).default([]),
  metadata: z.object({ createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict(),
}).strict().superRefine((document, context) => {
  const ids = new Set<string>(), nodes = new Set(document.nodes.map((node) => node.id)), grouped = new Set<string>();
  for (const item of [...document.nodes, ...document.edges, ...document.groups]) {
    if (ids.has(item.id)) context.addIssue({ code: 'custom', message: 'ID bị trùng' });
    ids.add(item.id);
  }
  for (const edge of document.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) context.addIssue({ code: 'custom', message: 'Đường nối tham chiếu hình không tồn tại' });
    if (edge.source === edge.target) context.addIssue({ code: 'custom', message: 'Không cho phép tự nối cùng một hình trong P2' });
  }
  for (const group of document.groups) for (const id of group.nodeIds) {
    if (!nodes.has(id) || grouped.has(id)) context.addIssue({ code: 'custom', message: 'Thành viên nhóm không hợp lệ hoặc thuộc nhiều nhóm' });
    grouped.add(id);
  }
});
export type DiagramDocument = z.infer<typeof DocumentSchema>;
export type DiagramNode = z.infer<typeof NodeSchema>;
export type DiagramEdge = z.infer<typeof EdgeSchema>;
export type DiagramGroup = z.infer<typeof GroupSchema>;
export type NodeStyle = z.infer<typeof NodeStyleSchema>;
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>;

export const DEFAULT_NODE_STYLE: NodeStyle = { fill: '#ffffff', stroke: '#aab9d3', textColor: '#314363', strokeWidth: 1.7, fontSize: 13, fontFamily: 'Inter, Segoe UI, Arial', fontWeight: 600, dashed: false };
export const DEFAULT_EDGE_STYLE: EdgeStyle = { stroke: '#8392ad', strokeWidth: 2, textColor: '#6b7890', fontSize: 11, dashed: false };
export function createNode(type: NodeShape, x: number, y: number, text?: string): DiagramNode {
  const definition = SHAPE_DEFINITIONS[type];
  const preset = type === 'diamond' ? { fill: '#fff4d9', stroke: '#e4b659' } : type === 'ellipse' || type === 'round' ? { fill: '#e9f0ff', stroke: '#6588ec' } : type === 'document' ? { fill: '#fff0f1', stroke: '#e7a3aa' } : type === 'text' ? { fill: 'transparent', strokeWidth: 0 } : {};
  return NodeSchema.parse({ id: newId(), type, x, y, ...definition.defaultSize, text: text ?? (type === 'text' ? 'Văn bản' : type === 'diamond' ? 'Điều kiện?' : 'Bước mới'), style: { ...DEFAULT_NODE_STYLE, ...preset }, zIndex: 0 });
}
export function createEdge(source: string, target: string, sourceHandle: DiagramEdge['sourceHandle'] = 'bottom', targetHandle: DiagramEdge['targetHandle'] = 'top', patch: Partial<Pick<DiagramEdge, 'kind' | 'markerStart' | 'markerEnd'>> = {}): DiagramEdge {
  return EdgeSchema.parse({ id: newId(), source, target, sourceHandle, targetHandle, kind: 'orthogonal', label: '', markerStart: 'none', markerEnd: 'arrow', style: DEFAULT_EDGE_STYLE, ...patch });
}
export function createDocument(title = 'Sơ đồ mới'): DiagramDocument {
  const now = new Date().toISOString();
  return DocumentSchema.parse({ format: 'diagramai', formatVersion: 1, documentId: newId(), title, nodes: [], edges: [], groups: [], metadata: { createdAt: now, updatedAt: now } });
}
export function parseDocument(input: unknown): DiagramDocument { return DocumentSchema.parse(input); }
export function serializeDocument(document: DiagramDocument): string { return JSON.stringify(parseDocument(document)); }

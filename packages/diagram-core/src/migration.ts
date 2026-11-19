import { z } from 'zod';
import { ColorSchema, DEFAULT_NODE_STYLE, DocumentSchema, createDocument, createEdge, type DiagramDocument } from './schema';
import { NODE_SHAPES, PORTS, newId } from './registry';

// Explicit legacy domain version, not arbitrary JSON or a claim of draw.io import.
const oldId = z.string().regex(/^[\w-]{1,64}$/);
const LegacySchema = z.object({
  format: z.literal('diagramai'), formatVersion: z.literal(0), title: z.string().trim().min(1).max(100),
  nodes: z.array(z.object({ id: oldId, type: z.enum(NODE_SHAPES), x: z.number().finite(), y: z.number().finite(), w: z.number().positive(), h: z.number().positive(), label: z.string().max(4000), fill: ColorSchema, stroke: ColorSchema }).strict()).max(500),
  edges: z.array(z.object({ id: oldId, from: oldId, to: oldId, fromPort: z.enum(PORTS), toPort: z.enum(PORTS), label: z.string().max(500) }).strict()).max(1000),
}).strict();
export function migrateDocument(input: unknown): DiagramDocument {
  if (typeof input !== 'object' || input === null || !('formatVersion' in input)) throw new Error('Thiếu phiên bản tài liệu');
  if (input.formatVersion === 1) return DocumentSchema.parse(input);
  if (input.formatVersion !== 0) throw new Error('Phiên bản tài liệu chưa được hỗ trợ');
  const old = LegacySchema.parse(input);
  const oldIds = [...old.nodes, ...old.edges].map((item) => item.id);
  if (new Set(oldIds).size !== oldIds.length) throw new Error('ID tài liệu cũ bị trùng');
  const map = new Map(old.nodes.map((node) => [node.id, newId()]));
  const document = createDocument(old.title);
  document.nodes = old.nodes.map((node) => ({ id: map.get(node.id)!, type: node.type, x: node.x, y: node.y, width: node.w, height: node.h, text: node.label, style: { ...DEFAULT_NODE_STYLE, fill: node.fill, stroke: node.stroke }, zIndex: 0 }));
  document.edges = old.edges.map((edge) => {
    const source = map.get(edge.from), target = map.get(edge.to);
    if (!source || !target) throw new Error('Cạnh tài liệu cũ tham chiếu hình không tồn tại');
    return { ...createEdge(source, target, edge.fromPort, edge.toPort), label: edge.label };
  });
  return DocumentSchema.parse(document);
}

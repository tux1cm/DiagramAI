import { createDocument, createEdge, DEFAULT_NODE_STYLE, newId, NodeSchema, parseDocument } from '@diagramai/diagram-core';
import { createFixture } from './fixture';

// Seed an editable example, not an alternate production schema or counter-based IDs.
export function createInitialDocument() {
  const fixture = createFixture(), document = createDocument(fixture.title);
  const ids = new Map(fixture.nodes.map((node) => [node.id, newId()]));
  document.nodes = fixture.nodes.map((node) => NodeSchema.parse({ id: ids.get(node.id), type: node.type, x: node.x, y: node.y, width: node.w, height: node.h, text: node.label, style: { ...DEFAULT_NODE_STYLE, fill: node.fill, stroke: node.stroke }, zIndex: 0 }));
  document.edges = fixture.edges.map((edge) => ({ ...createEdge(ids.get(edge.from)!, ids.get(edge.to)!, edge.fromPort, edge.toPort), label: edge.label }));
  return parseDocument(document);
}

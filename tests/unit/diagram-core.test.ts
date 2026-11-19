import { describe, expect, it } from 'vitest';
import {
  DiagramStore, DocumentSchema, NodeSchema, SHAPE_DEFINITIONS, NODE_SHAPES, PORTS,
  applyCommands, arrangeCommands, copyFragment, createDocument, createEdge, createNode,
  decodeFragment, groupCommands, migrateDocument, newId, parseDocument, pasteFragment,
  serializeDocument, ungroupCommands,
} from '@diagramai/diagram-core';

function graph() {
  const document = createDocument('Quy trình tiếng Việt');
  const a = createNode('rect', 100, 80, 'Tiếp nhận vật tư'), b = createNode('diamond', 330, 180, 'Đạt yêu cầu?');
  document.nodes.push(a, b);
  document.edges.push({ ...createEdge(a.id, b.id), label: 'Có' });
  return document;
}

describe('independent domain schema, graph validation and migration', () => {
  it('generates valid UUIDs and round-trips Vietnamese text/style/ports without UI state', () => {
    const document = graph();
    expect(parseDocument(JSON.parse(serializeDocument(document)))).toEqual(document);
    expect(document.nodes[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(serializeDocument(document)).not.toMatch(/selected|viewport|ReactFlow/);
  });
  it.each(NODE_SHAPES)('validates shape %s with registry size constraints', (type) => {
    const node = createNode(type, 0, 0);
    expect(NodeSchema.safeParse(node).success).toBe(true);
    expect(NodeSchema.safeParse({ ...node, width: SHAPE_DEFINITIONS[type].minSize.width - 1 }).success).toBe(false);
  });
  it.each(PORTS)('preserves the %s handle through serialization', (port) => {
    const document = graph();
    document.edges[0].sourceHandle = port;
    document.edges[0].targetHandle = port;
    expect(parseDocument(JSON.parse(serializeDocument(document))).edges[0].sourceHandle).toBe(port);
  });
  it('rejects secrets, HTML fields, UI-only selection, unknown types and unsafe colors', () => {
    const document = graph();
    for (const extra of [{ token: 'secret' }, { html: '<script/>' }, { selection: [] }]) expect(DocumentSchema.safeParse({ ...document, ...extra }).success).toBe(false);
    expect(NodeSchema.safeParse({ ...document.nodes[0], type: 'arbitrary' }).success).toBe(false);
    expect(NodeSchema.safeParse({ ...document.nodes[0], style: { ...document.nodes[0].style, fill: 'url(javascript:alert(1))' } }).success).toBe(false);
  });
  it('rejects duplicate node/edge IDs, dangling ports/references and self loops', () => {
    const document = graph();
    expect(DocumentSchema.safeParse({ ...document, nodes: [...document.nodes, document.nodes[0]] }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, edges: [{ ...document.edges[0], id: document.nodes[0].id }] }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, edges: [{ ...document.edges[0], target: newId() }] }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, edges: [{ ...document.edges[0], targetHandle: 'missing' }] }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, edges: [{ ...document.edges[0], target: document.nodes[0].id }] }).success).toBe(false);
  });
  it('rejects NaN, Infinity, huge coordinates, node caps and wrong schema versions', () => {
    const document = graph();
    for (const x of [NaN, Infinity, 1_000_001]) expect(NodeSchema.safeParse({ ...document.nodes[0], x }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, nodes: Array.from({ length: 501 }, () => createNode('rect', 0, 0)) }).success).toBe(false);
    expect(() => migrateDocument({ ...document, formatVersion: 99 })).toThrow();
  });
  it('migrates explicit v0 to UUID-backed v1 without losing text or edge labels', () => {
    const old = { format: 'diagramai', formatVersion: 0, title: 'Kho', nodes: [
      { id: 'a', type: 'rect', x: 0, y: 0, w: 150, h: 63, label: 'Nhập kho', fill: '#ffffff', stroke: '#aab9d3' },
      { id: 'b', type: 'round', x: 200, y: 0, w: 150, h: 63, label: 'Hoàn tất', fill: '#e9f0ff', stroke: '#6588ec' },
    ], edges: [{ id: 'e1', from: 'a', to: 'b', fromPort: 'right', toPort: 'left', label: 'Không' }] };
    const migrated = migrateDocument(old);
    expect(migrated.nodes[0].text).toBe('Nhập kho');
    expect(migrated.edges[0]).toMatchObject({ source: migrated.nodes[0].id, target: migrated.nodes[1].id, label: 'Không' });
    expect(migrateDocument(migrated)).toEqual(migrated);
    expect(() => migrateDocument({ ...old, nodes: [old.nodes[0], old.nodes[0]] })).toThrow();
    expect(() => migrateDocument({ ...old, edges: [{ ...old.edges[0], to: 'missing' }] })).toThrow();
    expect(() => migrateDocument({ nodes: [], edges: [] })).toThrow();
  });
});

describe('atomic commands and serializable transaction history', () => {
  it('rolls back the whole batch when any command is invalid', () => {
    const document = graph(), store = new DiagramStore(document), before = store.getSnapshot();
    expect(() => store.execute([
      { type: 'update_nodes', ids: [document.nodes[0].id], patch: { text: 'Đã đổi?' } },
      { type: 'geometry', values: [{ id: document.nodes[1].id, width: 1 }] },
    ])).toThrow();
    expect(store.getSnapshot()).toBe(before);
  });
  it('rejects unknown IDs/fields instead of silently applying a subset', () => {
    const document = graph();
    expect(() => applyCommands(document, [{ type: 'update_nodes', ids: [document.nodes[0].id, newId()], patch: { text: 'x' } }])).toThrow();
    expect(() => applyCommands(document, [{ type: 'update_nodes', ids: [document.nodes[0].id], patch: { html: '<img/>' } }])).toThrow();
    expect(() => applyCommands(document, [{ type: 'geometry', values: [{ id: document.nodes[0].id, x: 1 }, { id: document.nodes[0].id, x: 2 }] }])).toThrow();
  });
  it('deletes incident edges in one undoable transaction', () => {
    const document = graph(), store = new DiagramStore(document);
    store.execute([{ type: 'remove', nodeIds: [document.nodes[0].id], edgeIds: [] }], 'Xóa hình');
    expect(store.getSnapshot().document.edges).toHaveLength(0);
    expect(store.getSnapshot().past).toHaveLength(1);
    store.undo();
    expect(store.getSnapshot().document).toEqual(document);
    store.redo();
    expect(store.getSnapshot().document.nodes).toHaveLength(1);
  });
  it('keeps live edge IDs/handles across 100 draft drag/resize updates and undoes once', () => {
    const document = graph(), store = new DiagramStore(document), a = document.nodes[0];
    store.beginInteraction('Kéo/resize');
    for (let i = 1; i <= 100; i++) store.updateInteraction([{ type: 'geometry', values: [{ id: a.id, x: a.x + i, width: a.width + i }] }]);
    expect(store.getSnapshot().past).toHaveLength(0);
    expect(store.getSnapshot().document.edges).toEqual(document.edges);
    store.finishInteraction();
    expect(store.getSnapshot().past).toHaveLength(1);
    expect(store.getSnapshot().past[0].commands[0]).toMatchObject({ type: 'geometry', values: [{ id: a.id, x: 200, width: 250 }] });
    store.undo();
    expect(store.getSnapshot().document).toEqual(document);
    store.redo();
    expect(store.getSnapshot().document.nodes[0].width).toBe(250);
  });
  it('cancels interactions and rejects invalid interaction commands atomically', () => {
    const document = graph(), store = new DiagramStore(document);
    store.beginInteraction('Kéo');
    const before = store.getSnapshot();
    expect(() => store.updateInteraction([{ type: 'rename', title: 'không' }])).toThrow();
    expect(store.getSnapshot()).toBe(before);
    store.updateInteraction([{ type: 'geometry', values: [{ id: document.nodes[0].id, x: 999 }] }]);
    store.cancelInteraction();
    expect(store.getSnapshot().document).toEqual(document);
    expect(store.getSnapshot().past).toHaveLength(0);
    expect(store.getSnapshot().dirty).toBe(false);
  });
  it('rejects stale revisions and protects live document objects from mutation', () => {
    const document = graph(), store = new DiagramStore(document);
    store.execute([{ type: 'rename', title: 'Mới' }]);
    expect(() => store.execute([{ type: 'rename', title: 'Cũ' }], 'stale', 0)).toThrow();
    expect(() => { store.getSnapshot().document.nodes[0].x = 77; }).toThrow();
    expect(store.getSnapshot().document.title).toBe('Mới');
  });
  it('selection does not enter document/history and does not clear redo', () => {
    const document = graph(), store = new DiagramStore(document);
    store.execute([{ type: 'rename', title: 'Mới' }]); store.undo();
    store.select([document.nodes[0].id], []);
    expect(store.getSnapshot().future).toHaveLength(1);
    expect(serializeDocument(store.getSnapshot().document)).not.toContain('selection');
    store.redo(); expect(store.getSnapshot().dirty).toBe(true);
    store.undo(); expect(store.getSnapshot().dirty).toBe(false);
  });
  it('no-op changes do not consume history and new edits clear redo', () => {
    const document = graph(), store = new DiagramStore(document);
    expect(store.execute([{ type: 'rename', title: document.title }])).toBe(false);
    store.execute([{ type: 'rename', title: 'Một' }]); store.undo();
    store.execute([{ type: 'rename', title: 'Hai' }]);
    expect(store.getSnapshot().future).toHaveLength(0);
    expect(JSON.parse(JSON.stringify(store.getSnapshot().past[0])).commands[0].type).toBe('rename');
  });
  it('protects selection and transaction logs from accidental external mutation', () => {
    const document = graph(), store = new DiagramStore(document);
    store.selectAll(); store.execute([{ type: 'rename', title: 'Mới' }]);
    expect(() => store.getSnapshot().selection.nodeIds.pop()).toThrow();
    expect(() => store.getSnapshot().past.pop()).toThrow();
    expect(() => store.getSnapshot().past[0].commands.push({ type: 'rename', title: 'Sai' })).toThrow();
    expect(store.getSnapshot().past).toHaveLength(1);
  });
  it('an invalid edit does not commit a live pointer draft or alter its history', () => {
    const document = graph(), store = new DiagramStore(document);
    store.beginInteraction('Kéo');
    store.updateInteraction([{ type: 'geometry', values: [{ id: document.nodes[0].id, x: 500 }] }]);
    const before = store.getSnapshot();
    expect(() => store.execute([{ type: 'geometry', values: [{ id: document.nodes[0].id, width: -1 }] }])).toThrow();
    expect(store.getSnapshot()).toBe(before);
    store.cancelInteraction(); expect(store.getSnapshot().document).toEqual(document);
  });
});

describe('clipboard, grouping and arrangement', () => {
  it('copies/pastes a graph with new IDs, remapped ports/style and one undo', () => {
    const document = graph(), store = new DiagramStore(document);
    const selection = { nodeIds: document.nodes.map((node) => node.id), edgeIds: [] };
    const fragment = decodeFragment(JSON.stringify(copyFragment(document, selection)));
    const paste = pasteFragment(document, fragment);
    store.execute(paste.commands, 'Dán');
    const result = store.getSnapshot().document;
    expect(result.nodes).toHaveLength(4); expect(result.edges).toHaveLength(2);
    expect(result.edges[1]).toMatchObject({ source: result.nodes[2].id, target: result.nodes[3].id, label: 'Có' });
    expect(result.nodes[2].x).toBe(document.nodes[0].x + 30);
    expect(result.nodes[2].style).toEqual(document.nodes[0].style);
    expect(new Set([...result.nodes, ...result.edges].map((item) => item.id)).size).toBe(6);
    store.undo(); expect(store.getSnapshot().document).toEqual(document);
  });
  it('supports same-document edge-only clipboard without making dangling cross-document edges', () => {
    const document = graph();
    const fragment = copyFragment(document, { nodeIds: [], edgeIds: [document.edges[0].id] });
    expect(pasteFragment(document, fragment).commands[0].type).toBe('add_edges');
    expect(() => pasteFragment(createDocument(), fragment)).toThrow();
    expect(() => decodeFragment('not json')).toThrow();
    expect(() => decodeFragment(JSON.stringify({ ...fragment, nodes: [document.nodes[0], document.nodes[0]] }))).toThrow();
  });
  it('groups/ungroups and removes group members without invalid group remnants', () => {
    const document = graph(), store = new DiagramStore(document);
    store.selectAll(); store.execute(groupCommands(document, store.getSnapshot().selection));
    const grouped = store.getSnapshot().document;
    expect(grouped.groups).toHaveLength(1);
    store.select([document.nodes[0].id], []);
    expect(store.getSnapshot().selection.nodeIds).toHaveLength(2);
    store.execute(ungroupCommands(grouped, store.getSnapshot().selection));
    expect(store.getSnapshot().document.groups).toHaveLength(0);
    store.undo();
    store.execute([{ type: 'remove', nodeIds: [document.nodes[0].id], edgeIds: [] }]);
    expect(store.getSnapshot().document.groups).toHaveLength(0);
    expect(store.getSnapshot().selection.nodeIds).toHaveLength(1);
  });
  it('aligns and distributes selected shapes and preserves stack order as commands', () => {
    const document = graph(); document.nodes.push(createNode('rect', 800, 300));
    const ids = document.nodes.map((node) => node.id);
    const aligned = applyCommands(document, arrangeCommands(document, ids, 'left'));
    expect(aligned.nodes.map((node) => node.x)).toEqual([100, 100, 100]);
    const distributed = applyCommands(document, arrangeCommands(document, ids, 'horizontal'));
    const centers = distributed.nodes.map((node) => node.x + node.width / 2);
    expect(centers[1] - centers[0]).toBeCloseTo(centers[2] - centers[1]);
    const raised = applyCommands(document, arrangeCommands(document, [ids[0]], 'front'));
    expect(raised.nodes[0].zIndex).toBe(2);
  });
  it('rejects overlapping or dangling groups', () => {
    const document = graph(), ids = document.nodes.map((node) => node.id);
    const first = { id: newId(), name: 'A', nodeIds: ids };
    expect(DocumentSchema.safeParse({ ...document, groups: [first, { ...first, id: newId() }] }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...document, groups: [{ ...first, nodeIds: [ids[0], newId()] }] }).success).toBe(false);
  });
  it('store clipboard survives selection changes, duplicate does not replace it, and paste is undoable', () => {
    const document = graph(), store = new DiagramStore(document);
    store.selectAll(); const fragment = store.copySelection();
    store.select([document.nodes[0].id], []); store.duplicate();
    expect(store.getSnapshot().document.nodes).toHaveLength(3);
    store.paste(); expect(store.getSnapshot().document.nodes).toHaveLength(5);
    expect(store.getSnapshot().document.edges).toHaveLength(2);
    store.undo(); expect(store.getSnapshot().document.nodes).toHaveLength(3);
    expect(() => store.setClipboard({ ...fragment, nodes: [document.nodes[0], document.nodes[0]] })).toThrow();
    expect(store.hasClipboard()).toBe(true);
  });
});

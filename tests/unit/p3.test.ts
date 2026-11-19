import { describe, expect, it } from 'vitest';
import { applyCommands, canInsertNode, createDocument, createEdge, createNode, crossesBox, DiagramStore, insertNodeOnEdge, newId, routeAroundNodes, snapNode } from '@diagramai/diagram-core';
import { nearestOnSegment } from '../../packages/editor/src/hit-testing';

function graph() {
  const a = createNode('rect', 100, 0, 'A'), b = createNode('rect', 100, 400, 'B'), c = createNode('diamond', 500, 200, 'C');
  const edge = { ...createEdge(a.id, b.id), label: 'Có', style: { stroke: '#123456', strokeWidth: 3, dashed: true, textColor: '#654321', fontSize: 14 } };
  return { ...createDocument(), nodes: [a, b, c], edges: [edge] };
}
describe('InsertNodeOnEdge', () => {
  for (const kind of ['straight', 'orthogonal', 'smoothstep', 'curved'] as const) for (const markers of [['none', 'arrow'], ['arrow', 'arrow'], ['arrow', 'none'], ['none', 'none']] as const) {
    it(`splits ${kind}/${markers.join('-')} with label only on the first hop`, () => {
      const document = graph(), edge = document.edges[0];
      Object.assign(edge, { kind, markerStart: markers[0], markerEnd: markers[1] });
      const after = applyCommands(document, [insertNodeOnEdge(edge.id, document.nodes[2], { x: 175, y: 230 }, { x: 0, y: 1 })]);
      expect(after.nodes).toHaveLength(3); expect(after.edges).toHaveLength(2);
      expect(after.edges.map((item) => [item.source, item.target])).toEqual([[edge.source, document.nodes[2].id], [document.nodes[2].id, edge.target]]);
      expect(after.edges.map((item) => item.label)).toEqual(['Có', '']);
      for (const item of after.edges) { expect(item.style).toEqual(edge.style); expect([item.kind, item.markerStart, item.markerEnd]).toEqual([kind, ...markers]); expect(item.id).not.toBe(edge.id); }
      expect(after.edges[0].sourceHandle).toBe(edge.sourceHandle); expect(after.edges[1].targetHandle).toBe(edge.targetHandle);
      expect([after.edges[0].targetHandle, after.edges[1].sourceHandle]).toEqual(['top', 'bottom']);
      expect(document.edges).toHaveLength(1);
    });
  }
  it('adds a new node and split in one Undo/Redo, with stable generated edge IDs', () => {
    const document = graph(), store = new DiagramStore(document), node = createNode('round', 0, 0, 'Mới');
    store.execute([insertNodeOnEdge(document.edges[0].id, node, { x: 175, y: 230 }, { x: 1, y: 0 })]);
    const after = store.getSnapshot().document;
    expect(after.nodes).toHaveLength(4); expect(after.edges).toHaveLength(2);
    store.undo(); expect(store.getSnapshot().document).toEqual(document);
    store.redo(); expect(store.getSnapshot().document).toEqual(after);
    expect(applyCommands(document, store.getSnapshot().past[0].commands).edges).toEqual(after.edges);
  });
  it('commits 100 pointer drafts + split once; one Undo restores the edge AND old node position', () => {
    const document = graph(), store = new DiagramStore(document), c = document.nodes[2];
    store.beginInteraction('Kéo');
    for (let i = 0; i < 100; i++) store.updateInteraction([{ type: 'geometry', values: [{ id: c.id, x: 500 - i * 3 }] }]);
    const live = store.getSnapshot().document.nodes[2];
    store.finishInteraction([insertNodeOnEdge(document.edges[0].id, live, { x: 175, y: 230 }, { x: 0, y: 1 })], 'Chèn');
    const after = store.getSnapshot().document;
    expect(store.getSnapshot().past).toHaveLength(1);
    expect(applyCommands(document, store.getSnapshot().past[0].commands).nodes).toEqual(after.nodes);
    store.undo(); expect(store.getSnapshot().document).toEqual(document);
    store.redo(); expect(store.getSnapshot().document).toEqual(after);
  });
  it('rejects endpoint, connected/grouped nodes, stale node/edge, duplicate IDs and invalid ports atomically', () => {
    const document = graph(), edge = document.edges[0], c = document.nodes[2];
    const valid = insertNodeOnEdge(edge.id, c, { x: 175, y: 230 }, { x: 0, y: 1 });
    const inputs = [
      { ...valid, nodeData: document.nodes[0] }, { ...valid, edgeId: newId() }, { ...valid, entry: 'middle' },
      { ...valid, edgeIds: [newId(), edge.id] }, { ...valid, nodeData: { ...c, text: 'stale' } },
    ];
    for (const command of inputs) expect(() => applyCommands(document, [{ type: 'rename', title: 'Must roll back' }, command])).toThrow();
    const connected = { ...document, edges: [...document.edges, createEdge(c.id, document.nodes[1].id)] };
    expect(canInsertNode(connected, c.id)).toBe(false); expect(() => applyCommands(connected, [valid])).toThrow();
    const grouped = { ...document, groups: [{ id: newId(), name: 'G', nodeIds: [c.id, document.nodes[1].id] }] };
    expect(() => applyCommands(grouped, [valid])).toThrow();
    expect(document.title).not.toBe('Must roll back'); expect(document.edges).toHaveLength(1);
  });
  it('failure during finalization leaves the live draft/history untouched and Escape can restore it', () => {
    const document = graph(), store = new DiagramStore(document), c = document.nodes[2];
    store.beginInteraction('Kéo'); store.updateInteraction([{ type: 'geometry', values: [{ id: c.id, x: 170 }] }]);
    const before = store.getSnapshot();
    expect(() => store.finishInteraction([insertNodeOnEdge(newId(), before.document.nodes[2], { x: 175, y: 200 }, { x: 0, y: 1 })])).toThrow();
    expect(store.getSnapshot()).toBe(before); expect(before.past).toHaveLength(0);
    store.cancelInteraction(); expect(store.getSnapshot().document).toEqual(document);
  });
  it('rejects stale revisions and edge-cap overflow without dropping the original edge', () => {
    const document = graph(), store = new DiagramStore(document);
    const command = insertNodeOnEdge(document.edges[0].id, document.nodes[2], { x: 175, y: 200 }, { x: 0, y: 1 });
    store.execute([{ type: 'rename', title: 'New revision' }]);
    expect(() => store.execute([command], 'Chèn', 0)).toThrow();
    const full = { ...document, edges: Array.from({ length: 1000 }, () => ({ ...document.edges[0], id: newId() })) };
    expect(() => applyCommands(full, [insertNodeOnEdge(full.edges[0].id, document.nodes[2], { x: 175, y: 200 }, { x: 0, y: 1 })])).toThrow();
    expect(full.edges).toHaveLength(1000);
  });
  it('keeps port references and edge IDs across 120 move/resize gestures, undo and deletion', () => {
    const document = graph(), store = new DiagramStore(document), c = document.nodes[2];
    store.execute([insertNodeOnEdge(document.edges[0].id, c, { x: 175, y: 230 }, { x: 0, y: 1 })]);
    const edges = store.getSnapshot().document.edges;
    for (let i = 0; i < 120; i++) {
      store.beginInteraction('Kéo'); store.updateInteraction([{ type: 'geometry', values: [{ id: c.id, x: 100 + i, width: 170 + i % 20 }] }]); store.finishInteraction();
      expect(store.getSnapshot().document.edges).toEqual(edges);
    }
    for (let i = 0; i < 120; i++) store.undo();
    expect(store.getSnapshot().document.edges).toEqual(edges);
    store.execute([{ type: 'remove', nodeIds: [c.id], edgeIds: [] }]); expect(store.getSnapshot().document.edges).toHaveLength(0);
    store.undo(); expect(store.getSnapshot().document.edges).toEqual(edges);
  });
});

describe('snap and routing geometry', () => {
  for (const zoom of [.5, 1, 2]) it(`snaps centers/edges at ${zoom} zoom with CSS-pixel tolerance`, () => {
    const target = createNode('rect', 100, 100), moving = createNode('rect', 100 + 5 / zoom, 350);
    const result = snapNode(moving, [target], zoom);
    expect(result.x).toBe(100); expect(result.guides.some((guide) => guide.axis === 'x')).toBe(true);
    expect(snapNode({ ...moving, x: 100 + 8 / zoom }, [target], zoom).guides.filter((guide) => guide.axis === 'x')).toHaveLength(0);
    expect(snapNode({ ...moving, x: 427, y: 357 }, [], zoom)).toEqual({ x: 430, y: 360, guides: [] });
  });
  it('routes around a blocker with endpoint directions intact; fallback never loses the path', () => {
    const base = [{ x: 0, y: 100 }, { x: 20, y: 100 }, { x: 150, y: 100 }, { x: 280, y: 100 }, { x: 300, y: 100 }];
    const obstacle = createNode('rect', 100, 60);
    const route = routeAroundNodes(base, [obstacle]);
    expect(route.fallback).toBe(false); expect(route.points).not.toEqual(base);
    expect(route.points[0]).toEqual(base[0]); expect(route.points[1]).toEqual(base[1]);
    for (let i = 1; i < route.points.length; i++) expect(crossesBox(route.points[i - 1], route.points[i], obstacle)).toBe(false);
    const fallback = routeAroundNodes(base, [{ ...obstacle, x: -100, width: 500, y: 0, height: 200 }]);
    expect(fallback.fallback).toBe(true); expect(fallback.points).toEqual(base);
  });
  it('projects to the actual segment rather than accepting an entire bounding rectangle', () => {
    expect(nearestOnSegment({ x: 50, y: 5 }, { x: 0, y: 0 }, { x: 100, y: 0 }).distance).toBe(5);
    expect(nearestOnSegment({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 100 }).distance).toBeGreaterThan(60);
  });
});

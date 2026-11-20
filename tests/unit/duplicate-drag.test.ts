import { describe, expect, it } from 'vitest';
import { applyCommands, createDocument, createEdge, createNode, DiagramStore, insertNodeOnEdge, moveDuplicateDrag, newId, prepareDuplicateDrag } from '@diagramai/diagram-core';

function graph() {
  const a = createNode('rect', 100, 100, 'A'), b = createNode('diamond', 300, 200, 'B'), c = createNode('round', 500, 400, 'C');
  return { ...createDocument(), nodes: [a, b, c], edges: [createEdge(a.id, b.id), createEdge(b.id, c.id)] };
}
describe('Ctrl-drag duplication plan', () => {
  it('previews without touching document/history/clipboard and commits with one Undo', () => {
    const document = graph(), store = new DiagramStore(document);
    store.select([document.nodes[2].id], []); store.copySelection();
    const before = store.getSnapshot(), plan = prepareDuplicateDrag(document, [document.nodes[0].id]);
    const moved = moveDuplicateDrag(plan, 120, -30);
    expect(store.getSnapshot()).toBe(before); expect(document.nodes[0].x).toBe(100);
    expect(moved.nodes[0]).toEqual({ ...document.nodes[0], id: plan.nodeIds[0], x: 220, y: 70 });
    store.execute(moved.commands, 'Ctrl+kéo', before.revision);
    expect(store.getSnapshot().past).toHaveLength(1); expect(store.getSnapshot().document.edges).toEqual(document.edges);
    store.undo(); expect(store.getSnapshot().document).toEqual(document);
    store.redo(); expect(store.getSnapshot().document.nodes.at(-1)?.id).toBe(plan.nodeIds[0]);
    store.paste(); expect(store.getSnapshot().document.nodes.at(-1)?.text).toBe('C');
  });
  it('duplicates a whole group and internal edges, never edges back to original endpoints', () => {
    const document = graph();
    document.groups = [{ id: newId(), name: 'Nhóm', nodeIds: document.nodes.slice(0, 2).map((node) => node.id) }];
    const plan = prepareDuplicateDrag(document, document.groups[0].nodeIds), after = applyCommands(document, moveDuplicateDrag(plan, 83, 47).commands);
    expect(after.nodes).toHaveLength(5); expect(after.edges).toHaveLength(3); expect(after.groups).toHaveLength(2);
    expect(after.edges.at(-1)?.source).toBe(plan.nodeIds[0]); expect(after.edges.at(-1)?.target).toBe(plan.nodeIds[1]);
    expect(after.groups.at(-1)?.nodeIds).toEqual(plan.nodeIds);
    expect(after.nodes[4].x - after.nodes[3].x).toBe(document.nodes[1].x - document.nodes[0].x);
  });
  it('keeps preview UUIDs stable and combines copy + insertion into one atomic edit', () => {
    const document = graph(), plan = prepareDuplicateDrag(document, [document.nodes[0].id]);
    expect(moveDuplicateDrag(plan, 1, 2).nodes[0].id).toBe(moveDuplicateDrag(plan, 100, 200).nodes[0].id);
    const node = moveDuplicateDrag(plan, 100, 100).nodes[0];
    const store = new DiagramStore(document);
    store.execute([insertNodeOnEdge(document.edges[1].id, node, { x: 450, y: 350 }, { x: 0, y: 1 })]);
    expect(store.getSnapshot().document.nodes[0]).toEqual(document.nodes[0]);
    expect(store.getSnapshot().document.edges).toHaveLength(3);
    store.undo(); expect(store.getSnapshot().document).toEqual(document);
  });
  it('rejects unknown IDs, invalid offsets, caps and stale commits without changing the source', () => {
    const document = graph(), store = new DiagramStore(document), plan = prepareDuplicateDrag(document, [document.nodes[0].id]);
    expect(() => prepareDuplicateDrag(document, [newId()])).toThrow();
    expect(() => prepareDuplicateDrag(document, [document.nodes[0].id, document.nodes[0].id])).toThrow();
    expect(() => moveDuplicateDrag(plan, Infinity, 0)).toThrow();
    const full = { ...createDocument(), nodes: Array.from({ length: 500 }, () => createNode('rect', 0, 0)) };
    expect(() => prepareDuplicateDrag(full, [full.nodes[0].id])).toThrow();
    store.execute([{ type: 'rename', title: 'Changed' }]);
    expect(() => store.execute(moveDuplicateDrag(plan, 80, 40).commands, 'Copy', 0)).toThrow();
    expect(store.getSnapshot().document.nodes).toEqual(document.nodes);
  });
});

import type { DiagramNode } from './schema';

export interface SnapGuide { axis: 'x' | 'y'; position: number; start: number; end: number }
export function snapNode(node: DiagramNode, others: readonly DiagramNode[], zoom: number, grid = 10): { x: number; y: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  let x = Math.round(node.x / grid) * grid, y = Math.round(node.y / grid) * grid;
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height', cross = axis === 'x' ? 'y' : 'x', crossSize = axis === 'x' ? 'height' : 'width';
    let best: { delta: number; target: DiagramNode; position: number } | null = null;
    for (const target of others) for (const anchor of [.5, 0, 1]) for (const otherAnchor of [.5, 0, 1]) {
      const position = target[axis] + target[size] * otherAnchor, delta = position - node[axis] - node[size] * anchor;
      if (Math.abs(delta) <= 6 / zoom && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target, position };
    }
    if (best) {
      if (axis === 'x') x = node.x + best.delta; else y = node.y + best.delta;
      guides.push({ axis, position: best.position, start: Math.min(node[cross], best.target[cross]) - 12, end: Math.max(node[cross] + node[crossSize], best.target[cross] + best.target[crossSize]) + 12 });
    }
  }
  return { x, y, guides };
}

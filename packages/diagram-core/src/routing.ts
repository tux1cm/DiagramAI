import type { DiagramNode } from './schema';

export interface Point { x: number; y: number }
type Bounds = Pick<DiagramNode, 'id' | 'x' | 'y' | 'width' | 'height'>;
export function crossesBox(a: Point, b: Point, box: Bounds): boolean {
  const epsilon = .01;
  return a.x === b.x
    ? a.x > box.x + epsilon && a.x < box.x + box.width - epsilon && Math.max(a.y, b.y) > box.y + epsilon && Math.min(a.y, b.y) < box.y + box.height - epsilon
    : a.y === b.y && a.y > box.y + epsilon && a.y < box.y + box.height - epsilon && Math.max(a.x, b.x) > box.x + epsilon && Math.min(a.x, b.x) < box.x + box.width - epsilon;
}
const length = (points: Point[]) => points.slice(1).reduce((sum, point, i) => sum + Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y), 0);
export function routeAroundNodes(base: Point[], nodes: readonly Bounds[], sourceId?: string, targetId?: string): { points: Point[]; fallback: boolean } {
  const boxes = nodes.map((node) => {
    const padding = node.id === sourceId || node.id === targetId ? 0 : 8;
    return { ...node, x: node.x - padding, y: node.y - padding, width: node.width + padding * 2, height: node.height + padding * 2 };
  });
  const blocked = (points: Point[]) => points.slice(1).some((point, i) => boxes.some((box) => crossesBox(points[i], point, box)));
  if (!blocked(base)) return { points: base, fallback: false };
  if (base.length < 4) return { points: base, fallback: true };
  const a = base[1], b = base.at(-2)!, first = base[0], last = base.at(-1)!;
  // Bounded lane search, not a claim of full obstacle routing. Preserve the
  // outward source/target stubs and keep the original valid edge on failure.
  const nearby = [...boxes].sort((u, v) => Math.hypot(u.x - (a.x + b.x) / 2, u.y - (a.y + b.y) / 2) - Math.hypot(v.x - (a.x + b.x) / 2, v.y - (a.y + b.y) / 2)).slice(0, 48);
  const xs = [...new Set([a.x, b.x, ...nearby.flatMap((box) => [box.x - 4, box.x + box.width + 4])])];
  const ys = [...new Set([a.y, b.y, ...nearby.flatMap((box) => [box.y - 4, box.y + box.height + 4])])];
  let best: Point[] | null = null, cost = Infinity;
  const consider = (middle: Point[]) => {
    const points = [first, ...middle, last], candidateCost = length(points);
    if (candidateCost < cost && !blocked(points)) { best = points; cost = candidateCost; }
  };
  for (const x of xs) consider([a, { x, y: a.y }, { x, y: b.y }, b]);
  for (const y of ys) consider([a, { x: a.x, y }, { x: b.x, y }, b]);
  if (!best) for (const x of xs.slice(0, 26)) for (const y of ys.slice(0, 26)) {
    consider([a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]);
    consider([a, { x: a.x, y }, { x, y }, { x, y: b.y }, b]);
  }
  return { points: best ?? base, fallback: !best };
}

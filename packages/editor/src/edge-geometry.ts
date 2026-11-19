import { getSmoothStepPath, type GetSmoothStepPathParams } from '@xyflow/react';
import { routeAroundNodes, type DiagramNode } from '@diagramai/diagram-core';

// Let the router honor both port directions; midpoint-only elbows can travel
// back through the source shape when both ports face the same way.
export function orthogonalPath(params: GetSmoothStepPathParams, obstacles: readonly DiagramNode[] = [], sourceId?: string, targetId?: string): [string, number, number, boolean] {
  const round = (value: number) => Number(value.toFixed(1));
  const [raw, labelX, labelY] = getSmoothStepPath({ ...params, sourceX: round(params.sourceX), sourceY: round(params.sourceY), targetX: round(params.targetX), targetY: round(params.targetY), borderRadius: 0 });
  const coordinates = raw.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    const point = { x: round(coordinates[i]), y: round(coordinates[i + 1]) }, last = points.at(-1);
    if (!last || point.x !== last.x || point.y !== last.y) points.push(point);
  }
  const first = points[0], next = points[1], last = points.at(-1)!, previous = points.at(-2)!;
  const stub = (from: typeof first, to: typeof first) => {
    const distance = Math.min(20, Math.hypot(to.x - from.x, to.y - from.y) / 2);
    return { x: from.x + Math.sign(to.x - from.x) * distance, y: from.y + Math.sign(to.y - from.y) * distance };
  };
  // RF optimizes aligned routes down to two points. Supply explicit outward
  // stubs so even those routes can detour around an intermediate obstacle.
  const routingPoints = points.length < 4 && next ? [first, stub(first, next), ...points.slice(1, -1), stub(last, previous), last] : points;
  const route = routeAroundNodes(routingPoints, obstacles, sourceId, targetId);
  const unique = route.points.filter((point, i, all) => !i || point.x !== all[i - 1].x || point.y !== all[i - 1].y);
  let x = labelX, y = labelY;
  if (route.points !== routingPoints) {
    let remaining = unique.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - unique[i].x, point.y - unique[i].y), 0) / 2;
    for (let i = 1; i < unique.length; i++) {
      const a = unique[i - 1], b = unique[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining <= length) { const t = length ? remaining / length : 0; x = a.x + (b.x - a.x) * t; y = a.y + (b.y - a.y) * t; break; }
      remaining -= length;
    }
  }
  return ['M' + unique.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L'), x, y, route.fallback];
}

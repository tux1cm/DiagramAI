import { getBezierPath, getSmoothStepPath, Position, type GetBezierPathParams, type GetSmoothStepPathParams } from '@xyflow/react';
import { routeAroundNodes, type DiagramNode } from '@diagramai/diagram-core';

export const arrowSize = (strokeWidth: number) => Math.max(8, strokeWidth * 7);

// A Bezier tangent is vertical at the port, but on short, wide branches the
// curve enters the SIDE of its arrowhead just a few pixels before the tip.
// Give both ports a straight lead so the whole arrow sits on the port normal.
export function curvedPath(params: GetBezierPathParams, lead = 20): [string, number, number] {
  const { sourceX, sourceY, targetX, targetY, sourcePosition = Position.Bottom, targetPosition = Position.Top } = params;
  const normals = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
  const s = normals[sourcePosition], t = normals[targetPosition];
  const dx = targetX - sourceX, dy = targetY - sourceY, distance = Math.hypot(dx, dy);
  if (distance < .001) { const [path, x, y] = getBezierPath(params); return [path, x, y]; }
  const facingGap = dx * s.x + dy * s.y;
  const facing = s.x === -t.x && s.y === -t.y && facingGap > 0;
  const length = Math.min(lead, facing ? facingGap / 3 : distance / 4);
  const a = { x: sourceX + s.x * length, y: sourceY + s.y * length };
  const b = { x: targetX + t.x * length, y: targetY + t.y * length };
  const [curve, x, y] = getBezierPath({ ...params, sourceX: a.x, sourceY: a.y, targetX: b.x, targetY: b.y });
  return [`M${sourceX},${sourceY} L${a.x},${a.y} ${curve.slice(curve.indexOf('C'))} L${targetX},${targetY}`, x, y];
}

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

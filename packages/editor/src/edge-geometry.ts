import { getSmoothStepPath, type GetSmoothStepPathParams } from '@xyflow/react';

// Let the router honor both port directions; midpoint-only elbows can travel
// back through the source shape when both ports face the same way.
export function orthogonalPath(params: GetSmoothStepPathParams): [string, number, number] {
  const round = (value: number) => Number(value.toFixed(1));
  const [raw, x, y] = getSmoothStepPath({ ...params, sourceX: round(params.sourceX), sourceY: round(params.sourceY), targetX: round(params.targetX), targetY: round(params.targetY), borderRadius: 0 });
  const coordinates = raw.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    const point = { x: round(coordinates[i]), y: round(coordinates[i + 1]) }, last = points.at(-1);
    if (!last || point.x !== last.x || point.y !== last.y) points.push(point);
  }
  return ['M' + points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L'), x, y];
}

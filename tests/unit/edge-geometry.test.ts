import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { orthogonalPath } from '../../packages/editor/src/edge-geometry';

const outward = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
describe('orthogonal routing', () => {
  for (const sourcePosition of Object.values(Position)) for (const targetPosition of Object.values(Position)) {
    it(`respects ${sourcePosition} source and ${targetPosition} target directions`, () => {
      const [path] = orthogonalPath({ sourceX: 100, sourceY: 100, targetX: 400, targetY: 300, sourcePosition, targetPosition });
      const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const [sx, sy] = outward[sourcePosition], [tx, ty] = outward[targetPosition];
      expect((values[2] - values[0]) * sx + (values[3] - values[1]) * sy).toBeGreaterThan(0);
      expect((values.at(-4)! - values.at(-2)!) * tx + (values.at(-3)! - values.at(-1)!) * ty).toBeGreaterThan(0);
      for (let i = 2; i < values.length; i += 2) {
        expect(values[i] === values[i - 2] || values[i + 1] === values[i - 1]).toBe(true);
        expect([values[i], values[i + 1]]).not.toEqual([values[i - 2], values[i - 1]]);
      }
    });
  }
  it('normalizes floating point noise before routing and deduplication', () => {
    const params = { sourceX: 385, sourceY: 234, targetX: 385, targetY: 305, sourcePosition: Position.Bottom, targetPosition: Position.Top };
    expect(orthogonalPath({ ...params, targetX: 385.00000001 })).toEqual(orthogonalPath(params));
  });
});

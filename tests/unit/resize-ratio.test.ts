import { describe, expect, it } from 'vitest';
import { createNode, resizeWithRatio, SHAPE_DEFINITIONS, type ResizeCorner } from '@diagramai/diagram-core';

describe('proportional corner resize', () => {
  for (const corner of ['top.left', 'top.right', 'bottom.left', 'bottom.right'] as ResizeCorner[]) {
    for (const grow of [true, false]) it(`${corner} ${grow ? 'grows' : 'shrinks'} with center and ratio fixed`, () => {
      const node = createNode('rect', 100, 200), factor = grow ? 1 : -1;
      const result = resizeWithRatio(node, corner, { x: (corner.includes('left') ? -45 : 45) * factor, y: (corner.includes('top') ? -9 : 9) * factor });
      expect(result.width / result.height).toBeCloseTo(node.width / node.height, 10);
      expect(result.width > node.width).toBe(grow);
      expect(result.x + result.width / 2).toBeCloseTo(node.x + node.width / 2, 10);
      expect(result.y + result.height / 2).toBeCloseTo(node.y + node.height / 2, 10);
      expect(node.x - result.x).toBeCloseTo((result.width - node.width) / 2, 10);
      expect(node.y - result.y).toBeCloseTo((result.height - node.height) / 2, 10);
      expect(node.x).toBe(100); expect(node.y).toBe(200);
    });
  }
  for (const shape of ['rect', 'diamond', 'actor', 'ellipse'] as const) it(`clamps ${shape} min/max without distorting the shape`, () => {
    const node = createNode(shape, 100, 100), minimum = SHAPE_DEFINITIONS[shape].minSize;
    const small = resizeWithRatio(node, 'bottom.right', { x: -10000, y: -10000 });
    const large = resizeWithRatio(node, 'top.left', { x: -10000, y: -10000 });
    expect(small.width).toBeGreaterThanOrEqual(minimum.width); expect(small.height).toBeGreaterThanOrEqual(minimum.height);
    expect(large.width).toBeLessThanOrEqual(4096); expect(large.height).toBeLessThanOrEqual(4096);
    for (const result of [small, large]) {
      expect(result.width / result.height).toBeCloseTo(node.width / node.height, 10);
      expect(result.x + result.width / 2).toBeCloseTo(node.x + node.width / 2, 10);
      expect(result.y + result.height / 2).toBeCloseTo(node.y + node.height / 2, 10);
    }
  });
  it('moving a corner by its center-to-corner vector doubles the size around the same center', () => {
    const node = createNode('rect', 100, 200);
    const result = resizeWithRatio(node, 'bottom.right', { x: node.width / 2, y: node.height / 2 });
    expect(result).toEqual({ x: node.x - node.width / 2, y: node.y - node.height / 2, width: node.width * 2, height: node.height * 2 });
  });
  it('has no jump for zero movement and rejects nonfinite input', () => {
    const node = createNode('round', 100, 200);
    expect(resizeWithRatio(node, 'bottom.right', { x: 0, y: 0 })).toEqual({ x: node.x, y: node.y, width: node.width, height: node.height });
    expect(() => resizeWithRatio(node, 'bottom.right', { x: NaN, y: 0 })).toThrow();
  });
});

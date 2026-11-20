import { SHAPE_DEFINITIONS } from './registry';
import type { DiagramNode } from './schema';

export type ResizeCorner = 'top.left' | 'top.right' | 'bottom.left' | 'bottom.right';
export function resizeWithRatio(node: DiagramNode, corner: ResizeCorner, delta: { x: number; y: number }) {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) throw new Error('Khoảng kéo không hợp lệ');
  const left = corner.includes('left'), top = corner.includes('top'), minimum = SHAPE_DEFINITIONS[node.type].minSize;
  // Project the pointer onto the corner's diagonal. The opposite corner stays
  // fixed; both dimensions use one scale, including minimum/maximum clamping.
  const scale = Math.max(Math.max(minimum.width / node.width, minimum.height / node.height), Math.min(Math.min(4096 / node.width, 4096 / node.height), 1 + ((left ? -delta.x : delta.x) * node.width + (top ? -delta.y : delta.y) * node.height) / (node.width ** 2 + node.height ** 2)));
  const width = Math.max(minimum.width, Math.min(4096, node.width * scale)), height = Math.max(minimum.height, Math.min(4096, node.height * scale));
  return { x: left ? node.x + node.width - width : node.x, y: top ? node.y + node.height - height : node.y, width, height };
}

export interface EdgeHit {
  edgeId: string; point: { x: number; y: number }; tangent: { x: number; y: number }; distance: number;
}
export function nearestOnSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, distance: Math.hypot(p.x - point.x, p.y - point.y) };
}

// Measure the rendered SVG, not a bounding box or a different approximate router.
// Everything used for distance/tolerance is CSS screen pixels, including at pan/zoom.
export function hitTestEdges(host: HTMLElement, screen: { x: number; y: number }, excluded: Set<string> = new Set(), tolerance = 12): EdgeHit | null {
  const hits: EdgeHit[] = [];
  for (const path of host.querySelectorAll<SVGPathElement>('[data-edge] > .react-flow__edge-path')) {
    const group = path.parentElement!, edgeId = group.getAttribute('data-edge')!;
    if (excluded.has(group.getAttribute('data-source')!) || excluded.has(group.getAttribute('data-target')!)) continue;
    const box = path.getBoundingClientRect();
    if (screen.x < box.left - tolerance || screen.x > box.right + tolerance || screen.y < box.top - tolerance || screen.y > box.bottom + tolerance) continue;
    const matrix = path.getScreenCTM();
    if (!matrix) continue;
    const length = path.getTotalLength(), scale = Math.hypot(matrix.a, matrix.b);
    if (!length || !scale) continue;
    const samples = Math.max(2, Math.min(4096, Math.ceil(length * scale / 3)));
    let a = path.getPointAtLength(0).matrixTransform(matrix), best: EdgeHit | null = null;
    for (let i = 1; i <= samples; i++) {
      const b = path.getPointAtLength(length * i / samples).matrixTransform(matrix);
      const nearest = nearestOnSegment(screen, a, b), progress = (i - 1 + nearest.t) / samples;
      // Leave endpoints/handles available for normal connection and reconnection.
      if (progress * length * scale > 14 && (1 - progress) * length * scale > 14 && nearest.distance <= tolerance && (!best || nearest.distance < best.distance)) {
        const point = new DOMPoint(nearest.point.x, nearest.point.y).matrixTransform(matrix.inverse());
        const before = path.getPointAtLength(Math.max(0, length * progress - 2)), after = path.getPointAtLength(Math.min(length, length * progress + 2));
        best = { edgeId, point: { x: point.x, y: point.y }, tangent: { x: after.x - before.x, y: after.y - before.y }, distance: nearest.distance };
      }
      a = b;
    }
    if (best) hits.push(best);
  }
  hits.sort((a, b) => a.distance - b.distance || a.edgeId.localeCompare(b.edgeId));
  // Crossing/overlapping edges are ambiguous; do not silently split the wrong one.
  return hits.length > 1 && hits[1].distance - hits[0].distance < 2 ? null : hits[0] ?? null;
}

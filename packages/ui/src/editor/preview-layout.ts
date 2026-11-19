import type { FixtureEdge, FixtureNode, Port } from './fixture';

export function portPoint(node: FixtureNode, port: Port) {
  if (port === 'top') return { x: node.x + node.w / 2, y: node.y };
  if (port === 'bottom') return { x: node.x + node.w / 2, y: node.y + node.h };
  if (port === 'left') return { x: node.x, y: node.y + node.h / 2 };
  return { x: node.x + node.w, y: node.y + node.h / 2 };
}
export function edgeGeometry(edge: FixtureEdge, nodes: FixtureNode[]) {
  const from = nodes.find((node) => node.id === edge.from), to = nodes.find((node) => node.id === edge.to);
  if (!from || !to) return null;
  const a = portPoint(from, edge.fromPort), b = portPoint(to, edge.toPort);
  const points = ['top', 'bottom'].includes(edge.fromPort)
    ? [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b]
    : [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b];
  const unique = points.filter((point, i) => i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
  const segments = unique.slice(1).map((point, i) => ({ a: unique[i], b: point, length: Math.hypot(point.x - unique[i].x, point.y - unique[i].y) }));
  let remaining = segments.reduce((sum, segment) => sum + segment.length, 0) / 2;
  let label = a;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const t = segment.length ? remaining / segment.length : 0;
      label = { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t };
      break;
    }
    remaining -= segment.length;
  }
  return { path: 'M' + unique.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L'), label };
}
export function fitPreview(nodes: FixtureNode[], width: number, height: number, override: number | null = null) {
  if (!nodes.length || width <= 0 || height <= 0) return { zoom: 1, x: 0, y: 0 };
  const minX = Math.min(...nodes.map((node) => node.x)), minY = Math.min(...nodes.map((node) => node.y));
  const w = Math.max(...nodes.map((node) => node.x + node.w)) - minX;
  const h = Math.max(...nodes.map((node) => node.y + node.h)) - minY;
  const zoom = override === null
    ? Math.min(1, Math.max(.56, Math.min((width - 100) / Math.max(w, 1), (height - 140) / Math.max(h, 1))))
    : Math.max(.45, Math.min(1.8, override));
  return { zoom, x: (width - w * zoom) / 2 - minX * zoom, y: (height - h * zoom) / 2 - minY * zoom + 10 };
}
export function previewTextLines(text: string, width: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > Math.max(12, Math.floor(width / 9)) && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.length > 3 ? [lines[0], lines[1], lines.slice(2).join(' ')] : lines;
}

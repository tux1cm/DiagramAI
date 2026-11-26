import { expect, type Page } from '@playwright/test';
import { createDocument, createEdge, createNode, type DiagramDocument } from '@diagramai/diagram-core';

export function arrowFork() {
  const document = createDocument('Kiểm tra đầu mũi tên');
  const source = { ...createNode('round', 240, 40, 'Bước đầu'), width: 224, height: 74 };
  const left = { ...createNode('rect', 90, 160, 'Nhánh trái'), width: 150, height: 64 };
  const right = { ...createNode('rect', 464, 160, 'Nhánh phải'), width: 150, height: 64 };
  document.nodes.push(source, left, right);
  document.edges.push(...[left, right].map((node) => createEdge(source.id, node.id, 'bottom', 'top', { kind: 'curved' })));
  return document;
}

export async function assertArrowFork(page: Page, document: DiagramDocument, screenshot: string) {
  for (const edge of document.edges) {
    const path = page.locator(`[data-edge="${edge.id}"] .react-flow__edge-path`);
    const measured = await path.evaluate((element) => {
      const path = element as SVGPathElement, length = path.getTotalLength(), end = path.getPointAtLength(length), approach = path.getPointAtLength(length - 14);
      const matrix = path.getScreenCTM()!, screen = new DOMPoint(end.x, end.y).matrixTransform(matrix);
      return { end: { x: end.x, y: end.y }, approach: { x: approach.x, y: approach.y }, screen: { x: screen.x, y: screen.y } };
    });
    const target = await page.locator(`[data-node="${edge.target}"]`).boundingBox();
    expect(Math.abs(measured.end.x - measured.approach.x)).toBeLessThan(.1);
    expect(measured.end.y - measured.approach.y).toBeCloseTo(14, 1);
    expect(Math.abs(measured.screen.x - (target!.x + target!.width / 2))).toBeLessThan(2);
    expect(Math.abs(measured.screen.y - target!.y)).toBeLessThan(2);
    const marker = page.locator(`marker[id="end-${edge.id}"]`), size = await marker.getAttribute('markerWidth');
    await expect(marker).toHaveAttribute('refX', '10'); await expect(marker).toHaveAttribute('markerUnits', 'userSpaceOnUse');
    const middle = await path.evaluate((element) => { const path = element as SVGPathElement, point = path.getPointAtLength(path.getTotalLength() / 2); const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!); return { x: screen.x, y: screen.y }; });
    await page.mouse.click(middle.x, middle.y);
    await expect(page.locator(`.react-flow__edge[data-id="${edge.id}"]`)).toHaveClass(/selected/);
    await expect(marker).toHaveAttribute('markerWidth', size!);
  }
  await page.locator('#canvasHost').screenshot({ path: screenshot });
}

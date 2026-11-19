import { type Locator, type Page } from '@playwright/test';
import { clearGraph, connectHandles } from './drawing';

export async function insertionFixture(page: Page) {
  await clearGraph(page);
  await page.getByRole('button', { name: 'Vừa màn hình', exact: true }).click();
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Bắt dính lưới 10px', exact: true }).uncheck();
  const host = page.locator('#canvasHost');
  await page.locator('.shape-tile[data-shape=rect]').dragTo(host, { targetPosition: { x: 240, y: 180 } });
  await page.locator('.shape-tile[data-shape=round]').dragTo(host, { targetPosition: { x: 240, y: 480 } });
  const sourceId = (await page.locator('[data-node]').first().getAttribute('data-node'))!, targetId = (await page.locator('[data-node]').last().getAttribute('data-node'))!;
  const source = page.locator(`[data-node="${sourceId}"]`), target = page.locator(`[data-node="${targetId}"]`);
  await source.hover(); await connectHandles(page, source.locator('.port-bottom'), target.locator('.port-top'));
  const edge = page.locator('[data-edge]'), edgeId = (await edge.getAttribute('data-edge'))!;
  return { host, source, target, sourceId, targetId, edge, edgeId };
}
export async function pathPoint(path: Locator, fraction = .5) {
  return path.evaluate((element, fraction) => {
    const path = element as SVGPathElement, matrix = path.getScreenCTM()!;
    const point = path.getPointAtLength(path.getTotalLength() * fraction).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }, fraction);
}
export async function paletteToPoint(page: Page, shape: string, point: { x: number; y: number }, hold = false) {
  const tile = page.locator(`.shape-tile[data-shape=${shape}]`);
  await tile.scrollIntoViewIfNeeded(); const box = (await tile.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 20 });
  await page.mouse.move(point.x + 1, point.y, { steps: 2 }); await page.mouse.move(point.x, point.y);
  if (!hold) await page.mouse.up();
}

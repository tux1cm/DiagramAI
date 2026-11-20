import { expect, test } from '@playwright/test';
import { blockSystemClipboard, clearGraph, nodeButton, nodeModel, ready, shortcut } from '../helpers/drawing';
import { insertionFixture, pathPoint } from '../helpers/insertion';

async function beginCopy(page: import('@playwright/test').Page, node: import('@playwright/test').Locator, dx: number, dy: number) {
  const box = (await node.boundingBox())!;
  await page.keyboard.down('Control'); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 15 });
}
test('Ctrl-drag previews a copy while the source and its live connectors stay fixed; Undo/Redo is atomic', async ({ page }, testInfo) => {
  await page.goto('./'); await ready(page);
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Bắt dính lưới 10px', exact: true }).uncheck();
  const id = (await nodeModel(page, 'Tiếp nhận vật tư').getAttribute('data-node'))!, node = page.locator(`[data-node="${id}"]`);
  const x = await node.getAttribute('data-x'), y = await node.getAttribute('data-y');
  const edge = page.locator(`[data-edge][data-source="${id}"]`), originalPath = await edge.locator('.react-flow__edge-path').getAttribute('d');
  await beginCopy(page, node, 100, 70);
  await expect(page.locator('[data-duplicate-preview]')).toHaveCount(1);
  await expect(page.locator('[data-node]')).toHaveCount(6); await expect(node).toHaveAttribute('data-x', x!); await expect(node).toHaveAttribute('data-y', y!);
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', originalPath!);
  const previewId = await page.locator('[data-duplicate-preview]').getAttribute('data-duplicate-preview');
  await page.screenshot({ path: testInfo.outputPath('ctrl-drag-preview.png') });
  await page.mouse.up(); await page.keyboard.up('Control');
  await expect(page.locator('[data-duplicate-preview]')).toHaveCount(0); await expect(page.locator('[data-node]')).toHaveCount(7);
  await expect(page.locator('[data-edge]')).toHaveCount(5);
  const copy = page.locator(`[data-node="${previewId}"]`);
  await expect(copy).toBeVisible(); await expect(copy.locator('text')).toHaveText('Tiếp nhận vật tư');
  await expect(node).toHaveAttribute('data-x', x!); await expect(node).toHaveAttribute('data-y', y!);
  await expect(copy.locator('.node-border')).toHaveAttribute('fill', '#ffffff');
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(6); await expect(copy).toHaveCount(0);
  await shortcut(page, 'Control+y'); await expect(copy).toBeVisible();
});

test('Ctrl-click makes no copy/history; Escape and Ctrl+Z cancel the preview without undoing earlier edits', async ({ page }) => {
  await page.goto('./'); await ready(page);
  const node = nodeModel(page, 'Tiếp nhận vật tư'), x = await node.getAttribute('data-x'), y = await node.getAttribute('data-y');
  await node.click({ modifiers: ['Control'] });
  await nodeButton(page, 'Bắt đầu').click({ modifiers: ['Control'] }); await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await node.click({ modifiers: ['Control'] }); await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await expect(page.locator('[data-node]')).toHaveCount(6); await expect(page.locator('[data-duplicate-preview]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hoàn tác (Ctrl+Z)', exact: true })).toBeDisabled();
  await page.locator('.shape-tile[data-shape=ellipse]').click(); await expect(page.locator('[data-node]')).toHaveCount(7);
  for (const key of ['Escape', 'Control+z']) {
    await beginCopy(page, node, 90, 60); await expect(page.locator('[data-duplicate-preview]')).toHaveCount(1);
    await page.keyboard.press(key); await page.mouse.up(); await page.keyboard.up('Control');
    await expect(page.locator('[data-node]')).toHaveCount(7); await expect(page.locator('[data-duplicate-preview]')).toHaveCount(0);
    await expect(node).toHaveAttribute('data-x', x!); await expect(node).toHaveAttribute('data-y', y!);
  }
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(6);
});

test('Ctrl-drag copies grouped selection/internal edges without incident edges or replacing the clipboard', async ({ page }) => {
  await blockSystemClipboard(page); await page.goto('./'); await ready(page);
  await nodeButton(page, 'Trả nhà cung cấp').click(); await shortcut(page, 'Control+c');
  await nodeButton(page, 'Bắt đầu').click(); await nodeButton(page, 'Tiếp nhận vật tư').click({ modifiers: ['Shift'] });
  await shortcut(page, 'Control+g');
  const node = nodeModel(page, 'Tiếp nhận vật tư');
  const originalIds = await page.locator('[data-node]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-node')));
  await beginCopy(page, node, 160, 30);
  await expect(page.locator('[data-duplicate-preview]')).toHaveCount(2);
  await page.mouse.up(); await page.keyboard.up('Control');
  await expect(page.locator('[data-node]')).toHaveCount(8); await expect(page.locator('[data-edge]')).toHaveCount(6);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  const newIds = (await page.locator('[data-node]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-node')))).filter((id) => !originalIds.includes(id));
  await shortcut(page, 'Escape'); await page.locator(`[data-node="${newIds[0]}"]`).click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(6);
  await shortcut(page, 'Control+v'); await expect(page.locator('[data-node]')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Hình Trả nhà cung cấp', exact: true })).toHaveCount(2);
});

test('Ctrl-drag onto an edge copies and inserts in one Undo; releasing Ctrl early still copies', async ({ page }) => {
  await page.goto('./'); const { source, sourceId, edgeId } = await insertionFixture(page);
  const point = await pathPoint(page.locator(`[data-edge="${edgeId}"] .react-flow__edge-path`)), box = (await source.boundingBox())!;
  const y = await source.getAttribute('data-y');
  await beginCopy(page, source, point.x - box.x - box.width / 2, point.y - box.y - box.height / 2);
  await expect(page.locator('#canvasHost')).toHaveAttribute('data-insert-edge', edgeId);
  await page.keyboard.up('Control'); await page.mouse.up();
  await expect(page.locator('[data-node]')).toHaveCount(3); await expect(page.locator('[data-edge]')).toHaveCount(2);
  await expect(page.locator(`[data-node="${sourceId}"]`)).toHaveAttribute('data-y', y!);
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(2);
  await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveCount(1);
});

for (const zoom of [50, 200]) test(`Ctrl-drag follows flow coordinates at ${zoom}% with pan and no movement of the original`, async ({ page }) => {
  await page.goto('./'); await clearGraph(page); await page.getByRole('button', { name: 'Vừa màn hình', exact: true }).click();
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click(); await page.getByRole('checkbox', { name: 'Bắt dính lưới 10px', exact: true }).uncheck();
  const host = page.locator('#canvasHost'), bounds = (await host.boundingBox())!;
  await page.locator('.shape-tile[data-shape=rect]').dragTo(host, { targetPosition: { x: bounds.width / 2, y: bounds.height / 2 } });
  const node = page.locator('[data-node]'), id = await node.getAttribute('data-node'), x = Number(await node.getAttribute('data-x')), y = Number(await node.getAttribute('data-y'));
  await page.locator('#zoomLabel').dblclick(); await page.getByLabel('Mức thu phóng (%)', { exact: true }).fill(String(zoom)); await page.getByLabel('Mức thu phóng (%)', { exact: true }).press('Enter');
  await host.focus(); await page.keyboard.down('Space'); await page.mouse.move(bounds.x + 40, bounds.y + 230); await page.mouse.down();
  await page.mouse.move(bounds.x + 60, bounds.y + 240, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Space');
  await beginCopy(page, node, 60, 40); await page.mouse.up(); await page.keyboard.up('Control');
  const copy = page.locator(`[data-node]:not([data-node="${id}"])`);
  await expect(copy).toHaveCount(1);
  expect(Number(await copy.getAttribute('data-x'))).toBeCloseTo(x + 60 / (zoom / 100), 1);
  expect(Number(await copy.getAttribute('data-y'))).toBeCloseTo(y + 40 / (zoom / 100), 1);
  await expect(page.locator(`[data-node="${id}"]`)).toHaveAttribute('data-x', String(x));
});

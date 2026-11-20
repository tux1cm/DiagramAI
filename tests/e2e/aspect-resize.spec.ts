import { expect, test } from '@playwright/test';
import { clearGraph, nodeModel, ready, shortcut } from '../helpers/drawing';
import { cornerDrag, nodeGeometry, type Corner } from '../helpers/resize';

for (const corner of ['top.left', 'top.right', 'bottom.left', 'bottom.right'] as Corner[]) {
  test(`Ctrl-resize ${corner} preserves ratio and center, keeps edges/font, and undoes once`, async ({ page }, testInfo) => {
    await page.goto('./'); await ready(page);
    const id = (await nodeModel(page, 'Tiếp nhận vật tư').getAttribute('data-node'))!, node = page.locator(`[data-node="${id}"]`);
    await node.click(); const before = await nodeGeometry(node);
    const edge = page.locator(`[data-edge][data-source="${id}"]`), path = await edge.locator('.react-flow__edge-path').getAttribute('d'), edgeId = await edge.getAttribute('data-edge');
    const font = await node.locator('text').first().getAttribute('font-size');
    await cornerDrag(page, node, corner, corner.includes('left') ? -60 : 60, corner.includes('top') ? -12 : 12, true, true);
    await expect(node).not.toHaveAttribute('data-width', String(before.width));
    const live = await nodeGeometry(node);
    expect(live.width / live.height).toBeCloseTo(before.width / before.height, 6);
    expect(live.x + live.width / 2).toBeCloseTo(before.x + before.width / 2, 5);
    expect(live.y + live.height / 2).toBeCloseTo(before.y + before.height / 2, 5);
    expect(live.x).toBeLessThan(before.x); expect(live.y).toBeLessThan(before.y);
    expect(live.x + live.width).toBeGreaterThan(before.x + before.width); expect(live.y + live.height).toBeGreaterThan(before.y + before.height);
    await expect(page.locator('[data-duplicate-preview]')).toHaveCount(0); await expect(page.locator('[data-node]')).toHaveCount(6);
    await expect(edge).toHaveAttribute('data-edge', edgeId!); await expect(edge).toHaveAttribute('data-source-handle', 'bottom');
    await expect(edge.locator('.react-flow__edge-path')).not.toHaveAttribute('d', path!);
    const start = (await edge.locator('.react-flow__edge-path').getAttribute('d'))!.match(/^M(-?[\d.]+),(-?[\d.]+)/)!;
    expect(Number(start[1])).toBeCloseTo(live.x + live.width / 2, 0); expect(Number(start[2])).toBeCloseTo(live.y + live.height, 0);
    await page.mouse.up(); await page.keyboard.up('Control');
    await expect(node.locator('text').first()).toHaveAttribute('font-size', font!); await expect(page.locator('.toast')).toHaveCount(0);
    const after = await nodeGeometry(node);
    await shortcut(page, 'Control+z'); expect(await nodeGeometry(node)).toEqual(before);
    await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', path!);
    await shortcut(page, 'Control+y'); expect(await nodeGeometry(node)).toEqual(after);
    if (corner === 'bottom.right') await page.screenshot({ path: testInfo.outputPath('ctrl-corner-resize.png') });
  });
}

test('ratio resize shrinks to shape minimums without distortion; the next normal corner drag stays free', async ({ page }) => {
  await page.goto('./'); await clearGraph(page); await page.getByRole('button', { name: 'Vừa màn hình', exact: true }).click();
  await page.locator('.shape-tile[data-shape=actor]').click();
  const node = page.locator('[data-node]'), before = await nodeGeometry(node);
  await cornerDrag(page, node, 'bottom.right', -180, -180);
  const minimum = await nodeGeometry(node);
  expect(minimum.width).toBeGreaterThanOrEqual(50); expect(minimum.height).toBeGreaterThanOrEqual(90);
  expect(minimum.width / minimum.height).toBeCloseTo(before.width / before.height, 6);
  expect(minimum.x + minimum.width / 2).toBeCloseTo(before.x + before.width / 2, 5); expect(minimum.y + minimum.height / 2).toBeCloseTo(before.y + before.height / 2, 5);
  expect(minimum.width).toBeLessThan(before.width); await expect(page.locator('.toast')).toHaveCount(0);
  await shortcut(page, 'Control+z'); expect(await nodeGeometry(node)).toEqual(before);
  await cornerDrag(page, node, 'bottom.right', 60, 10, false);
  const free = await nodeGeometry(node);
  expect(Math.abs(free.width / free.height - before.width / before.height)).toBeGreaterThan(.1);
  await expect(page.locator('[data-node]')).toHaveCount(1);
});

test('Ctrl is latched at corner-down; Escape cancels resize without adding a copy or history', async ({ page }) => {
  await page.goto('./'); await ready(page);
  const id = (await nodeModel(page, 'Tiếp nhận vật tư').getAttribute('data-node'))!, node = page.locator(`[data-node="${id}"]`);
  await node.click(); const before = await nodeGeometry(node);
  await cornerDrag(page, node, 'bottom.right', 60, 10, true, true);
  await page.keyboard.up('Control');
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width + 15, box.y + box.height + 3, { steps: 5 });
  const live = await nodeGeometry(node); expect(live.width / live.height).toBeCloseTo(before.width / before.height, 6);
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await nodeGeometry(node)).toEqual(before);
  await expect(page.locator('[data-node]')).toHaveCount(6); await expect(page.locator('[data-duplicate-preview]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hoàn tác (Ctrl+Z)', exact: true })).toBeDisabled();
});

for (const zoom of [50, 200]) test(`Ctrl-corner ratio is independent of ${zoom}% zoom`, async ({ page }) => {
  await page.goto('./'); await clearGraph(page); await page.getByRole('button', { name: 'Vừa màn hình', exact: true }).click();
  await page.locator('.shape-tile[data-shape=ellipse]').click();
  await page.locator('#zoomLabel').dblclick(); await page.getByLabel('Mức thu phóng (%)', { exact: true }).fill(String(zoom)); await page.getByLabel('Mức thu phóng (%)', { exact: true }).press('Enter');
  const node = page.locator('[data-node]'), before = await nodeGeometry(node);
  await cornerDrag(page, node, 'bottom.right', 45, 8);
  const after = await nodeGeometry(node);
  expect(after.width).toBeGreaterThan(before.width); expect(after.width / after.height).toBeCloseTo(before.width / before.height, 6);
  expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 5); expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 5);
  await shortcut(page, 'Control+z'); expect(await nodeGeometry(node)).toEqual(before);
});

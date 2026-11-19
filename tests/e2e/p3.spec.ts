import { expect, test } from '@playwright/test';
import { connectHandles, dragBy, ready, shortcut } from '../helpers/drawing';
import { insertionFixture, paletteToPoint, pathPoint } from '../helpers/insertion';

test.setTimeout(120000);
for (const kind of ['straight', 'orthogonal', 'smoothstep', 'curved']) {
  test(`palette insertion splits a ${kind} edge with highlight, stable markers/label, one-step undo`, async ({ page }, testInfo) => {
    await page.goto('./'); const { sourceId, targetId, edge, edgeId, host, target } = await insertionFixture(page);
    await page.getByLabel('Kiểu đường', { exact: true }).selectOption(kind);
    await page.getByLabel('Mũi tên đầu', { exact: true }).selectOption('arrow');
    const label = page.getByLabel('Nhãn đường nối', { exact: true }); await label.fill('Có'); await label.press('Enter');
    if (kind === 'curved' || kind === 'smoothstep') {
      await target.click();
      const x = page.getByLabel('Vị trí X', { exact: true }); await x.fill('345'); await x.press('Enter');
    }
    const originalPath = await edge.locator('.react-flow__edge-path').getAttribute('d');
    const point = await pathPoint(edge.locator('.react-flow__edge-path'));
    await paletteToPoint(page, 'diamond', point, true);
    await expect(host).toHaveAttribute('data-insert-edge', edgeId);
    await expect(edge).toHaveAttribute('data-insert-highlight', 'true');
    await page.mouse.up();
    await expect(page.locator('[data-node]')).toHaveCount(3); await expect(page.locator('[data-edge]')).toHaveCount(2);
    const inserted = page.locator('[data-node][data-type=diamond]'), id = (await inserted.getAttribute('data-node'))!;
    const first = page.locator(`[data-edge][data-source="${sourceId}"][data-target="${id}"]`), second = page.locator(`[data-edge][data-source="${id}"][data-target="${targetId}"]`);
    await expect(first).toHaveAttribute('data-kind', kind); await expect(second).toHaveAttribute('data-kind', kind);
    await expect(first.locator('.edge-label')).toHaveText('Có'); await expect(second.locator('.edge-label')).toHaveCount(0);
    for (const segment of [first, second]) {
      await expect(segment.locator('.react-flow__edge-path')).toHaveAttribute('marker-start', /start-/);
      await expect(segment.locator('.react-flow__edge-path')).toHaveAttribute('marker-end', /end-/);
    }
    await expect(page.locator('.toast')).toContainText('nhãn điều kiện');
    await expect(host).not.toHaveAttribute('data-insert-edge');
    const ids = await page.locator('[data-edge]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-edge')));
    await shortcut(page, 'Control+z');
    await expect(page.locator('[data-node]')).toHaveCount(2); await expect(page.locator('[data-edge]')).toHaveCount(1);
    await expect(page.locator(`[data-edge="${edgeId}"] .react-flow__edge-path`)).toHaveAttribute('d', originalPath!);
    await shortcut(page, 'Control+y');
    await expect(page.locator('[data-edge]')).toHaveCount(2);
    expect(await page.locator('[data-edge]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-edge')))).toEqual(ids);
    await page.screenshot({ path: testInfo.outputPath(`insert-${kind}.png`) });
  });
}

for (const zoom of [50, 100, 200]) test(`inserts an existing isolated node with pan at ${zoom}% and Undo restores its position`, async ({ page }) => {
  await page.goto('./'); const { host, edgeId } = await insertionFixture(page);
  await page.locator('.shape-tile[data-shape=diamond]').dragTo(host, { targetPosition: { x: 420, y: 320 } });
  const node = page.locator('[data-node][data-type=diamond]');
  const x = await node.getAttribute('data-x'), y = await node.getAttribute('data-y');
  // Pan via Space, then set exact zoom through the public zoom controls.
  await host.focus(); await page.keyboard.down('Space');
  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 260); await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 270, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Space');
  await page.locator('#zoomLabel').dblclick();
  await page.getByRole('spinbutton', { name: 'Mức thu phóng (%)', exact: true }).fill(String(zoom));
  await page.getByRole('spinbutton', { name: 'Mức thu phóng (%)', exact: true }).press('Enter');
  await expect(page.locator('#zoomLabel')).toHaveText(`${zoom}%`);
  const edge = page.locator(`[data-edge="${edgeId}"]`);
  const beforePan = await pathPoint(edge.locator('.react-flow__edge-path'));
  const dx = box.x + box.width * .35 - beforePan.x, dy = box.y + box.height * .5 - beforePan.y;
  await host.focus(); await page.keyboard.down('Space');
  await page.mouse.move(box.x + box.width - 35, box.y + box.height - 90); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 35 + dx, box.y + box.height - 90 + dy, { steps: 12 }); await page.mouse.up(); await page.keyboard.up('Space');
  const point = await pathPoint(edge.locator('.react-flow__edge-path'));
  const bounds = await node.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2); await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 20 });
  await expect(host).toHaveAttribute('data-insert-edge', edgeId);
  await page.mouse.up(); await expect(page.locator('[data-edge]')).toHaveCount(2);
  await shortcut(page, 'Control+z');
  await expect(node).toHaveAttribute('data-x', x!); await expect(node).toHaveAttribute('data-y', y!);
  await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveCount(1);
});

test('drop away from the rendered curve and near endpoints never splits by bounding box', async ({ page }) => {
  await page.goto('./'); const { edge, host, target } = await insertionFixture(page);
  await target.click();
  const x = Number(await target.getAttribute('data-x'));
  await page.getByLabel('Vị trí X', { exact: true }).fill(String(x + 180)); await page.getByLabel('Vị trí X', { exact: true }).press('Enter');
  const miss = await edge.locator('.react-flow__edge-path').evaluate((element) => {
    const path = element as SVGPathElement, box = path.getBoundingClientRect(), matrix = path.getScreenCTM()!;
    const samples = Array.from({ length: 101 }, (_, i) => path.getPointAtLength(path.getTotalLength() * i / 100).matrixTransform(matrix));
    for (const fx of [.2, .4, .6, .8]) for (const fy of [.2, .4, .6, .8]) {
      const point = { x: box.x + box.width * fx, y: box.y + box.height * fy };
      if (Math.min(...samples.map((sample) => Math.hypot(sample.x - point.x, sample.y - point.y))) > 40) return point;
    }
    return null;
  });
  expect(miss).not.toBeNull();
  await paletteToPoint(page, 'diamond', miss!);
  await expect(page.locator('[data-edge]')).toHaveCount(1); await expect(page.locator('[data-node]')).toHaveCount(3);
  await expect(host).not.toHaveAttribute('data-insert-edge');
  const endpoint = await pathPoint(edge.locator('.react-flow__edge-path'), .01);
  await paletteToPoint(page, 'ellipse', endpoint);
  await expect(page.locator('[data-edge]')).toHaveCount(1); await expect(page.locator('[data-node]')).toHaveCount(4);
});

test('Escape cancels a live insertion drag; connected nodes and crossing edges are never rewired', async ({ page }) => {
  await page.goto('./'); const { host, edge, edgeId, source, target } = await insertionFixture(page);
  await page.locator('.shape-tile[data-shape=diamond]').dragTo(host, { targetPosition: { x: 470, y: 320 } });
  const node = page.locator('[data-node][data-type=diamond]'), x = await node.getAttribute('data-x');
  const point = await pathPoint(edge.locator('.react-flow__edge-path')), box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(point.x, point.y, { steps: 15 });
  await expect(host).toHaveAttribute('data-insert-edge', edgeId);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(host).not.toHaveAttribute('data-insert-edge'); await expect(node).toHaveAttribute('data-x', x!);
  await expect(edge).toHaveCount(1);
  await source.hover(); await connectHandles(page, source.locator('.port-right'), node.locator('.port-top'));
  const connectedIds = await page.locator('[data-edge]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-edge')));
  const restoredBox = (await node.boundingBox())!;
  await dragBy(page, node, point.x - restoredBox.x - restoredBox.width / 2, point.y - restoredBox.y - restoredBox.height / 2);
  expect(await page.locator('[data-edge]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-edge')))).toEqual(connectedIds);
  await shortcut(page, 'Control+z'); await shortcut(page, 'Control+z');
  await expect(page.locator('[data-edge]')).toHaveCount(1);
  // A duplicate overlapping edge is ambiguous, so palette drop must add only a node.
  await source.hover(); await connectHandles(page, source.locator('.port-bottom'), target.locator('.port-top'));
  await expect(page.locator('[data-edge]')).toHaveCount(2);
  await paletteToPoint(page, 'ellipse', point, true);
  await expect(host).not.toHaveAttribute('data-insert-edge');
  await page.mouse.up();
  await expect(page.locator('[data-edge]')).toHaveCount(2); await expect(page.locator('[data-node]')).toHaveCount(4);
});

test('orthogonal routing avoids a blocker without changing edge identity, then restores when cleared', async ({ page }, testInfo) => {
  await page.goto('./'); const { edge, host, edgeId } = await insertionFixture(page);
  await page.getByLabel('Kiểu đường', { exact: true }).selectOption('orthogonal');
  const original = await edge.locator('.react-flow__edge-path').getAttribute('d');
  await page.locator('.shape-tile[data-shape=rect]').dragTo(host, { targetPosition: { x: 470, y: 320 } });
  const blocker = page.locator('[data-node]').last(), blockerId = await blocker.getAttribute('data-node');
  const x = page.getByLabel('Vị trí X', { exact: true }); await x.fill('165'); await x.press('Enter');
  const y = page.getByLabel('Vị trí Y', { exact: true }); await y.fill('300'); await y.press('Enter');
  await expect(edge).toHaveAttribute('data-edge', edgeId);
  await expect(edge.locator('.react-flow__edge-path')).not.toHaveAttribute('d', original!);
  await expect(edge).not.toHaveAttribute('data-route-fallback');
  const intersects = await edge.locator('.react-flow__edge-path').evaluate((element, blockerId) => {
    const path = element as SVGPathElement, box = document.querySelector(`[data-node="${blockerId}"]`)!.getBoundingClientRect(), matrix = path.getScreenCTM()!;
    for (let i = 0; i <= 200; i++) {
      const point = path.getPointAtLength(path.getTotalLength() * i / 200).matrixTransform(matrix);
      if (point.x > box.left + 1 && point.x < box.right - 1 && point.y > box.top + 1 && point.y < box.bottom - 1) return true;
    }
    return false;
  }, blockerId);
  expect(intersects).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('routing-blocker.png') });
  await shortcut(page, 'Control+z'); await shortcut(page, 'Control+z');
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', original!);
});

test('center/edge guidelines appear while dragging, snap is optional and Undo is one gesture', async ({ page }, testInfo) => {
  await page.goto('./'); const { host, source } = await insertionFixture(page);
  await page.locator('.shape-tile[data-shape=diamond]').dragTo(host, { targetPosition: { x: 470, y: 320 } });
  const node = page.locator('[data-node][data-type=diamond]'), originalX = await node.getAttribute('data-x');
  await page.getByRole('checkbox', { name: 'Bắt dính lưới 10px', exact: true }).check();
  const from = (await node.boundingBox())!, target = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2 + 3, from.y + from.height / 2 + 35, { steps: 15 });
  await expect(page.locator('[data-guide=x]')).toHaveCount(1);
  const left = Number(await node.getAttribute('data-x')), width = Number(await node.getAttribute('data-width'));
  expect(left + width / 2).toBe(Number(await source.getAttribute('data-x')) + Number(await source.getAttribute('data-width')) / 2);
  await page.screenshot({ path: testInfo.outputPath('guideline.png') });
  await page.mouse.up(); await expect(page.locator('[data-guide]')).toHaveCount(0);
  await shortcut(page, 'Control+z'); await expect(node).toHaveAttribute('data-x', originalX!);
  await page.getByRole('checkbox', { name: 'Bắt dính lưới 10px', exact: true }).uncheck();
  await dragBy(page, node, 13, 17); await expect(page.locator('[data-guide]')).toHaveCount(0);
});

test('live handles survive 101 drag gestures without edge loss or identity changes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1366', 'Stress once; all interaction cases run at every viewport.');
  await page.goto('./'); const { source, edgeId } = await insertionFixture(page);
  for (let i = 0; i < 101; i++) await dragBy(page, source, i % 2 ? -4 : 4, i % 2 ? -2 : 2);
  await expect(page.locator('[data-edge]')).toHaveCount(1);
  await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveAttribute('data-source-handle', 'bottom');
  await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveAttribute('data-target-handle', 'top');
  await expect(page.locator('.toast')).toHaveCount(0);
  await shortcut(page, 'Control+z'); await ready(page);
});

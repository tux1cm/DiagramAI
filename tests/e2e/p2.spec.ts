import { expect, test } from '@playwright/test';
import { blockSystemClipboard, clearGraph, connectHandles, dragBy, nodeButton, nodeModel, ready, shortcut } from '../helpers/drawing';

test.setTimeout(60000);

test('creates twenty real nodes, all General shapes, and text with UUID IDs and undo', async ({ page }, testInfo) => {
  await page.goto('./'); await clearGraph(page);
  const shapes = ['rect', 'round', 'ellipse', 'diamond', 'parallelogram', 'hexagon', 'triangle', 'cylinder', 'document', 'cloud', 'note', 'speech', 'folder', 'chevron', 'database', 'actor', 'table', 'card'];
  for (const shape of shapes) await page.locator(`.shape-tile[data-shape=${shape}]`).click();
  await expect(page.locator('[data-node]')).toHaveCount(18);
  await page.getByRole('toolbar').getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
  await page.locator('.react-flow__pane').click({ position: { x: 100, y: 150 } });
  await page.locator('.shape-tile[data-shape=rect]').click();
  await expect(page.locator('[data-node]')).toHaveCount(20);
  const ids = await page.locator('[data-node]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-node')));
  expect(new Set(ids).size).toBe(20);
  for (const id of ids) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(19);
  await shortcut(page, 'Control+Shift+z'); await expect(page.locator('[data-node]')).toHaveCount(20);
  await expect(page.locator('.footer')).toContainText('20 hình');
  await page.screenshot({ path: testInfo.outputPath('twenty-nodes.png') });
});

test('node and edge labels edit inline with Enter/Shift+Enter/Escape and one-step undo', async ({ page }, testInfo) => {
  await page.goto('./'); await ready(page);
  const id = await nodeModel(page, 'Tiếp nhận vật tư').getAttribute('data-node');
  const node = page.locator(`[data-node="${id}"]`);
  await node.dblclick();
  const input = page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true });
  await input.fill('Nhập nguyên liệu'); await input.press('Shift+Enter'); await page.keyboard.insertText('Kiểm tra'); await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(node.locator('text')).toHaveText(['Nhập nguyên liệu', 'Kiểm tra']);
  await shortcut(page, 'Control+z'); await expect(node.locator('text')).toHaveText(['Tiếp nhận vật tư']);
  await shortcut(page, 'Control+y'); await expect(node.locator('text')).toHaveText(['Nhập nguyên liệu', 'Kiểm tra']);
  await node.dblclick(); await input.fill('Bỏ thay đổi'); await input.press('Escape');
  await expect(node.locator('text')).toHaveText(['Nhập nguyên liệu', 'Kiểm tra']);
  await page.getByRole('button', { name: 'Đường nối Không', exact: true }).dblclick();
  const edgeInput = page.getByRole('textbox', { name: 'Sửa nhãn đường nối', exact: true });
  await edgeInput.fill('Chưa đạt'); await edgeInput.press('Enter');
  await expect(page.getByRole('button', { name: 'Đường nối Chưa đạt', exact: true })).toBeVisible();
  await shortcut(page, 'Control+z'); await expect(page.getByRole('button', { name: 'Đường nối Không', exact: true })).toBeVisible();
  await shortcut(page, 'Control+y');
  await page.screenshot({ path: testInfo.outputPath('inline-labels.png') });
});

test('dragging and corner resize keep edge identity/handles and undo each gesture once', async ({ page }, testInfo) => {
  await page.goto('./'); await ready(page);
  const node = nodeModel(page, 'Tiếp nhận vật tư'), id = await node.getAttribute('data-node');
  const edge = page.locator(`[data-edge][data-source="${id}"]`);
  const edgeId = await edge.getAttribute('data-edge'), originalPath = await edge.locator('.react-flow__edge-path').getAttribute('d');
  const checkSourceAnchor = async () => {
    await expect.poll(async () => {
      const geometry = await node.evaluate((element) => ({ x: Number(element.getAttribute('data-x')), y: Number(element.getAttribute('data-y')), width: Number(element.getAttribute('data-width')), height: Number(element.getAttribute('data-height')) }));
      const start = (await edge.locator('.react-flow__edge-path').getAttribute('d'))!.match(/^M(-?[\d.]+),(-?[\d.]+)/)!;
      return Math.max(Math.abs(Number(start[1]) - geometry.x - geometry.width / 2), Math.abs(Number(start[2]) - geometry.y - geometry.height));
    }).toBeLessThan(.11);
  };
  const before = { x: await node.getAttribute('data-x'), y: await node.getAttribute('data-y'), width: await node.getAttribute('data-width'), height: await node.getAttribute('data-height') };
  expect(originalPath).toMatch(/^M385\.0,234\.0 L/);
  expect(originalPath).toMatch(/ L385\.0,305\.0$/);
  await dragBy(page, node, 80, 40);
  await expect(node).not.toHaveAttribute('data-x', before.x!);
  await expect(edge).toHaveAttribute('data-edge', edgeId!);
  await expect(edge).toHaveAttribute('data-source-handle', 'bottom');
  await expect(edge.locator('.react-flow__edge-path')).not.toHaveAttribute('d', originalPath!);
  await checkSourceAnchor();
  await shortcut(page, 'Control+z');
  await expect(node).toHaveAttribute('data-x', before.x!); await expect(node).toHaveAttribute('data-y', before.y!);
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', originalPath!);
  await node.click();
  const corner = await node.locator('.react-flow__resize-control.handle.bottom.right').boundingBox();
  await page.mouse.move(corner!.x + corner!.width / 2, corner!.y + corner!.height / 2); await page.mouse.down();
  await page.mouse.move(corner!.x + corner!.width / 2 + 60, corner!.y + corner!.height / 2 + 40, { steps: 15 });
  // Verify the live draft before pointer-up, not just the final commit.
  await expect(node).not.toHaveAttribute('data-width', before.width!);
  await expect(edge.locator('.react-flow__edge-path')).not.toHaveAttribute('d', originalPath!);
  await checkSourceAnchor();
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.mouse.up();
  await expect(node).not.toHaveAttribute('data-width', before.width!);
  await expect(edge).toHaveAttribute('data-edge', edgeId!);
  await expect(edge.locator('.react-flow__edge-path')).not.toHaveAttribute('d', originalPath!);
  await shortcut(page, 'Control+z');
  await expect(node).toHaveAttribute('data-width', before.width!); await expect(node).toHaveAttribute('data-height', before.height!);
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', originalPath!);
  await shortcut(page, 'Control+y');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('resize-live-connector.png') });
});

test('connects handles and edits both arrowheads/routing without dangling references', async ({ page }) => {
  await page.goto('./'); await ready(page);
  const from = nodeModel(page, 'Tiếp nhận vật tư'), to = nodeModel(page, 'Trả nhà cung cấp');
  const source = await from.getAttribute('data-node'), target = await to.getAttribute('data-node');
  await from.hover(); await connectHandles(page, from.locator('.port-right'), to.locator('.port-left'));
  await expect(page.locator('[data-edge]')).toHaveCount(6);
  const edge = page.locator(`[data-edge][data-source="${source}"][data-target="${target}"]`);
  const edgeId = await edge.getAttribute('data-edge');
  await expect(edge).toHaveAttribute('data-source-handle', 'right'); await expect(edge).toHaveAttribute('data-target-handle', 'left');
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByLabel('Mũi tên đầu', { exact: true }).selectOption('arrow');
  await page.getByLabel('Mũi tên cuối', { exact: true }).selectOption('none');
  await page.getByLabel('Kiểu đường', { exact: true }).selectOption('straight');
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('marker-start', /start-/);
  await expect(edge.locator('.react-flow__edge-path')).not.toHaveAttribute('marker-end');
  const oldTarget = await edge.getAttribute('data-target');
  const destination = nodeModel(page, 'Hoàn tất');
  const destinationId = await destination.getAttribute('data-node');
  await connectHandles(page, edge.locator('..').locator('.react-flow__edgeupdater-target'), destination.locator('.port-right'));
  await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveAttribute('data-target', destinationId!);
  await expect(page.locator('[data-edge]')).toHaveCount(6);
  await shortcut(page, 'Control+z'); await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveAttribute('data-target', oldTarget!);
});

test('multi-select clipboard/cut/paste/duplicate and incident-edge deletion are atomic', async ({ page }) => {
  await blockSystemClipboard(page); await page.goto('./'); await ready(page);
  await nodeButton(page, 'Bắt đầu').click(); await nodeButton(page, 'Tiếp nhận vật tư').click({ modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await shortcut(page, 'Control+c'); await shortcut(page, 'Control+v');
  await expect(page.locator('[data-node]')).toHaveCount(8); await expect(page.locator('[data-edge]')).toHaveCount(6);
  await shortcut(page, 'Control+x');
  await expect(page.locator('[data-node]')).toHaveCount(6); await expect(page.locator('[data-edge]')).toHaveCount(5);
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(8);
  await shortcut(page, 'Control+y'); await expect(page.locator('[data-node]')).toHaveCount(6);
  await shortcut(page, 'Control+v'); await expect(page.locator('[data-node]')).toHaveCount(8);
  await shortcut(page, 'Control+d'); await expect(page.locator('[data-node]')).toHaveCount(10);
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(8);
  await shortcut(page, 'Escape'); await nodeButton(page, 'Đạt yêu cầu?').click(); await shortcut(page, 'Delete');
  await expect(page.locator('[data-node]')).toHaveCount(7); await expect(page.locator('[data-edge]')).toHaveCount(3);
  await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(8); await expect(page.locator('[data-edge]')).toHaveCount(6);
});

test('grouping/ungrouping, multi-fill and alignment work without serializing selection', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await nodeButton(page, 'Bắt đầu').click(); await nodeButton(page, 'Tiếp nhận vật tư').click({ modifiers: ['Shift'] });
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByRole('button', { name: 'Màu nền #f1eaff', exact: true }).click();
  await expect(nodeModel(page, 'Bắt đầu').locator('.node-border')).toHaveAttribute('fill', '#f1eaff');
  await expect(nodeModel(page, 'Tiếp nhận vật tư').locator('.node-border')).toHaveAttribute('fill', '#f1eaff');
  await page.getByRole('button', { name: 'Căn trên', exact: true }).click();
  await expect(nodeModel(page, 'Tiếp nhận vật tư')).toHaveAttribute('data-y', '55');
  await shortcut(page, 'Control+z'); await expect(nodeModel(page, 'Tiếp nhận vật tư')).toHaveAttribute('data-y', '169');
  await shortcut(page, 'Control+g'); await shortcut(page, 'Escape'); await nodeButton(page, 'Bắt đầu').click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await shortcut(page, 'Control+Shift+g'); await shortcut(page, 'Escape'); await nodeButton(page, 'Bắt đầu').click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await shortcut(page, 'Control+z'); await shortcut(page, 'Escape'); await nodeButton(page, 'Bắt đầu').click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
});

test('palette drag/drop, pan, zoom and marquee use transformed flow coordinates', async ({ page }) => {
  await page.goto('./'); await clearGraph(page);
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Bắt dính lưới 10px', exact: true }).uncheck();
  const host = page.locator('#canvasHost');
  await page.locator('.shape-tile[data-shape=rect]').dragTo(host, { targetPosition: { x: 160, y: 180 } });
  await expect(page.locator('[data-node]')).toHaveCount(1);
  const original = page.locator('[data-node]').first(), modelX = await original.getAttribute('data-x');
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  await host.focus(); await page.keyboard.down('Space');
  const box = await host.boundingBox();
  await page.mouse.move(box!.x + 50, box!.y + box!.height - 80); await page.mouse.down();
  await page.mouse.move(box!.x + 120, box!.y + box!.height - 120, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Space');
  await expect(page.locator('.react-flow__viewport')).not.toHaveAttribute('style', before!);
  await expect(original).toHaveAttribute('data-x', modelX!);
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
  await page.locator('.shape-tile[data-shape=round]').dragTo(host, { targetPosition: { x: 430, y: 280 } });
  await expect(page.locator('[data-node]')).toHaveCount(2);
  const placed = await page.locator('[data-node]').last().boundingBox(), bounds = await host.boundingBox();
  expect(Math.abs(placed!.x + placed!.width / 2 - (bounds!.x + 430))).toBeLessThan(2);
  expect(Math.abs(placed!.y + placed!.height / 2 - (bounds!.y + 280))).toBeLessThan(2);
  await shortcut(page, 'Control+a'); await shortcut(page, 'Delete'); await expect(page.locator('[data-node]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vừa màn hình', exact: true }).click();
  await expect(page.locator('#zoomLabel')).toHaveText('100%');
  await page.locator('.shape-tile[data-shape=rect]').dragTo(host, { targetPosition: { x: 150, y: 180 } });
  await page.locator('.shape-tile[data-shape=round]').dragTo(host, { targetPosition: { x: 420, y: 180 } });
  await shortcut(page, 'Escape');
  const all = await page.locator('[data-node]').all(), a = await all[0].boundingBox(), b = await all[1].boundingBox();
  await page.mouse.move(Math.min(a!.x, b!.x) - 15, Math.min(a!.y, b!.y) - 15); await page.mouse.down();
  await page.mouse.move(Math.max(a!.x + a!.width, b!.x + b!.width) + 15, Math.max(a!.y + a!.height, b!.y + b!.height) + 15, { steps: 15 }); await page.mouse.up();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
});

test('text fields suppress graph shortcuts, numeric fields validate, and diagnostics retain the live document', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await nodeButton(page, 'Tiếp nhận vật tư').click(); await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  const content = page.getByLabel('Nội dung', { exact: true });
  await content.focus(); await content.press('Control+a'); await content.press('Delete');
  await expect(page.locator('[data-node]')).toHaveCount(6);
  await content.fill('Vật tư đã chỉnh'); await content.press('Enter');
  const width = page.getByLabel('Rộng', { exact: true });
  await width.fill('220'); await width.press('Enter');
  await expect(nodeModel(page, 'Vật tư đã chỉnh')).toHaveAttribute('data-width', '220');
  await width.fill('1'); await width.press('Enter');
  await expect(nodeModel(page, 'Vật tư đã chỉnh')).toHaveAttribute('data-width', '220');
  await page.getByRole('link', { name: 'Kiểm tra nền tảng', exact: true }).click();
  await page.getByRole('link', { name: '← Về trình vẽ', exact: true }).click(); await ready(page);
  await expect(nodeModel(page, 'Vật tư đã chỉnh')).toHaveAttribute('data-width', '220');
  await shortcut(page, 'Control+z'); await expect(nodeModel(page, 'Vật tư đã chỉnh')).toHaveAttribute('data-width', '170');
  await shortcut(page, 'Control+z'); await expect(nodeButton(page, 'Tiếp nhận vật tư')).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  const download = page.waitForEvent('download'); await shortcut(page, 'Control+s');
  expect((await download).suggestedFilename()).toMatch(/\.diagramai$/);
});

test('font/stroke properties and arrow-key steps are undoable without stealing text-input keys', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await nodeButton(page, 'Tiếp nhận vật tư').click();
  const node = nodeModel(page, 'Tiếp nhận vật tư');
  await shortcut(page, 'ArrowRight'); await expect(node).toHaveAttribute('data-x', '301');
  await shortcut(page, 'Shift+ArrowRight'); await expect(node).toHaveAttribute('data-x', '311');
  await shortcut(page, 'Control+z'); await shortcut(page, 'Control+z'); await expect(node).toHaveAttribute('data-x', '300');
  const prompt = page.getByRole('textbox', { name: 'Yêu cầu cho trợ lý AI', exact: true });
  await prompt.fill('Không di chuyển hình'); await prompt.press('ArrowRight'); await prompt.press('Delete');
  await expect(node).toHaveAttribute('data-x', '300');
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByLabel('Cỡ chữ', { exact: true }).fill('18'); await page.getByLabel('Cỡ chữ', { exact: true }).press('Enter');
  await page.getByLabel('Font chữ', { exact: true }).selectOption('Arial');
  await page.getByLabel('Đậm chữ', { exact: true }).selectOption('700');
  await page.getByLabel('Độ dày viền', { exact: true }).fill('3'); await page.getByLabel('Độ dày viền', { exact: true }).press('Enter');
  await page.getByLabel('Kiểu viền', { exact: true }).selectOption('true');
  await expect(node.locator('text').first()).toHaveAttribute('font-size', '18');
  await expect(node.locator('text').first()).toHaveAttribute('font-family', 'Arial');
  await expect(node.locator('text').first()).toHaveAttribute('font-weight', '700');
  await expect(node.locator('.node-border')).toHaveAttribute('stroke-width', '3');
  await expect(node.locator('.node-border')).toHaveAttribute('stroke-dasharray', '6 4');
  await shortcut(page, 'Control+z');
  await expect(node.locator('.node-border')).not.toHaveAttribute('stroke-dasharray');
  await expect(node.locator('text').first()).toHaveAttribute('font-size', '18');
});

test('new connectors keep the preview curve and palette presets convert the selected edge with undo', async ({ page }, testInfo) => {
  await page.goto('./'); await ready(page);
  const from = nodeModel(page, 'Đạt yêu cầu?'), to = nodeModel(page, 'Nhập kho');
  const source = await from.getAttribute('data-node'), target = await to.getAttribute('data-node');
  await from.hover();
  const start = await from.locator('.port-left').boundingBox(), end = await to.locator('.port-left').boundingBox();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2); await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 20 });
  await expect(page.locator('.react-flow__connection-path')).toHaveAttribute('d', /C/);
  await page.mouse.up();
  const edge = page.locator(`[data-edge][data-source="${source}"][data-target="${target}"][data-source-handle="left"]`);
  await expect(edge).toHaveAttribute('data-kind', 'curved');
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', /C/);
  const id = await edge.getAttribute('data-edge');
  await page.locator('.shape-tile[data-shape=arrow]').click();
  await expect(edge).toHaveAttribute('data-edge', id!);
  await expect(edge).toHaveAttribute('data-kind', 'orthogonal');
  await expect(page.locator('[data-edge]')).toHaveCount(6);
  const points = (await edge.locator('.react-flow__edge-path').getAttribute('d'))!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  // Left port must initially exit left, not turn back inside the diamond.
  expect(points[2]).toBeLessThan(points[0]); expect(points[3]).toBe(points[1]);
  // Approach the target's left port from outside its left boundary.
  expect(points.at(-4)).toBeLessThan(points.at(-2)!); expect(points.at(-3)).toBe(points.at(-1));
  await page.screenshot({ path: testInfo.outputPath('diamond-port-routing.png') });
  await shortcut(page, 'Control+z'); await expect(edge).toHaveAttribute('data-kind', 'curved');
  await shortcut(page, 'Control+y'); await expect(edge).toHaveAttribute('data-kind', 'orthogonal');
  await page.locator('.shape-tile[data-shape=line]').click();
  await expect(edge).toHaveAttribute('data-kind', 'straight');
  await expect(edge.locator('.react-flow__edge-path')).not.toHaveAttribute('marker-end');
  await page.locator('.shape-tile[data-shape=bidirectional]').click();
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('marker-start', /start-/);
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('marker-end', /end-/);
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByLabel('Kiểu đường', { exact: true }).selectOption('curved');
  await expect(edge).toHaveAttribute('data-kind', 'curved');
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', /C/);
});

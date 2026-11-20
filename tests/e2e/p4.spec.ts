import { expect, test } from '@playwright/test';
import { ready, nodeModel } from '../helpers/drawing';
import { readFile } from 'node:fs/promises';

test('autosave survives reload and project creation/switching preserves graphs', async ({ page }, testInfo) => {
  await page.goto('./'); await ready(page);
  await nodeModel(page, 'Tiếp nhận vật tư').dblclick();
  await page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).fill('Vật tư tiếng Việt');
  await page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).press('Enter');
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await page.reload(); await ready(page);
  await expect(nodeModel(page, 'Vật tư tiếng Việt')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('p4-autosave-restored.png') });
  await page.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tên sơ đồ mới', exact: true }).fill('Sơ đồ hai');
  await page.getByRole('button', { name: 'Tạo sơ đồ', exact: true }).click();
  await expect(page.locator('[data-node]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
  const first = page.locator('.project-list li').filter({ hasText: '6 hình' });
  await first.getByRole('button', { name: /^Mở sơ đồ/ }).click();
  await expect(nodeModel(page, 'Vật tư tiếng Việt')).toBeVisible();
});

test('file backup is valid and exports SVG PNG PDF without changing graph', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  await page.goto('./'); await ready(page);
  const backup = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Lưu file', exact: true }).click();
  const file = await backup, json = JSON.parse(await readFile((await file.path())!, 'utf8'));
  await file.saveAs(testInfo.outputPath('portable.diagramai'));
  expect(json.format).toBe('diagramai'); expect(json.nodes.length).toBeGreaterThan(0);
  await expect(page.locator('.toast')).toContainText('tệp tải xuống');
  for (const kind of ['svg', 'png', 'pdf']) {
    await page.getByRole('button', { name: 'Xuất SVG', exact: true }).click();
    await page.getByRole('combobox', { name: 'Định dạng xuất', exact: true }).selectOption(kind);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải xuống file xuất', exact: true }).click();
    const output = await downloaded, bytes = await readFile((await output.path())!);
    await output.saveAs(testInfo.outputPath(`export.${kind}`));
    if (kind === 'svg') { expect(bytes.toString()).toContain('Tiếp nhận vật tư'); expect(bytes.toString()).not.toContain('react-flow'); }
    if (kind === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    if (kind === 'pdf') { expect(bytes.subarray(0, 4).toString()).toBe('%PDF'); expect(bytes.toString()).toContain('/FontFile2'); }
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  }
  await expect(page.locator('[data-node]')).toHaveCount(json.nodes.length);
});

test('app shell and committed diagram reopen offline', async ({ page, context }) => {
  await page.goto('./'); await ready(page);
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload(); await ready(page);
  await expect(nodeModel(page, 'Tiếp nhận vật tư')).toBeVisible();
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
});

test('invalid import preserves the live graph; valid ID collision imports a new local copy', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  await page.goto('./'); await ready(page);
  const backup = page.waitForEvent('download'); await page.getByRole('button', { name: 'Lưu file', exact: true }).click();
  const document = JSON.parse(await readFile((await (await backup).path())!, 'utf8'));
  const ids = await page.locator('[data-node]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-node')));
  const upload = async (text: string) => {
    const picker = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Mở file', exact: true }).click();
    await (await picker).setFiles({ name: 'test.diagramai', mimeType: 'application/json', buffer: Buffer.from(text) });
  };
  await upload(JSON.stringify({ ...document, nodes: [...document.nodes, document.nodes[0]] }));
  await expect(page.locator('.toast')).toContainText('không phải');
  expect(await page.locator('[data-node]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-node')))).toEqual(ids);
  await upload(JSON.stringify(document));
  await expect(page.locator('.project-name')).toContainText('(bản nhập)');
  await page.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
  await expect(page.locator('.project-list li')).toHaveCount(2);
});

test('stale tab cannot overwrite another writer and can preserve its edits as a new diagram', async ({ page, context }) => {
  await page.goto('./'); await ready(page); await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  const second = await context.newPage(); await second.goto('./'); await ready(second);
  await nodeModel(page, 'Tiếp nhận vật tư').dblclick();
  await page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).fill('Tab A');
  await page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).press('Enter');
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await nodeModel(second, 'Tiếp nhận vật tư').dblclick();
  await second.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).fill('Tab B');
  await second.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).press('Enter');
  await expect(second.locator('.storage-banner')).toContainText('cửa sổ khác');
  await expect(nodeModel(second, 'Tab B')).toBeVisible();
  await second.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
  await second.getByRole('button', { name: 'Lưu thành sơ đồ mới', exact: true }).click();
  await expect(second.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await page.reload(); await ready(page);
  await page.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
  await expect(page.locator('.project-list li')).toHaveCount(2);
});

test('storage unavailability never claims local save and keeps file backup usable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  await page.goto('./'); await ready(page);
  await expect(page.locator('.top-status')).toHaveText('Lỗi lưu trên máy');
  await expect(page.locator('.storage-banner')).toContainText('IndexedDB');
  const backup = page.waitForEvent('download'); await page.getByRole('button', { name: 'Lưu file', exact: true }).click();
  expect((await backup).suggestedFilename()).toMatch(/\.diagramai$/);
  await expect(page.locator('[data-node]')).toHaveCount(6);
  await expect(page.locator('.top-status')).toHaveText('Lỗi lưu trên máy');
});

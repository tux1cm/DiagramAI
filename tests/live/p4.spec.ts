import { expect, test } from '@playwright/test';
import { ready, nodeModel } from '../helpers/drawing';
import { readFile } from 'node:fs/promises';

test('Pages P4 persists Vietnamese edits, exports embedded-font PDF and reopens offline', async ({ page, context }, testInfo) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  await page.goto('./'); await ready(page);
  await expect(page.locator('.editor-app')).toHaveAttribute('data-phase', 'p5');
  await nodeModel(page, 'Tiếp nhận vật tư').dblclick();
  const input = page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true });
  await input.fill('Tiếng Việt đã lưu offline'); await input.press('Enter');
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await page.reload(); await ready(page); await expect(nodeModel(page, 'Tiếng Việt đã lưu offline')).toBeVisible();
  await page.getByRole('button', { name: 'Xuất SVG', exact: true }).click();
  await page.getByRole('combobox', { name: 'Định dạng xuất', exact: true }).selectOption('pdf');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Tải xuống file xuất', exact: true }).click();
  const pdf = await download; expect((await readFile((await pdf.path())!)).toString()).toContain('/FontFile2');
  await pdf.saveAs(testInfo.outputPath('pages-p4.pdf'));
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload(); await ready(page);
  await expect(nodeModel(page, 'Tiếng Việt đã lưu offline')).toBeVisible();
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await page.screenshot({ path: testInfo.outputPath('pages-p4-offline.png') });
});

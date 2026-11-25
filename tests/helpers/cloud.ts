import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { nodeModel, ready } from './drawing';

export const cloudButton = (page: Page) => page.getByTitle('Trạng thái đồng bộ', { exact: true });
export async function openCloud(page: Page) { if (!await page.getByRole('dialog').count()) await cloudButton(page).click(); }
export async function closeCloud(page: Page) {
  if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  if (await page.locator('.workspace-surface').count()) await page.getByRole('button', { name: 'Trở lại bản vẽ', exact: true }).click();
}
export async function editCloudNode(page: Page, before: string, after: string) {
  await closeCloud(page); await nodeModel(page, before).dblclick();
  const input = page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }); await input.fill(after); await input.press('Enter');
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
}
export async function syncNow(page: Page) {
  await openCloud(page); await page.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
  await expect(cloudButton(page)).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect(cloudButton(page)).toContainText('Đã đồng bộ', { timeout: 20000 });
}
export async function createCloudProject(page: Page, navigate = true) {
  if (navigate) await page.goto('./'); await ready(page);
  await page.getByTitle('Đổi tên sơ đồ', { exact: true }).click();
  const name = page.locator('.project-name input'); await name.fill(`P5 fixture ${randomUUID().slice(0, 8)}`); await name.press('Enter');
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await openCloud(page); await page.getByRole('checkbox', { name: /Tôi đồng ý tải nội dung/ }).check();
  await page.getByRole('button', { name: 'Bật đồng bộ cho dự án này', exact: true }).click();
  const key = page.getByRole('textbox', { name: 'Mã khôi phục dự án', exact: true }); await expect(key).toBeVisible({ timeout: 15000 });
  const recovery = await key.inputValue();
  await page.getByRole('button', { name: 'Tôi đã sao lưu mã khôi phục', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo mã liên kết', exact: true }).click();
  const code = (await page.getByLabel('Mã liên kết thiết bị', { exact: true }).textContent())!;
  return { recovery, code };
}
export async function joinCloudProject(page: Page, code: string) {
  await page.goto('./'); await ready(page); await openCloud(page);
  await page.getByRole('textbox', { name: 'Nhập mã liên kết', exact: true }).fill(code);
  await page.getByRole('button', { name: 'Liên kết dự án', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15000 }); await expect(page.locator('.project-name')).toContainText('P5 fixture ');
  await syncNow(page);
}

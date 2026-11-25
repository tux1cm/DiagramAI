import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { ready } from './drawing';

export async function openLibrary(page: Page) {
  if (await page.getByRole('dialog').count()) await closeLibrary(page);
  await page.getByTitle('Quản lý dự án', { exact: true }).click();
  await expect(page.locator('.workspace-surface')).toBeVisible();
}
export async function closeLibrary(page: Page) {
  if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  if (await page.locator('.workspace-surface').count()) {
    const back = page.getByRole('button', { name: 'Trở lại bản vẽ', exact: true }); if (await back.count()) await back.click();
  }
}
export async function renameDrawing(page: Page, title: string) {
  await closeLibrary(page); await page.getByTitle('Đổi tên sơ đồ', { exact: true }).click();
  const input = page.locator('.project-name input'); await input.fill(title); await input.press('Enter');
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
}
export async function updateLibrary(page: Page) {
  if (!await page.locator('.workspace-surface').count()) await openLibrary(page);
  const button = page.getByRole('button', { name: 'Cập nhật kho ngay', exact: true });
  await expect(button).toBeEnabled({ timeout: 20000 }); await button.click();
  await expect(page.getByTitle('Quản lý dự án', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect(button).toBeEnabled({ timeout: 20000 });
}
export async function createWorkspace(page: Page, navigate = true) {
  if (navigate) await page.goto('./'); await ready(page);
  const title = `P5 fixture workspace ${randomUUID().slice(0, 8)}`;
  await renameDrawing(page, title); await openLibrary(page);
  await page.getByRole('button', { name: 'Tạo kho riêng và đưa bản vẽ trên máy vào kho', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cập nhật kho ngay', exact: true })).toBeEnabled({ timeout: 20000 });
  await page.getByText('Kết nối thiết bị của tôi', { exact: true }).click();
  await page.getByRole('button', { name: 'Hiện link riêng của kho', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Link chia sẻ', exact: true });
  await expect(field).toBeVisible(); const link = await field.inputValue();
  await page.getByRole('button', { name: 'Ẩn link', exact: true }).click();
  return { title, link };
}
export async function connectWorkspace(page: Page, link: string, viaFragment = true) {
  const base = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1:4173/p5-test/' : page.url());
  if (viaFragment) {
    const target = new URL(link); base.hash = target.hash; await page.goto(base.href); await expect(page.locator('.editor-app')).toBeVisible();
    await expect.poll(() => page.url().includes('dai_workspace_v1_')).toBe(false);
    await openLibrary(page);
    await expect(page.getByRole('button', { name: 'Cập nhật kho ngay', exact: true })).toBeEnabled({ timeout: 20000 });
  } else {
    await openLibrary(page); await page.getByRole('textbox', { name: 'Link riêng vào kho', exact: true }).fill(link);
    await page.getByRole('button', { name: 'Mở kho bằng link riêng', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cập nhật kho ngay', exact: true })).toBeEnabled({ timeout: 20000 });
  }
}
export async function openWorkspaceDrawing(page: Page, title: string, project = 'Dự án đầu tiên') {
  // Selection is persisted asynchronously. Never infer a missing drawing from
  // count() immediately after a click: that raced the faster localhost CI DB.
  await openLibrary(page);
  await page.getByRole('button', { name: project, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Bản vẽ trong Project', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Mở bản vẽ ${title}`, exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: `Mở bản vẽ ${title}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await ready(page); await expect(page.locator('.project-name')).toContainText(title);
}

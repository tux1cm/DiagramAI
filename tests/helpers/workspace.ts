import { expect, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { SyncApiError, SyncClient, workspaceLink } from '@diagramai/sync-core';
import { setTimeout as delay } from 'node:timers/promises';
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
  await expect(page.getByTitle('Trạng thái đồng bộ', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect(button).toBeEnabled({ timeout: 20000 });
}
export async function createWorkspace(page: Page, navigate = true) {
  if (navigate) await page.goto('./'); await ready(page);
  const title = `P5 fixture workspace ${randomUUID().slice(0, 8)}`;
  await renameDrawing(page, title); await openLibrary(page);
  // Provision a disposable test fixture through the API, not through a public
  // per-device "create another workspace" button. The product opens one main link.
  const access = { id: randomUUID(), key: `dai_workspace_v1_${randomBytes(32).toString('base64url')}` };
  const apiBase = process.env.DIAGRAMAI_NATIVE_MANAGED_API ?? process.env.DIAGRAMAI_MANAGED_TEST_API ?? 'http://127.0.0.1:8787/';
  const api = new SyncClient(apiBase);
  try {
  try { await api.createWorkspace(access); }
  catch (error) {
    // Six disposable fixtures can cross the real 5/min cap on fast Linux CI.
    // Respect Retry-After once, with the SAME capability; never reset counters,
    // raise the server limit, retry DAILY_LIMIT, or retry production provisioning.
    if (!(error instanceof SyncApiError) || error.code !== 'RATE_LIMITED' || !['127.0.0.1', 'localhost'].includes(new URL(apiBase).hostname) || !error.retryAfterMs) throw error;
    await delay(error.retryAfterMs); await api.createWorkspace(access);
  }
  await api.workspaceFolder(access, { id: randomUUID(), title: 'Dự án đầu tiên' });
  const currentUrl = new URL(page.url());
  const link = workspaceLink(currentUrl.hostname === 'tauri.localhost' || currentUrl.protocol === 'tauri:' ? 'https://tux1cm.github.io/DiagramAI/' : `${currentUrl.origin}${currentUrl.pathname}`, access);
  await expect(page.getByRole('button', { name: 'Tạo kho riêng và đưa bản vẽ trên máy vào kho', exact: true })).toHaveCount(0);
  await connectWorkspace(page, link, false);
  await expect(page.getByRole('button', { name: 'Dự án đầu tiên', exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
  await page.getByRole('button', { name: 'Đưa bản đang mở vào dự án này', exact: true }).click();
  await updateLibrary(page);
  await expect(page.getByTitle('Trạng thái đồng bộ', { exact: true })).toContainText('Đã đồng bộ', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Cập nhật kho ngay', exact: true })).toBeEnabled({ timeout: 20000 });
  await openLibrary(page);
  await page.getByText('Link kho chính của tôi', { exact: true }).click();
  await page.getByRole('button', { name: 'Hiện link kho chính', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Link kho chính', exact: true });
  await expect(field).toBeVisible(); expect((await field.inputValue()) === link).toBe(true);
  await page.getByRole('button', { name: 'Ẩn link', exact: true }).click();
  return { title, link, access };
  } catch (error) { await api.deleteWorkspace(access).catch(() => {}); throw error; }
}
export async function connectWorkspace(page: Page, link: string, viaFragment = true) {
  const base = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1:4173/p5-test/' : page.url());
  if (viaFragment) {
    const target = new URL(link); base.hash = target.hash; await page.goto(base.href); await expect(page.locator('.editor-app')).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe('#/');
    await openLibrary(page);
    await expect(page.getByRole('button', { name: 'Cập nhật kho ngay', exact: true })).toBeEnabled({ timeout: 20000 });
  } else {
    await openLibrary(page); await page.getByRole('textbox', { name: 'Link kho chính để mở', exact: true }).fill(link);
    await page.getByRole('button', { name: 'Mở kho chính', exact: true }).click();
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

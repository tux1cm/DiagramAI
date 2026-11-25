import { expect, test } from '@playwright/test';
import { ready } from '../helpers/drawing';
import { openLibrary } from '../helpers/workspace';

test('public root offers only the main-link entry and never creates or reads an owner workspace without its capability', async ({ page }, testInfo) => {
  const workspaceRequests: string[] = [];
  page.on('request', (request) => { if (/\/v1\/workspaces(?:\/|$)/.test(new URL(request.url()).pathname)) workspaceRequests.push(request.method()); });
  await page.goto('./'); await ready(page); await openLibrary(page);
  await expect(page.getByRole('heading', { name: 'Mở kho chính', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Link kho chính để mở', exact: true })).toBeEmpty();
  await expect(page.getByRole('button', { name: /^Tạo kho/ })).toHaveCount(0);
  await expect(page.locator('.workspace-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đồng bộ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đồng bộ', exact: true })).toBeEnabled();
  expect(workspaceRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('main-link-entry.png') });
});

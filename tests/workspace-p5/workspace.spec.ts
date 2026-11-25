import { expect, test } from '@playwright/test';
import { createWorkspace, connectWorkspace, openLibrary, closeLibrary, updateLibrary, renameDrawing, openWorkspaceDrawing } from '../helpers/workspace';
import { editCloudNode, syncNow, openCloud } from '../helpers/cloud';
import { nodeModel, ready } from '../helpers/drawing';

test('one private workspace discovers projects and drawings both ways, preserves old local data and remembers the link', async ({ page, browser, baseURL }) => {
  const source = await createWorkspace(page), context = await browser.newContext({ baseURL }), target = await context.newPage();
  try {
    await target.goto('./'); await ready(target); await renameDrawing(target, 'Bản local trước khi mở kho');
    const urls: string[] = []; target.on('request', (request) => urls.push(request.url()));
    await connectWorkspace(target, source.link);
    await expect(target.getByRole('button', { name: 'Dự án đầu tiên', exact: true })).toBeVisible();
    await expect(target.getByRole('dialog')).toHaveCount(0);
    await openWorkspaceDrawing(target, source.title);
    await expect(target.locator('.project-name')).toContainText('Dự án đầu tiên');
    await expect(target.getByRole('button', { name: /Tạo mã liên kết/ })).toHaveCount(0);
    await openLibrary(page); await page.getByRole('textbox', { name: 'Tên dự án mới', exact: true }).fill('Dự án kiểm tra');
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dự án kiểm tra', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture bản vẽ mới');
    await page.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click();
    await expect(page.locator('.project-name')).toContainText('Dự án kiểm tra / P5 fixture bản vẽ mới');
    await updateLibrary(page); await updateLibrary(target);
    await openLibrary(target); await target.getByRole('button', { name: 'Dự án kiểm tra', exact: true }).click();
    await openWorkspaceDrawing(target, 'P5 fixture bản vẽ mới');
    await renameDrawing(target, 'P5 fixture sửa từ Web'); await updateLibrary(target); await closeLibrary(target);
    await updateLibrary(page); await closeLibrary(page); await expect(page.locator('.project-name')).toContainText('P5 fixture sửa từ Web');
    await target.reload(); await ready(target); await openLibrary(target);
    await expect(target.getByText('Kết nối thiết bị của tôi', { exact: true })).toBeVisible();
    await target.getByRole('button', { name: 'File / Bản vẽ chỉ trên máy / Checkpoint', exact: true }).click();
    await expect(target.locator('.project-list')).toContainText('Bản local trước khi mở kho');
    expect(urls.some((url) => url.includes('dai_workspace_v1_'))).toBe(false);
    expect(urls.some((url) => url.includes('pairing'))).toBe(false);
  } finally { await context.close(); }
});

test('workspace offline edits and new drawings survive reload, resume automatically, and conflicts preserve both branches', async ({ page, browser, baseURL }) => {
  const source = await createWorkspace(page), context = await browser.newContext({ baseURL }), target = await context.newPage();
  try {
    await target.goto('./'); await ready(target); await connectWorkspace(target, source.link); await openWorkspaceDrawing(target, source.title);
    await target.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => target.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true); await editCloudNode(target, 'Tiếp nhận vật tư', 'Nhánh Web offline');
    await target.reload(); await ready(target); await expect(nodeModel(target, 'Nhánh Web offline')).toBeVisible();
    await closeLibrary(page); await editCloudNode(page, 'Tiếp nhận vật tư', 'Nhánh Desktop cloud'); await syncNow(page);
    await context.setOffline(false); await openCloud(target); await target.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
    await expect(target.getByRole('heading', { name: 'Đã giữ cả bản local và bản cloud', exact: true })).toBeVisible();
    await target.getByRole('button', { name: 'Dùng bản cloud, giữ bản local riêng', exact: true }).click();
    await expect(target.getByRole('dialog')).toHaveCount(0); await expect(nodeModel(target, 'Nhánh Desktop cloud')).toBeVisible();
    await openLibrary(target); await target.getByRole('button', { name: 'File / Bản vẽ chỉ trên máy / Checkpoint', exact: true }).click();
    await expect(target.locator('.project-list')).toContainText('(xung đột local)');
    await closeLibrary(target); await openLibrary(target); await target.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click(); await context.setOffline(true);
    await target.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture tạo offline');
    await target.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click();
    await expect(target.locator('.project-name')).toContainText('P5 fixture tạo offline');
    await target.reload(); await ready(target); await context.setOffline(false); await updateLibrary(target);
    await updateLibrary(page); await page.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click(); await expect(page.getByRole('button', { name: 'Mở bản vẽ P5 fixture tạo offline', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

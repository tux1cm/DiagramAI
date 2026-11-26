import { test, expect } from '@playwright/test';
import { SyncClient, type WorkspaceAccess } from '@diagramai/sync-core';
import { editCloudNode, syncNow, closeCloud } from '../helpers/cloud';
import { createWorkspace, connectWorkspace, openWorkspaceDrawing, openLibrary, updateLibrary, closeLibrary } from '../helpers/workspace';
import { nodeModel, ready } from '../helpers/drawing';

test('private workspace catalog and drawings via Web CSP/CORS → managed Neon Function → second Web and back', async ({ page, browser, baseURL }, testInfo) => {
  const api = process.env.DIAGRAMAI_MANAGED_TEST_API!;
  const context = await browser.newContext({ baseURL }), target = await context.newPage();
  const shareContext = await browser.newContext({ baseURL }), recipient = await shareContext.newPage();
  let access: WorkspaceAccess | undefined;
  page.on('request', (request) => {
    if (request.url() === `${api}v1/workspaces` && request.method() === 'POST') access = request.postDataJSON();
  });
  try {
    const created = await createWorkspace(page);
    access = created.access;
    await target.goto('./'); await ready(target); await connectWorkspace(target, created.link); await openWorkspaceDrawing(target, created.title);
    await editCloudNode(page, 'Tiếp nhận vật tư', 'Managed đi'); await syncNow(page);
    await syncNow(target); await closeCloud(target); await expect(nodeModel(target, 'Managed đi')).toBeVisible();
    await editCloudNode(target, 'Managed đi', 'Managed về'); await syncNow(target);
    await syncNow(page); await closeCloud(page); await expect(nodeModel(page, 'Managed về')).toBeVisible();
    await openLibrary(target); await target.getByRole('textbox', { name: 'Tên dự án mới', exact: true }).fill('Dự án managed');
    await target.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await expect(target.getByRole('heading', { name: 'Dự án managed', exact: true })).toBeVisible();
    await target.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture managed mới');
    await target.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click();
    await expect(target.locator('.project-name')).toContainText('Dự án managed / P5 fixture managed mới');
    await updateLibrary(target); await updateLibrary(page); await page.getByRole('button', { name: 'Dự án managed', exact: true }).click();
    await openWorkspaceDrawing(page, 'P5 fixture managed mới', 'Dự án managed'); await closeLibrary(page);
    await openLibrary(page); await page.getByRole('button', { name: 'Chia sẻ Project Dự án đầu tiên', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Link chia sẻ', exact: true }); await expect(field).toBeVisible(); const link = await field.inputValue(); await page.getByRole('button', { name: 'Ẩn link', exact: true }).click();
    expect(new URL(link).hash).toMatch(/^#\/s\/[A-Za-z0-9_-]{22}$/);
    await recipient.goto(link); await expect(recipient.getByRole('button', { name: `Mở bản vẽ ${created.title}`, exact: true })).toBeVisible({ timeout: 20000 });
    await expect(recipient.getByText('Dự án managed', { exact: true })).toHaveCount(0);
    await recipient.getByRole('button', { name: `Mở bản vẽ ${created.title}`, exact: true }).click(); await ready(recipient);
    await editCloudNode(recipient, 'Managed về', 'Scoped production edit'); await syncNow(recipient);
    await openWorkspaceDrawing(page, created.title); await syncNow(page); await closeCloud(page); await expect(nodeModel(page, 'Scoped production edit')).toBeVisible();
    await openLibrary(page); await page.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
    await page.getByRole('button', { name: `Xóa bản vẽ ${created.title}`, exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Xác nhận xóa' });
    await expect(confirmation).toContainText('Sẽ xóa 1 bản vẽ');
    await expect(confirmation.getByRole('button', { name: 'Xác nhận xóa', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('drawing-delete-confirmation.png') });
    await confirmation.getByRole('checkbox').check(); await confirmation.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    await expect(confirmation).toHaveCount(0); await updateLibrary(target);
    await target.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
    await expect(target.getByRole('button', { name: `Mở bản vẽ ${created.title}`, exact: true })).toHaveCount(0);
    await page.locator('.workspace-surface').getByRole('button', { name: 'Kho', exact: true }).click();
    await page.getByRole('button', { name: 'Xóa Project Dự án managed', exact: true }).click();
    await expect(confirmation).toContainText('Sẽ xóa 1 bản vẽ');
    await confirmation.getByRole('checkbox').check(); await confirmation.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    await expect(confirmation).toHaveCount(0); await updateLibrary(target);
    await openLibrary(target); await expect(target.getByRole('button', { name: 'Dự án managed', exact: true })).toHaveCount(0);
    await target.getByRole('button', { name: 'File / Bản vẽ chỉ trên máy / Checkpoint', exact: true }).click();
    await expect(target.locator('.project-list')).toContainText(created.title);
    await target.screenshot({ path: testInfo.outputPath('deleted-drawings-retained-local.png') });
  } finally {
    await context.close(); await shareContext.close();
    if (access) await new SyncClient(api).deleteWorkspace(access);
  }
});

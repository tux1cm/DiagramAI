import { expect, test, type Page } from '@playwright/test';
import { createWorkspace, openLibrary, openWorkspaceDrawing, closeLibrary, updateLibrary } from '../helpers/workspace';
import { editCloudNode, syncNow, closeCloud } from '../helpers/cloud';
import { ready, nodeModel } from '../helpers/drawing';
import { parseShortLink, SyncClient } from '@diagramai/sync-core';

async function getShare(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Link chia sẻ', exact: true }); await expect(field).toBeVisible({ timeout: 20000 });
  const link = await field.inputValue(); await page.getByRole('button', { name: 'Ẩn link', exact: true }).click(); return link;
}
test('Kho uses main-area cards; Project and drawing links allow editing but never expose siblings outside their scope', async ({ page, browser, baseURL }, testInfo) => {
  const source = await createWorkspace(page);
  await expect(page.locator('.workspace-surface')).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture sibling'); await page.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click(); await ready(page);
  await updateLibrary(page); await closeLibrary(page);
  await openLibrary(page);
  await page.getByRole('textbox', { name: 'Tên dự án mới', exact: true }).fill('Project khác'); await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project khác', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture outside'); await page.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click(); await ready(page);
  await openLibrary(page); await updateLibrary(page);
  const projectLink = await getShare(page, 'Chia sẻ Project Dự án đầu tiên');
  await page.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
  const drawingLink = await getShare(page, `Chia sẻ bản vẽ ${source.title}`);
  expect(new URL(projectLink).hash.startsWith('#/s/')).toBe(true); expect(new URL(projectLink).search).toBe('');
  const context = await browser.newContext({ baseURL }), recipient = await context.newPage();
  const second = await browser.newContext({ baseURL }), one = await second.newPage();
  try {
    const urls: string[] = []; recipient.on('request', (request) => urls.push(request.url()));
    await recipient.goto(projectLink);
    await expect(recipient.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true })).toBeVisible({ timeout: 20000 });
    await expect(recipient.getByRole('button', { name: 'Mở bản vẽ P5 fixture sibling', exact: true })).toBeVisible();
    await expect(recipient.getByText('Project khác', { exact: true })).toHaveCount(0); await expect(recipient.getByText('P5 fixture outside', { exact: true })).toHaveCount(0);
    await expect(recipient.getByRole('button', { name: /^Xóa (Project|bản vẽ)/ })).toHaveCount(0);
    await recipient.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true }).click(); await ready(recipient);
    await editCloudNode(recipient, 'Tiếp nhận vật tư', 'Sửa từ link Project'); await syncNow(recipient);
    await openWorkspaceDrawing(page, source.title); await syncNow(page); await closeCloud(page); await expect(nodeModel(page, 'Sửa từ link Project')).toBeVisible();
    const legacy = new URL(drawingLink), drawingAccess = (await new SyncClient(process.env.DIAGRAMAI_MANAGED_TEST_API ?? 'http://127.0.0.1:8787/').resolveShortLink(parseShortLink(drawingLink)!)).access; legacy.hash = `/share/${drawingAccess.id}/${drawingAccess.key}`;
    await one.goto(legacy.href); await ready(one); await expect(nodeModel(one, 'Sửa từ link Project')).toBeVisible();
    await editCloudNode(one, 'Sửa từ link Project', 'Sửa từ link bản vẽ'); await syncNow(one); await closeCloud(one);
    await openLibrary(one);
    await expect(one.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true })).toBeVisible();
    await expect(one.getByText('P5 fixture sibling', { exact: true })).toHaveCount(0); await expect(one.getByText('Project khác', { exact: true })).toHaveCount(0);
    expect(urls.some((url) => url.includes('dai_share_v1_'))).toBe(false);
    expect(urls.some((url) => url.includes(new URL(projectLink).hash.slice(4)))).toBe(false);
    await one.screenshot({ path: testInfo.outputPath('drawing-scope-cards.png') });
    await closeLibrary(page); await syncNow(page); await closeCloud(page); await expect(nodeModel(page, 'Sửa từ link bản vẽ')).toBeVisible();
    await one.evaluate(async () => { await navigator.serviceWorker.ready; }); await expect.poll(() => one.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await one.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true }).click(); await ready(one);
    await second.setOffline(true); await editCloudNode(one, 'Sửa từ link bản vẽ', 'Link offline còn nguyên'); await one.reload(); await ready(one);
    await expect(nodeModel(one, 'Link offline còn nguyên')).toBeVisible(); await second.setOffline(false); await syncNow(one);
    await syncNow(page); await closeCloud(page); await expect(nodeModel(page, 'Link offline còn nguyên')).toBeVisible();
    await openLibrary(one); await one.getByRole('button', { name: 'Về kho của tôi', exact: true }).click();
    await expect(one.getByRole('heading', { name: 'Mở kho chính', exact: true })).toBeVisible();
    await expect(one.getByRole('textbox', { name: 'Link kho chính để mở', exact: true })).toBeEmpty();
    await expect(one.getByRole('button', { name: 'Project khác', exact: true })).toHaveCount(0);
    await expect(one.getByRole('button', { name: 'Tạo kho riêng và đưa bản vẽ trên máy vào kho', exact: true })).toHaveCount(0);
    await openLibrary(page); await page.screenshot({ path: testInfo.outputPath('project-cards.png') });
  } finally { await context.close(); await second.close(); }
});

import { expect, test, type Page } from '@playwright/test';
import { createWorkspace, connectWorkspace, openLibrary, closeLibrary, openWorkspaceDrawing } from '../helpers/workspace';
import { ready } from '../helpers/drawing';

async function sync(page: Page) {
  const button = page.getByRole('button', { name: 'Đồng bộ', exact: true });
  await button.click(); await expect(button).toBeEnabled({ timeout: 20000 });
  await expect(page.getByTitle('Trạng thái đồng bộ', { exact: true })).toContainText('Đã đồng bộ');
}
async function create(page: Page, project: string, drawing: string) {
  await openLibrary(page);
  await page.getByRole('textbox', { name: 'Tên dự án mới', exact: true }).fill(project);
  await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill(drawing);
  await page.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click(); await ready(page);
}
test('manual sync exchanges newly created drawings both ways; editing, focus, reconnect and the old timer make no cloud requests', async ({ page, browser, baseURL }) => {
  const source = await createWorkspace(page), context = await browser.newContext({ baseURL }), target = await context.newPage();
  try {
    await target.goto('./'); await ready(target); await connectWorkspace(target, source.link);
    await sync(page); await sync(target);
    const requests: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/v1/')) requests.push(request.url()); });
    await create(page, 'Manual Web Project', 'P5 fixture created on Web');
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
    // Deliberately cross the removed 15s timer: this is an assertion about silence.
    await page.waitForTimeout(16000);
    expect(requests).toEqual([]);
    await openLibrary(target); await expect(target.getByRole('button', { name: 'Manual Web Project', exact: true })).toHaveCount(0);
    await sync(page); await sync(target);
    await openWorkspaceDrawing(target, 'P5 fixture created on Web', 'Manual Web Project');
    await create(target, 'Manual Desktop Project', 'P5 fixture created on Desktop');
    await sync(target); await sync(page);
    await openWorkspaceDrawing(page, 'P5 fixture created on Desktop', 'Manual Desktop Project');
    await expect(page.locator('.project-name')).toContainText('Manual Desktop Project / P5 fixture created on Desktop');
    // A locally saved edit warns on Web close rather than pretending async unload is durable.
    await page.getByTitle('Đổi tên sơ đồ', { exact: true }).click();
    await page.locator('.project-name input').fill('Unsent Web edit'); await page.locator('.project-name input').press('Enter');
    await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
    await expect(page.getByTitle('Trạng thái đồng bộ', { exact: true })).toContainText('Chờ đồng bộ');
    let warned = false;
    page.once('dialog', async (dialog) => { warned = dialog.type() === 'beforeunload'; await dialog.dismiss(); });
    await page.reload({ timeout: 5000 }).catch(() => {});
    expect(warned).toBe(true);
    await closeLibrary(page);
  } finally { await context.close(); }
});

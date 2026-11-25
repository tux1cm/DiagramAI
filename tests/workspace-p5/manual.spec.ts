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

test('two identically named Projects in different workspaces are distinct; explicit switch keeps old local drawings and can restore the old workspace', async ({ page, browser, baseURL }) => {
  const web = await createWorkspace(page), context = await browser.newContext({ baseURL }), desk = await context.newPage();
  try {
    const previous = await createWorkspace(desk);
    const oldId = await desk.getByLabel('Mã kho đang mở', { exact: true }).textContent();
    const webId = await page.getByLabel('Mã kho đang mở', { exact: true }).textContent();
    expect(oldId).not.toBe(webId);
    // Both catalogs initially use the same default Project name; names are not identity.
    await desk.getByRole('button', { name: 'Dự án đầu tiên', exact: true }).click();
    await desk.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture old Desktop pending');
    await desk.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click(); await ready(desk);
    await connectWorkspace(desk, web.link);
    await expect(desk.getByText(/Bạn vừa mở link kho chính khác/)).toBeVisible();
    await expect(desk.getByLabel('Mã kho đang mở', { exact: true })).toHaveText(oldId!);
    await expect(desk.getByRole('textbox', { name: 'Link kho chính khác', exact: true })).toBeEmpty();
    expect(desk.url().includes('dai_workspace_v1_')).toBe(false);
    const switchButton = desk.getByRole('button', { name: 'Dùng link kho chính này', exact: true });
    await expect(switchButton).toBeDisabled();
    await desk.getByRole('checkbox', { name: /Tôi xác nhận đổi kho/ }).check(); await switchButton.click();
    await expect(desk.getByLabel('Mã kho đang mở', { exact: true })).toHaveText(webId!);
    await openWorkspaceDrawing(desk, web.title);
    await desk.reload(); await ready(desk); await openLibrary(desk);
    await expect(desk.getByLabel('Mã kho đang mở', { exact: true })).toHaveText(webId!);
    await openLibrary(desk); await desk.getByRole('button', { name: 'File / Bản vẽ chỉ trên máy / Checkpoint', exact: true }).click();
    await expect(desk.locator('.project-list')).toContainText(previous.title);
    await expect(desk.locator('.project-list')).toContainText('P5 fixture old Desktop pending');
    await closeLibrary(desk); await openLibrary(desk);
    await desk.getByText('Link kho chính của tôi', { exact: true }).click();
    await desk.getByRole('checkbox', { name: /Tôi xác nhận đổi kho/ }).check();
    await desk.getByRole('button', { name: `Mở lại kho ${oldId}`, exact: true }).click();
    await expect(desk.getByLabel('Mã kho đang mở', { exact: true })).toHaveText(oldId!);
    await openWorkspaceDrawing(desk, 'P5 fixture old Desktop pending');
  } finally { await context.close(); }
});

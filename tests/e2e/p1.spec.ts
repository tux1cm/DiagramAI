import { expect, test } from '@playwright/test';

test('palette filtering and panel collapse use React state', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Tìm hình khối', exact: true }).fill('hình thoi');
  await expect(page.locator('.shape-tile')).toHaveCount(1);
  await expect(page.locator('[data-shape=diamond]')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tìm hình khối', exact: true }).fill('');
  await expect(page.locator('.shape-tile')).toHaveCount(21);
  const original = await page.locator('#canvasHost').boundingBox();
  await page.getByRole('button', { name: 'Hình khối', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Thư viện hình khối', exact: true })).toBeHidden();
  const expanded = await page.locator('#canvasHost').boundingBox();
  expect(expanded!.width).toBeGreaterThan(original!.width);
  await page.getByRole('button', { name: 'Hình khối', exact: true }).click();
  await expect(page.locator('.shape-tile')).toHaveCount(21);
});

test('properties apply color only to the selected fixture and persist after autosave', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thuộc tính', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hình Tiếp nhận vật tư', exact: true }).click();
  await page.getByRole('button', { name: 'Màu nền #e3f9ef', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hình Tiếp nhận vật tư', exact: true }).locator('.node-border')).toHaveAttribute('fill', '#e3f9ef');
  await expect(page.getByRole('button', { name: 'Hình Bắt đầu', exact: true }).locator('.node-border')).toHaveAttribute('fill', '#e9f0ff');
  await expect(page.locator('.top-status')).toHaveText('Chưa lưu · Có thay đổi');
  await page.getByRole('button', { name: 'Đường nối Không', exact: true }).click();
  await expect(page.getByLabel('Nhãn đường nối', { exact: true })).toHaveValue('Không');
  await expect(page.getByLabel('Nhãn đường nối', { exact: true })).toBeEditable();
  await page.getByLabel('Nhãn đường nối', { exact: true }).fill('Chưa đạt');
  await page.getByLabel('Nhãn đường nối', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Đường nối Chưa đạt', exact: true })).toBeVisible();
  await expect(page.locator('.top-status')).toHaveText('Đã lưu trên máy');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hình Tiếp nhận vật tư', exact: true }).locator('.node-border')).toHaveAttribute('fill', '#e3f9ef');
});

test('drawing works with local project management while AI stays deferred', async ({ page, baseURL }) => {
  const external: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on('request', (request) => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
  await page.goto('./');
  await page.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('IndexedDB');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sơ đồ', exact: true })).toBeFocused();
  await page.locator('.shape-tile[data-shape=rect]').click();
  await expect(page.locator('[data-node]')).toHaveCount(7);
  await page.getByRole('toolbar').getByRole('button', { name: 'Hoàn tác (Ctrl+Z)', exact: true }).click();
  await expect(page.locator('[data-node]')).toHaveCount(6);
  await page.getByRole('textbox', { name: 'Yêu cầu cho trợ lý AI', exact: true }).fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(page.locator('.chatbox')).toContainText('AI chưa được kết nối (P6)');
  await expect(page.locator('.chatbox img')).toHaveCount(0);
  await expect(page.locator('[data-node]')).toHaveCount(6);
  expect(external).toEqual([]);
});

test('zoom, tab keyboard navigation and project name are in-memory UI controls', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true');
  const initial = await page.locator('#zoomLabel').innerText();
  await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
  await expect(page.locator('#zoomLabel')).not.toHaveText(initial);
  await page.getByRole('button', { name: 'Vừa màn hình', exact: true }).click();
  await expect(page.locator('#zoomLabel')).toHaveText(initial);
  await page.getByRole('tab', { name: 'Trợ lý AI', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Thuộc tính', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Thuộc tính', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('.project-name').click();
  await page.getByRole('textbox', { name: 'Tên dự án mẫu', exact: true }).fill('Sơ đồ thử UI');
  await page.keyboard.press('Enter');
  await expect(page.locator('.stage-title')).toHaveText('Sơ đồ thử UI');
  await page.locator('.project-name').click();
  await page.getByRole('textbox', { name: 'Tên dự án mẫu', exact: true }).fill('Không áp dụng');
  await page.keyboard.press('Escape');
  await expect(page.locator('.stage-title')).toHaveText('Sơ đồ thử UI');
});

test('narrow viewport uses the original overlay sidebar without a new layout', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 768 });
  await page.goto('./');
  await expect(page.locator('.inspector')).toBeHidden();
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.inspector')).toHaveCSS('position', 'absolute');
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thuộc tính', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  await expect(page.locator('.inspector')).toBeHidden();
});

test('modal traps focus and P2 engine tools are enabled', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('toolbar', { name: 'Công cụ canvas', exact: true }).getByRole('button', { name: 'Di chuyển canvas (Space)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Hướng dẫn và trạng thái P5', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Kiểm tra nền tảng', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Đóng', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('link', { name: 'Kiểm tra nền tảng', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { nodeModel, ready } from '../helpers/drawing';
import { cloudButton, openCloud, closeCloud, editCloudNode as edit, syncNow as sync, createCloudProject as create, joinCloudProject as join } from '../helpers/cloud';

test('P4 durable local → P5 two-way sync, offline restart pending outbox → reconnect', async ({ page, browser, baseURL }, testInfo) => {
  const source = await create(page), context = await browser.newContext({ baseURL }), target = await context.newPage();
  try {
    await join(target, source.code);
    await edit(page, 'Tiếp nhận vật tư', 'Desk sửa trước'); await sync(page);
    await sync(target); await closeCloud(target); await expect(nodeModel(target, 'Desk sửa trước')).toBeVisible();
    await edit(target, 'Desk sửa trước', 'Web sửa tiếp'); await sync(target);
    await sync(page); await closeCloud(page); await expect(nodeModel(page, 'Web sửa tiếp')).toBeVisible();
    await target.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => target.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await closeCloud(target); await context.setOffline(true);
    await edit(target, 'Web sửa tiếp', 'Offline còn nguyên sau restart');
    await target.reload(); await ready(target); await expect(nodeModel(target, 'Offline còn nguyên sau restart')).toBeVisible();
    await context.setOffline(false); await sync(target);
    await sync(page); await closeCloud(page); await expect(nodeModel(page, 'Offline còn nguyên sau restart')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('p5-two-way.png') });
  } finally { await context.close(); }
});

test('divergent local/cloud branches are both durable and conflict resolution does not erase the local branch', async ({ page, browser, baseURL }) => {
  const source = await create(page), context = await browser.newContext({ baseURL }), target = await context.newPage();
  try {
    await join(target, source.code); await closeCloud(target); await context.setOffline(true);
    await edit(target, 'Tiếp nhận vật tư', 'Nhánh B offline');
    await edit(page, 'Tiếp nhận vật tư', 'Nhánh A cloud'); await sync(page);
    await context.setOffline(false); await openCloud(target); await target.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
    await expect(target.getByRole('heading', { name: 'Đã giữ cả bản local và bản cloud', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(nodeModel(target, 'Nhánh B offline')).toBeVisible();
    await target.getByRole('button', { name: 'Dùng bản cloud, giữ bản local riêng', exact: true }).click();
    await expect(target.getByRole('dialog')).toHaveCount(0); await expect(nodeModel(target, 'Nhánh A cloud')).toBeVisible();
    await target.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
    await target.locator('.project-list li').filter({ hasText: '(xung đột local)' }).first().getByRole('button', { name: /^Mở sơ đồ/ }).click();
    await expect(nodeModel(target, 'Nhánh B offline')).toBeVisible(); await expect(cloudButton(target)).toContainText('Chưa bật');
  } finally { await context.close(); }
});

test('pairing is one-time, owner revokes a linked device, and recovery on a new browser needs no login', async ({ page, browser, baseURL }) => {
  const source = await create(page), context = await browser.newContext({ baseURL }), target = await context.newPage();
  const recoveryContext = await browser.newContext({ baseURL }), recovered = await recoveryContext.newPage();
  try {
    await join(target, source.code);
    await page.getByRole('button', { name: 'Xem thiết bị đã ghép', exact: true }).click();
    await page.locator('.project-list li').filter({ hasText: 'Chỉnh sửa' }).getByRole('button', { name: 'Thu hồi quyền…', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận thu hồi', exact: true }).click();
    await expect(page.locator('.project-list')).toContainText('Đã thu hồi');
    await target.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click(); await expect(cloudButton(target)).toContainText('Quyền không hợp lệ');
    await expect(target.locator('[data-node]')).toHaveCount(6);
    await recovered.goto('./'); await ready(recovered); await openCloud(recovered);
    await recovered.getByRole('textbox', { name: 'Nhập mã liên kết', exact: true }).fill(source.code);
    await recovered.getByRole('button', { name: 'Liên kết dự án', exact: true }).click();
    await expect(recovered.getByRole('alert')).toContainText('Mã liên kết không đúng');
    await recovered.getByRole('textbox', { name: 'Nhập mã khôi phục', exact: true }).fill(source.recovery);
    await recovered.getByRole('button', { name: 'Khôi phục quyền dự án', exact: true }).click();
    await expect(recovered.getByRole('dialog')).toHaveCount(0); await expect(recovered.locator('.project-name')).toContainText('P5 fixture ');
    await expect(recovered.locator('input[type=password]')).toHaveCount(0); await expect(recovered.locator('[data-node]')).toHaveCount(6);
  } finally { await context.close(); await recoveryContext.close(); }
});

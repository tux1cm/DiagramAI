import { expect, test } from '@playwright/test';

test('real Pages loads P1 React UI and calls Neon PostgreSQL with browser CORS', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.shape-tile')).toHaveCount(21);
  await expect(page.locator('[data-node]')).toHaveCount(6);
  await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: testInfo.outputPath('pages-p1.png') });
  await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
  await page.getByRole('button', { name: 'Hình mẫu Tiếp nhận vật tư', exact: true }).click();
  await page.getByRole('button', { name: 'Màu nền #e3f9ef', exact: true }).click();
  await expect(page.locator('[data-node=n2] .node-border')).toHaveAttribute('fill', '#e3f9ef');
  await expect(page.locator('.top-status')).toHaveText('Bản thử · Chưa lưu');
  await page.screenshot({ path: testInfo.outputPath('pages-properties.png') });
  await page.reload();
  await expect(page.locator('[data-node=n2] .node-border')).toHaveAttribute('fill', '#ffffff');
  await page.getByRole('link', { name: 'Kiểm tra nền tảng', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Kiểm tra API' })).toBeEnabled();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/v1/health'));
  await page.getByRole('button', { name: 'Kiểm tra API' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['access-control-allow-origin']).toBe('https://tux1cm.github.io');
  expect(await response.json()).toEqual({ status: 'ok', apiVersion: 'v1', database: 'ok' });
  await expect(page.getByRole('status')).toHaveText('API và PostgreSQL phản hồi OK', { timeout: 15000 });
  // Non-simple content-type forces a real browser OPTIONS preflight.
  const probe = await page.evaluate(async (url) => {
    const result = await fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    return { status: result.status, body: await result.json() };
  }, response.url());
  expect(probe).toEqual({ status: 200, body: { status: 'ok', apiVersion: 'v1', database: 'ok' } });
  await page.screenshot({ path: testInfo.outputPath('pages-neon-health.png') });
  expect(errors).toEqual([]);
});

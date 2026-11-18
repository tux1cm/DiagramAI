import { expect, test } from '@playwright/test';

test('real Pages loads reference and calls Neon PostgreSQL with browser CORS', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.frameLocator('iframe').locator('.shape-tile')).toHaveCount(21);
  await expect(page.frameLocator('iframe').locator('[data-node]')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('pages-reference.png') });
  await page.getByRole('link', { name: 'P0 · Tham chiếu / Kiểm tra nền tảng' }).click();
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

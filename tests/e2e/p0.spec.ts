import { expect, test } from '@playwright/test';

test('opens the P2 editor without an iframe or login', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  const faviconUrl = await page.locator('link[rel="icon"]').evaluate((element) => (element as HTMLLinkElement).href);
  expect(faviconUrl).toBe(new URL('favicon.svg', page.url()).href);
  const favicon = await page.request.get(faviconUrl);
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
  expect(await favicon.text()).toContain('viewBox="0 0 36 36"');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.brandtext')).toHaveText('DiagramAI');
  await expect(page.locator('.shape-tile')).toHaveCount(21);
  await expect(page.locator('[data-node]')).toHaveCount(6);
  await expect(page.locator('[data-edge]')).toHaveCount(5);
  await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.editor-app')).toHaveAttribute('data-phase', 'p5');
  await expect(page.getByRole('link', { name: 'Kiểm tra nền tảng', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('p2-shell.png') });
  expect(errors).toEqual([]);
});

test('hash navigation and refresh keep the React Flow spike working', async ({ page }) => {
  await page.goto('./#/spike');
  await expect(page.getByRole('heading', { name: 'DiagramAI · P0' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Kiểm tra API' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Chưa kiểm tra');
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByRole('link', { name: '← Về trình vẽ' }).click();
  await expect(page.locator('#canvasHost')).toBeVisible();
});

test('captures immutable mockup baseline', async ({ page }, testInfo) => {
  await page.goto('./reference/DiagramAI_Mockup.html');
  await expect(page.locator('[data-node]')).toHaveCount(6);
  await expect(page.locator('.shape-tile')).toHaveCount(21);
  // Baseline capture only, not a visual parity assertion for the P1 editor.
  await page.screenshot({ path: testInfo.outputPath('reference-baseline.png'), animations: 'disabled' });
});

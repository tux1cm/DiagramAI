import { expect, test } from '@playwright/test';

test('opens the reference without login and loads all 21 palette entries', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  const reference = page.frameLocator('iframe');
  await expect(reference.locator('.brandtext')).toHaveText('DiagramAI');
  await expect(reference.locator('.shape-tile')).toHaveCount(21);
  await expect(reference.locator('[data-node]')).toHaveCount(6);
  await expect(reference.locator('[data-edge]')).toHaveCount(5);
  await expect(page.getByRole('link', { name: 'P0 · Tham chiếu / Kiểm tra nền tảng' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('p0-shell.png') });
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
  await page.getByRole('link', { name: '← Về giao diện tham chiếu' }).click();
  await expect(page.frameLocator('iframe').locator('#canvasHost')).toBeVisible();
});

test('captures immutable mockup baseline', async ({ page }, testInfo) => {
  await page.goto('./reference/DiagramAI_Mockup.html');
  await expect(page.locator('[data-node]')).toHaveCount(6);
  await expect(page.locator('.shape-tile')).toHaveCount(21);
  // Baseline capture only, not a visual parity assertion for the P1 editor.
  await page.screenshot({ path: testInfo.outputPath('reference-baseline.png'), animations: 'disabled' });
});

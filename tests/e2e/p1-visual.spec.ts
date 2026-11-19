import { expect, test } from '@playwright/test';
import { captureReferenceView, compareReferenceViews } from '../helpers/visual-reference';

test('matches approved reference geometry and unmodified visual regions', async ({ page, context }, testInfo) => {
  await page.goto('./');
  await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true');
  const current = await captureReferenceView(page, testInfo.outputPath('p1.png'));
  const reference = await context.newPage();
  await reference.goto(new URL('reference/DiagramAI_Mockup.html', page.url()).href);
  await expect(reference.locator('[data-node]')).toHaveCount(6);
  const approved = await captureReferenceView(reference, testInfo.outputPath('reference.png'));
  await compareReferenceViews(current, approved, testInfo);
  await reference.close();
});

import { expect, test } from '@playwright/test';
import { serializeDocument } from '@diagramai/diagram-core';
import { ready } from '../helpers/drawing';
import { arrowFork, assertArrowFork } from '../helpers/arrows';

test('short curved fork arrows enter the top centers straight and stay aligned when selected', async ({ page }, testInfo) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }); });
  await page.goto('./'); await ready(page);
  const document = arrowFork();
  const picker = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Mở file', exact: true }).click();
  await (await picker).setFiles({ name: 'arrow-fork.diagramai', mimeType: 'application/json', buffer: Buffer.from(serializeDocument(document)) });
  await expect(page.locator('[data-edge]')).toHaveCount(2); await ready(page);
  await assertArrowFork(page, document, testInfo.outputPath('aligned-arrow-fork.png'));
});

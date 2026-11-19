import { expect, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { writeFile } from 'node:fs/promises';

// Exclude only deliberate P1 wording and unsupported-control states, never canvas/palette.
export const changedRegions = [
  '.project-header', '.top-actions .chip', '.toolbar .tool-group .toolbtn:not(.active)',
  '.railbtn:nth-child(3)', '.railbtn:nth-child(4)', '.ai-tag', '.chatbox', '.model-tag',
  '.send', '.floating-hint', '.footer',
  '.palette-tip',
];
const structuralRegions = ['.topbar', '.rail', '.palette', '.toolbar', '#canvasHost', '.inspector', '.tabbar', '.footer'];
async function boxes(page: Page, selectors: string[]) {
  const result = [];
  for (const selector of selectors) {
    for (const locator of await page.locator(selector).all()) {
      const box = await locator.boundingBox();
      if (box) result.push({ selector, ...box });
    }
  }
  return result;
}
export async function captureReferenceView(page: Page, path: string) {
  return {
    png: await page.screenshot({ path, animations: 'disabled' }),
    geometry: await boxes(page, structuralRegions),
    excluded: await boxes(page, changedRegions),
    viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    brandTokens: await page.evaluate(() => {
      const logo = document.querySelector('.logo .ico');
      const name = document.querySelector('.brandtext > span');
      const palette = document.querySelector('.panetitle .ico');
      return {
        logoStroke: logo ? getComputedStyle(logo).strokeWidth : null,
        brandColor: name ? getComputedStyle(name).color : null,
        paletteIconColor: palette ? getComputedStyle(palette).color : null,
      };
    }),
  };
}
export async function compareReferenceViews(current: Awaited<ReturnType<typeof captureReferenceView>>, reference: Awaited<ReturnType<typeof captureReferenceView>>, testInfo: TestInfo, prefix = 'visual') {
  // A raw reference document under Tauri CSP can lose static style attributes.
  // Assert the actual React tokens against the approved design, never weaken CSP
  // or recolor the product to make that reference-runtime difference disappear.
  expect(current.brandTokens).toEqual({ logoStroke: '2.2px', brandColor: 'rgb(89, 107, 241)', paletteIconColor: 'rgb(161, 173, 191)' });
  expect(current.geometry.length).toBe(reference.geometry.length);
  for (let i = 0; i < current.geometry.length; i++) {
    expect(current.geometry[i].selector).toBe(reference.geometry[i].selector);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(current.geometry[i][key] - reference.geometry[i][key]), `${current.geometry[i].selector} ${key}`).toBeLessThanOrEqual(1);
    }
  }
  const actual = PNG.sync.read(current.png), approved = PNG.sync.read(reference.png);
  expect([actual.width, actual.height]).toEqual([approved.width, approved.height]);
  for (const box of [...current.excluded, ...reference.excluded]) {
    const left = Math.max(0, Math.floor(box.x) - 2), right = Math.min(actual.width, Math.ceil(box.x + box.width) + 2);
    const top = Math.max(0, Math.floor(box.y) - 2), bottom = Math.min(actual.height, Math.ceil(box.y + box.height) + 2);
    for (let y = top; y < bottom; y++) {
      actual.data.fill(255, (y * actual.width + left) * 4, (y * actual.width + right) * 4);
      approved.data.fill(255, (y * actual.width + left) * 4, (y * actual.width + right) * 4);
    }
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const changedPixels = pixelmatch(actual.data, approved.data, diff.data, actual.width, actual.height, { threshold: .1 });
  const ratio = changedPixels / (actual.width * actual.height);
  await writeFile(testInfo.outputPath(`${prefix}-diff.png`), PNG.sync.write(diff));
  const metrics = { viewport: current.viewport, changedPixels, ratio, tolerance: .003, changedRegions, geometry: current.geometry, actualBrandTokens: current.brandTokens, referenceBrandTokens: reference.brandTokens };
  await writeFile(testInfo.outputPath(`${prefix}-metrics.json`), JSON.stringify(metrics, null, 2));
  await testInfo.attach(`${prefix}-metrics`, { body: JSON.stringify(metrics), contentType: 'application/json' });
  console.log(`${testInfo.project.name || 'webview2'} ${prefix}: ${changedPixels} mismatched pixels, ${(ratio * 100).toFixed(4)}% after explicit status/control masks`);
  expect(ratio).toBeLessThan(.003);
}

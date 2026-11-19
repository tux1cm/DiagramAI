import { expect, type Locator, type Page } from '@playwright/test';

export const nodeButton = (page: Page, text: string) => page.getByRole('button', { name: `Hình ${text}`, exact: true });
export const nodeModel = (page: Page, text: string) => nodeButton(page, text).locator('[data-node]');
export async function ready(page: Page) { await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true'); }
export async function shortcut(page: Page, keys: string) { await page.locator('#canvasHost').focus(); await page.keyboard.press(keys); }
export async function clearGraph(page: Page) { await ready(page); await shortcut(page, 'Control+a'); await shortcut(page, 'Delete'); await expect(page.locator('[data-node]')).toHaveCount(0); await expect(page.locator('[data-edge]')).toHaveCount(0); }
export async function dragBy(page: Page, locator: Locator, dx: number, dy: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Missing draggable bounds');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 15 }); await page.mouse.up();
}
export async function connectHandles(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  if (!a || !b) throw new Error('Missing handle bounds');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 }); await page.mouse.up();
}
export async function blockSystemClipboard(page: Page) {
  // Exercise the internal fallback without reading or overwriting the user's OS clipboard.
  const deny = () => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard blocked for isolated test'); }, readText: async () => { throw new Error('Clipboard blocked for isolated test'); } } });
  await page.addInitScript(deny);
  await page.evaluate(deny);
}

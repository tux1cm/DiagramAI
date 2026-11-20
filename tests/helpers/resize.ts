import type { Locator, Page } from '@playwright/test';

export type Corner = 'top.left' | 'top.right' | 'bottom.left' | 'bottom.right';
export async function nodeGeometry(node: Locator) {
  return node.evaluate((element) => ({ x: Number(element.getAttribute('data-x')), y: Number(element.getAttribute('data-y')), width: Number(element.getAttribute('data-width')), height: Number(element.getAttribute('data-height')) }));
}
export async function cornerDrag(page: Page, node: Locator, corner: Corner, dx: number, dy: number, ctrl = true, hold = false) {
  const box = (await node.locator(`.react-flow__resize-control.handle.${corner}`).boundingBox())!;
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 15 });
  if (!hold) { await page.mouse.up(); if (ctrl) await page.keyboard.up('Control'); }
}

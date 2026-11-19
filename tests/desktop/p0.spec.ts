import { expect, test, type Browser } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { captureReferenceView, compareReferenceViews } from '../helpers/visual-reference';
import { blockSystemClipboard, connectHandles, dragBy, nodeButton, nodeModel, shortcut } from '../helpers/drawing';
import { insertionFixture, paletteToPoint, pathPoint } from '../helpers/insertion';

test('installed Tauri app renders WebView2, resizes, minimizes, restores and navigates', async ({ playwright }, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows/WebView2 only');
  const executable = process.env.DIAGRAMAI_TEST_EXE;
  if (!executable) throw new Error('Use npm run test:desktop to test an isolated installation.');
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate debug port');
  const port = address.port;
  await new Promise<void>((done) => server.close(() => done()));
  const profile = mkdtempSync(join(process.env.LOCALAPPDATA!, 'Temp', 'opencode', 'diagramai-webview-test-'));
  const app = spawn(executable, [], {
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    },
    stdio: 'ignore',
  });
  let launchError: Error | undefined;
  app.on('error', (error) => { launchError = error; });
  const window = (action: string, width?: number, height?: number) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts/desktop-window.ps1'), '-ProcessId', String(app.pid), '-Action', action];
    if (width && height) args.push('-Width', String(width), '-Height', String(height));
    return JSON.parse(execFileSync('powershell.exe', args, { encoding: 'utf8', timeout: 15000 }));
  };
  let browser: Browser | undefined;
  try {
    await expect.poll(async () => {
      if (launchError) throw launchError;
      if (app.exitCode !== null) throw new Error(`App exited: ${app.exitCode}`);
      return fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.ok).catch(() => false);
    }, { timeout: 45000, intervals: [100, 250, 500] }).toBe(true);
    browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('.shape-tile')).toHaveCount(21);
    await expect(page.locator('[data-node]')).toHaveCount(6);
    const editorUrl = page.url();
    for (const [width, height] of [[1366, 768], [1920, 1080], [1280, 720]]) {
      const size = window('resize', width, height);
      expect(size.width).toBe(width);
      expect(size.height).toBe(height);
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
      await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true');
      // The editor intentionally preserves pan/zoom on native window resize;
      // the mockup auto-fits. Compare the same explicit fitted camera at each size.
      await page.getByRole('button', { name: 'Vừa màn hình', exact: true }).click();
      const current = await captureReferenceView(page, testInfo.outputPath(`webview2-${width}x${height}.png`));
      await page.goto(new URL('reference/DiagramAI_Mockup.html', editorUrl).href);
      await expect(page.locator('[data-node]')).toHaveCount(6);
      const approved = await captureReferenceView(page, testInfo.outputPath(`reference-${width}x${height}.png`));
      await compareReferenceViews(current, approved, testInfo, `webview2-${width}x${height}`);
      await page.goto(editorUrl);
      await expect(page.locator('#canvasHost')).toHaveAttribute('data-ready', 'true');
    }
    expect(window('minimize').minimized).toBe(true);
    expect(window('restore').minimized).toBe(false);
    await blockSystemClipboard(page);
    const editable = nodeModel(page, 'Tiếp nhận vật tư'), nodeId = await editable.getAttribute('data-node');
    const liveNode = page.locator(`[data-node="${nodeId}"]`);
    await editable.dblclick();
    await page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).fill('Vật tư P2');
    await page.getByRole('textbox', { name: 'Sửa chữ trong hình', exact: true }).press('Enter');
    await expect(nodeButton(page, 'Vật tư P2')).toBeVisible();
    await shortcut(page, 'Control+z'); await expect(nodeButton(page, 'Tiếp nhận vật tư')).toBeVisible();
    const x = await liveNode.getAttribute('data-x'), width = await liveNode.getAttribute('data-width');
    await dragBy(page, liveNode, 50, 30); await expect(liveNode).not.toHaveAttribute('data-x', x!);
    await shortcut(page, 'Control+z'); await expect(liveNode).toHaveAttribute('data-x', x!);
    await liveNode.click(); await dragBy(page, liveNode.locator('.react-flow__resize-control.handle.bottom.right'), 40, 25);
    await expect(liveNode).not.toHaveAttribute('data-width', width!);
    await expect(page.locator('.toast')).toHaveCount(0);
    await shortcut(page, 'Control+z'); await expect(liveNode).toHaveAttribute('data-width', width!);
    await liveNode.hover(); await connectHandles(page, liveNode.locator('.port-right'), nodeModel(page, 'Trả nhà cung cấp').locator('.port-left'));
    await expect(page.locator('[data-edge]')).toHaveCount(6);
    const created = page.locator(`[data-edge][data-source="${nodeId}"][data-source-handle="right"]`);
    await expect(created).toHaveAttribute('data-kind', 'curved');
    await page.locator('.shape-tile[data-shape=arrow]').click();
    await expect(created).toHaveAttribute('data-kind', 'orthogonal');
    await shortcut(page, 'Control+z'); await expect(created).toHaveAttribute('data-kind', 'curved');
    await shortcut(page, 'Control+z'); await expect(page.locator('[data-edge]')).toHaveCount(5);
    await liveNode.click(); await shortcut(page, 'Control+c'); await shortcut(page, 'Control+v');
    await expect(page.locator('[data-node]')).toHaveCount(7);
    await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(6);
    await page.getByRole('button', { name: 'Đường nối Không', exact: true }).dblclick();
    await page.getByRole('textbox', { name: 'Sửa nhãn đường nối', exact: true }).fill('Chưa đạt');
    await page.getByRole('textbox', { name: 'Sửa nhãn đường nối', exact: true }).press('Enter');
    await expect(page.getByRole('button', { name: 'Đường nối Chưa đạt', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('webview2-p2-inline.png') });
    await shortcut(page, 'Control+z');
    await page.getByRole('tab', { name: 'Thuộc tính', exact: true }).click();
    await page.getByRole('button', { name: 'Hình Tiếp nhận vật tư', exact: true }).click();
    await page.getByRole('button', { name: 'Màu nền #e3f9ef', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hình Tiếp nhận vật tư', exact: true }).locator('.node-border')).toHaveAttribute('fill', '#e3f9ef');
    await page.screenshot({ path: testInfo.outputPath('webview2-properties.png') });
    await page.getByRole('link', { name: 'Kiểm tra nền tảng', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'DiagramAI · P0' })).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    const apiButton = page.getByRole('button', { name: 'Kiểm tra API' });
    if (await apiButton.isEnabled()) {
      await apiButton.click();
      await expect(page.getByRole('status')).toHaveText('API và PostgreSQL phản hồi OK', { timeout: 15000 });
      await page.screenshot({ path: testInfo.outputPath('webview2-api.png') });
      testInfo.annotations.push({ type: 'api', description: 'Live Neon health verified from WebView2 origin.' });
    } else {
      testInfo.annotations.push({ type: 'api', description: 'Not configured in this build; no live API assertion.' });
    }
    page.once('dialog', async (dialog) => { expect(dialog.type()).toBe('beforeunload'); await dialog.accept(); });
    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await page.getByRole('link', { name: '← Về trình vẽ' }).click();
    await expect(page.locator('.shape-tile')).toHaveCount(21);
    const { host, edge, edgeId } = await insertionFixture(page);
    const point = await pathPoint(edge.locator('.react-flow__edge-path'));
    await paletteToPoint(page, 'diamond', point, true);
    await expect(host).toHaveAttribute('data-insert-edge', edgeId);
    await page.screenshot({ path: testInfo.outputPath('webview2-p3-preview.png') });
    await page.mouse.up();
    await expect(page.locator('[data-node]')).toHaveCount(3); await expect(page.locator('[data-edge]')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('webview2-p3-insert.png') });
    await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(2);
    await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveCount(1);
    await shortcut(page, 'Control+y'); await expect(page.locator('[data-edge]')).toHaveCount(2);
    await shortcut(page, 'Control+z'); await expect(page.locator('[data-node]')).toHaveCount(2);
    await page.locator('.shape-tile[data-shape=diamond]').dragTo(host, { targetPosition: { x: 420, y: 320 } });
    const isolated = page.locator('[data-node][data-type=diamond]'), isolatedX = await isolated.getAttribute('data-x');
    const isolatedBox = (await isolated.boundingBox())!, destination = await pathPoint(page.locator(`[data-edge="${edgeId}"] .react-flow__edge-path`));
    await dragBy(page, isolated, destination.x - isolatedBox.x - isolatedBox.width / 2, destination.y - isolatedBox.y - isolatedBox.height / 2);
    await expect(page.locator('[data-edge]')).toHaveCount(2);
    await shortcut(page, 'Control+z'); await expect(isolated).toHaveAttribute('data-x', isolatedX!);
    await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    if (app.pid && app.exitCode === null) {
      try { window('close'); } finally { app.kill(); }
    }
  }
});

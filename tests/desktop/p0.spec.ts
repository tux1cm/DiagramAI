import { expect, test, type Browser } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('.shape-tile')).toHaveCount(21);
    await expect(frame.locator('[data-node]')).toHaveCount(6);
    for (const [width, height] of [[1366, 768], [1920, 1080], [1280, 720]]) {
      const size = window('resize', width, height);
      expect(size.width).toBe(width);
      expect(size.height).toBe(height);
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
      await expect(frame.locator('#canvasHost')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`webview2-${width}x${height}.png`) });
    }
    expect(window('minimize').minimized).toBe(true);
    expect(window('restore').minimized).toBe(false);
    await page.getByRole('link', { name: 'P0 · Tham chiếu / Kiểm tra nền tảng' }).click();
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
    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await page.getByRole('link', { name: '← Về giao diện tham chiếu' }).click();
    await expect(frame.locator('.shape-tile')).toHaveCount(21);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    if (app.pid && app.exitCode === null) {
      try { window('close'); } finally { app.kill(); }
    }
  }
});

import { expect, test, type Browser } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { newId } from '@diagramai/diagram-core';
import { prepareRecord } from '@diagramai/local-storage';
import { ready } from '../helpers/drawing';
import { arrowFork, assertArrowFork } from '../helpers/arrows';

test('installed production Desktop aligns curved fork arrows without changing local documents or contacting cloud', async ({ playwright }, testInfo) => {
  const executable = process.env.DIAGRAMAI_TEST_EXE;
  if (process.platform !== 'win32' || !executable) throw new Error('Use the Windows isolated installer harness with -Scope arrows.');
  const profile = mkdtempSync(join(process.env.LOCALAPPDATA!, 'Temp', 'opencode', 'diagramai-arrows-'));
  const server = createServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No debug port');
  const port = address.port; await new Promise<void>((resolve) => server.close(() => resolve()));
  const app = spawn(executable, [], { env: { ...process.env, DIAGRAMAI_TEST_DATA_DIR: join(profile, 'data'), WEBVIEW2_USER_DATA_FOLDER: join(profile, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` }, stdio: 'ignore' });
  let browser: Browser | undefined, launchError: Error | undefined;
  app.once('error', (error) => { launchError = error; });
  try {
    await expect.poll(async () => { if (launchError) throw launchError; if (app.exitCode !== null) throw new Error('App exited before readiness'); return fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.ok).catch(() => false); }, { timeout: 45000 }).toBe(true);
    browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0]; await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0]; await page.bringToFront(); await ready(page);
    const requests: string[] = [];
    page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/v1/')) requests.push(request.method()); });
    const document = arrowFork(), record = await prepareRecord({ document, expectedVersion: null, operationId: newId() });
    // Use the real validated native storage commands, only in this disposable profile.
    await page.evaluate(async ({ record, id }) => {
      const native = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: object) => Promise<unknown> } }).__TAURI_INTERNALS__;
      await native.invoke('local_save', { record, expectedVersion: null });
      await native.invoke('local_set_active', { documentId: id });
    }, { record, id: document.documentId });
    await page.reload(); await ready(page); await expect(page.locator('[data-edge]')).toHaveCount(2);
    await assertArrowFork(page, document, testInfo.outputPath('desktop-aligned-arrow-fork.png'));
    const saved = await page.evaluate(async (id) => (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: object) => Promise<{ payload: string }> } }).__TAURI_INTERNALS__.invoke('local_load', { documentId: id }), document.documentId);
    expect(JSON.parse(saved.payload)).toEqual(document); expect(requests).toEqual([]);
  } finally {
    await browser?.close();
    if (app.pid && app.exitCode === null) { app.kill(); await new Promise<void>((resolve) => { if (app.exitCode !== null) resolve(); else app.once('exit', () => resolve()); }); }
  }
});

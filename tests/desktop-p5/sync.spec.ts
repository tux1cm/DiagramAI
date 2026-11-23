import { expect, test, type Browser } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloudButton, createCloudProject, joinCloudProject, editCloudNode, syncNow, closeCloud, openCloud } from '../helpers/cloud';
import { nodeModel, ready } from '../helpers/drawing';
import { SyncClient } from '@diagramai/sync-core';

test('P5 installed Desktop SQLite/DPAPI ↔ Web/IndexedDB, restart pending outbox and preserve conflicts', async ({ playwright, browser, baseURL }, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows DPAPI/WebView2 integration');
  const executable = process.env.DIAGRAMAI_TEST_EXE; if (!executable) throw new Error('Run the isolated P5 installer harness.');
  const profile = mkdtempSync(join(process.env.LOCALAPPDATA!, 'Temp', 'opencode', 'diagramai-p5-'));
  const managed = process.env.DIAGRAMAI_NATIVE_MANAGED_API;
  const apiPattern = `${managed ?? 'http://127.0.0.1:8787/'}**`;
  let credential: { projectId: string; token: string } | undefined;
  let app: ReturnType<typeof spawn> | undefined, nativeBrowser: Browser | undefined, launches = 0;
  const launch = async () => {
    const server = createServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No debug port');
    const port = address.port; await new Promise<void>((resolve) => server.close(() => resolve()));
    app = spawn(executable, [], { env: { ...process.env, DIAGRAMAI_TEST_DATA_DIR: join(profile, 'data'), WEBVIEW2_USER_DATA_FOLDER: join(profile, `webview-${launches++}`), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` }, stdio: 'ignore' });
    let launchError: Error | undefined; app.once('error', (error) => { launchError = error; });
    await expect.poll(async () => { if (launchError) throw launchError; return fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.ok).catch(() => false); }, { timeout: 45000 }).toBe(true);
    nativeBrowser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = nativeBrowser.contexts()[0]; await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0];
    if (managed) page.on('response', async (response) => {
      if (response.url() === `${managed}v1/projects` && response.request().method() === 'POST' && response.ok()) credential = (await response.json()).credentials;
    });
    await ready(page); return page;
  };
  const stop = async () => {
    await nativeBrowser?.close(); nativeBrowser = undefined;
    if (app?.pid && app.exitCode === null) { const process = app; process.kill(); await new Promise<void>((resolve) => { if (process.exitCode !== null) resolve(); else process.once('exit', () => resolve()); }); }
  };
  const webContext = await browser.newContext({ baseURL }), web = await webContext.newPage();
  try {
    let desk = await launch(); const source = await createCloudProject(desk, false); await joinCloudProject(web, source.code);
    await editCloudNode(desk, 'Tiếp nhận vật tư', 'Desktop qua Web'); await syncNow(desk);
    await syncNow(web); await closeCloud(web); await expect(nodeModel(web, 'Desktop qua Web')).toBeVisible();
    await editCloudNode(web, 'Desktop qua Web', 'Web về Desktop'); await syncNow(web);
    await syncNow(desk); await closeCloud(desk); await expect(nodeModel(desk, 'Web về Desktop')).toBeVisible();
    const vault = join(profile, 'data', 'device-credentials'), files = readdirSync(vault);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(join(vault, file)).includes(Buffer.from('dai_device_v1_'))).toBe(false);
    expect(readFileSync(join(profile, 'data', 'diagramai.sqlite')).includes(Buffer.from('dai_device_v1_'))).toBe(false);
    await desk.route(apiPattern, (route) => route.abort('internetdisconnected'));
    await editCloudNode(desk, 'Web về Desktop', 'Desktop offline sau restart');
    await openCloud(desk); await desk.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click(); await expect(cloudButton(desk)).toContainText('Offline');
    await stop(); desk = await launch(); // new WebView profile, same SQLite + DPAPI vault
    await expect(nodeModel(desk, 'Desktop offline sau restart')).toBeVisible(); await syncNow(desk);
    await syncNow(web); await closeCloud(web); await expect(nodeModel(web, 'Desktop offline sau restart')).toBeVisible();
    await desk.route(apiPattern, (route) => route.abort('internetdisconnected'));
    await editCloudNode(desk, 'Desktop offline sau restart', 'Nhánh Desktop cần giữ');
    await editCloudNode(web, 'Desktop offline sau restart', 'Nhánh Web cloud'); await syncNow(web);
    await desk.unroute(apiPattern); await openCloud(desk); await desk.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
    await expect(desk.getByRole('heading', { name: 'Đã giữ cả bản local và bản cloud', exact: true })).toBeVisible({ timeout: 20000 });
    await desk.getByRole('button', { name: 'Dùng bản cloud, giữ bản local riêng', exact: true }).click();
    await expect(desk.getByRole('dialog')).toHaveCount(0); await expect(nodeModel(desk, 'Nhánh Web cloud')).toBeVisible();
    await desk.getByRole('button', { name: 'Sơ đồ', exact: true }).click();
    await expect(desk.locator('.project-list')).toContainText('(xung đột local)');
    await desk.screenshot({ path: testInfo.outputPath('desktop-p5-conflict-preserved.png') });
  } finally {
    await stop(); await webContext.close();
    if (managed && credential) await new SyncClient(managed).deleteProject(credential.projectId, credential.token);
  }
});

import { expect, test, type Browser } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloudButton, editCloudNode, syncNow, closeCloud, openCloud } from '../helpers/cloud';
import { nodeModel, ready } from '../helpers/drawing';
import { SyncClient, type WorkspaceAccess } from '@diagramai/sync-core';
import { createWorkspace, connectWorkspace, openLibrary, closeLibrary, updateLibrary, openWorkspaceDrawing } from '../helpers/workspace';

test('P5 private workspace Desktop ↔ Web, catalog discovery, DPAPI/restart and conflicts', async ({ playwright, browser, baseURL }, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows DPAPI/WebView2 integration');
  const executable = process.env.DIAGRAMAI_TEST_EXE; if (!executable) throw new Error('Run the isolated P5 installer harness.');
  const profile = mkdtempSync(join(process.env.LOCALAPPDATA!, 'Temp', 'opencode', 'diagramai-p5-'));
  const managed = process.env.DIAGRAMAI_NATIVE_MANAGED_API;
  const apiPattern = `${managed ?? 'http://127.0.0.1:8787/'}**`;
  let workspaceAccess: WorkspaceAccess | undefined;
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
    if (managed) page.on('request', (request) => {
      if (request.url() === `${managed}v1/workspaces` && request.method() === 'POST') workspaceAccess = request.postDataJSON();
    });
    await ready(page); return page;
  };
  const stop = async () => {
    await nativeBrowser?.close(); nativeBrowser = undefined;
    if (app?.pid && app.exitCode === null) { const process = app; process.kill(); await new Promise<void>((resolve) => { if (process.exitCode !== null) resolve(); else process.once('exit', () => resolve()); }); }
  };
  const webContext = await browser.newContext({ baseURL }), web = await webContext.newPage();
  try {
    let desk = await launch(); const source = await createWorkspace(desk, false);
    await web.goto('./'); await ready(web); await connectWorkspace(web, source.link);
    await openWorkspaceDrawing(web, source.title);
    await editCloudNode(desk, 'Tiếp nhận vật tư', 'Desktop qua Web'); await syncNow(desk);
    await syncNow(web); await closeCloud(web); await expect(nodeModel(web, 'Desktop qua Web')).toBeVisible();
    await editCloudNode(web, 'Desktop qua Web', 'Web về Desktop'); await syncNow(web);
    await syncNow(desk); await closeCloud(desk); await expect(nodeModel(desk, 'Web về Desktop')).toBeVisible();
    const vault = join(profile, 'data', 'device-credentials'), files = readdirSync(vault);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(join(vault, file)).includes(Buffer.from('dai_device_v1_'))).toBe(false);
      expect(readFileSync(join(vault, file)).includes(Buffer.from('dai_workspace_v1_'))).toBe(false);
    }
    expect(readFileSync(join(profile, 'data', 'diagramai.sqlite')).includes(Buffer.from('dai_device_v1_'))).toBe(false);
    expect(readFileSync(join(profile, 'data', 'diagramai.sqlite')).includes(Buffer.from('dai_workspace_v1_'))).toBe(false);
    await desk.route(apiPattern, (route) => route.abort('internetdisconnected'));
    await editCloudNode(desk, 'Web về Desktop', 'Desktop offline sau restart');
    await openCloud(desk); await desk.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click(); await expect(cloudButton(desk)).toContainText('Chưa đồng bộ hết');
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
    await openLibrary(desk); await desk.getByRole('button', { name: 'File / Bản vẽ chỉ trên máy / Checkpoint', exact: true }).click();
    await expect(desk.locator('.project-list')).toContainText('(xung đột local)');
    await desk.screenshot({ path: testInfo.outputPath('desktop-p5-conflict-preserved.png') });
    await closeLibrary(web); await openLibrary(web);
    await web.getByRole('textbox', { name: 'Tên dự án mới', exact: true }).fill('Dự án từ Web');
    await web.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await expect(web.getByRole('heading', { name: 'Dự án từ Web', exact: true })).toBeVisible();
    await web.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture mới từ Web');
    await web.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click();
    await expect(web.locator('.project-name')).toContainText('Dự án từ Web / P5 fixture mới từ Web');
    await updateLibrary(web); await closeLibrary(desk); await updateLibrary(desk);
    await desk.getByRole('button', { name: 'Dự án từ Web', exact: true }).click();
    await expect(desk.getByRole('button', { name: 'Mở bản vẽ P5 fixture mới từ Web', exact: true })).toBeVisible();
    await desk.screenshot({ path: testInfo.outputPath('desktop-p5-workspace-catalog.png') });
    await openLibrary(desk);
    await desk.getByRole('button', { name: 'Chia sẻ Project Dự án đầu tiên', exact: true }).click();
    const shareField = desk.getByRole('textbox', { name: 'Link chia sẻ', exact: true }); await expect(shareField).toBeVisible();
    const scopedLink = await shareField.inputValue(); await desk.getByRole('button', { name: 'Ẩn link', exact: true }).click();
    await desk.getByText('Mở link Project / bản vẽ', { exact: true }).click();
    await desk.getByRole('textbox', { name: 'Link Project hoặc bản vẽ', exact: true }).fill(scopedLink);
    await desk.getByRole('button', { name: 'Mở link chia sẻ', exact: true }).click();
    await expect(desk.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true })).toBeVisible();
    await expect(desk.getByText('Dự án từ Web', { exact: true })).toHaveCount(0);
    await desk.getByRole('button', { name: `Mở bản vẽ ${source.title}`, exact: true }).click(); await ready(desk);
    await stop(); desk = await launch();
    await expect(nodeModel(desk, 'Nhánh Web cloud')).toBeVisible();
    await openLibrary(desk); await expect(desk.getByText('Dự án từ Web', { exact: true })).toHaveCount(0);
    for (const file of readdirSync(vault)) expect(readFileSync(join(vault, file)).includes(Buffer.from('dai_share_v1_'))).toBe(false);
    expect(readFileSync(join(profile, 'data', 'diagramai.sqlite')).includes(Buffer.from('dai_share_v1_'))).toBe(false);
    await desk.screenshot({ path: testInfo.outputPath('desktop-scoped-project.png') });
    await desk.getByRole('button', { name: 'Về kho của tôi', exact: true }).click();
    await desk.getByRole('textbox', { name: 'Tên dự án mới', exact: true }).fill('Project tạo trên Desktop');
    await desk.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await desk.getByRole('textbox', { name: 'Tên bản vẽ mới', exact: true }).fill('P5 fixture Desktop gửi khi thoát');
    await desk.getByRole('button', { name: 'Tạo bản vẽ', exact: true }).click(); await ready(desk);
    await updateLibrary(web);
    await expect(web.getByRole('button', { name: 'Project tạo trên Desktop', exact: true })).toHaveCount(0);
    // Real native close request, not a process kill or a synthetic DOM event.
    const closingApp = app!;
    const closeRequest = spawn('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${closingApp.pid}).CloseMainWindow()`], { stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => { closeRequest.once('error', reject); closeRequest.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Native close request failed'))); });
    await expect.poll(() => closingApp.exitCode, { timeout: 30000 }).not.toBeNull();
    await updateLibrary(web);
    await openWorkspaceDrawing(web, 'P5 fixture Desktop gửi khi thoát', 'Project tạo trên Desktop');
    await expect(web.locator('.project-name')).toContainText('Project tạo trên Desktop / P5 fixture Desktop gửi khi thoát');
  } finally {
    await stop(); await webContext.close();
    if (managed && workspaceAccess) await new SyncClient(managed).deleteWorkspace(workspaceAccess);
  }
});

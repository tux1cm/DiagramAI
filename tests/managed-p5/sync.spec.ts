import { test, expect } from '@playwright/test';
import { SyncClient } from '@diagramai/sync-core';
import { createCloudProject, joinCloudProject, editCloudNode, syncNow, closeCloud } from '../helpers/cloud';
import { nodeModel } from '../helpers/drawing';

test('Web CSP/CORS → managed Neon Function → second Web and back', async ({ page, browser, baseURL }) => {
  const api = process.env.DIAGRAMAI_MANAGED_TEST_API!;
  const context = await browser.newContext({ baseURL }), target = await context.newPage();
  let credential: { projectId: string; token: string } | undefined;
  page.on('response', async (response) => {
    if (response.url() === `${api}v1/projects` && response.request().method() === 'POST' && response.ok()) credential = (await response.json()).credentials;
  });
  try {
    const created = await createCloudProject(page);
    await joinCloudProject(target, created.code);
    await editCloudNode(page, 'Tiếp nhận vật tư', 'Managed đi'); await syncNow(page);
    await syncNow(target); await closeCloud(target); await expect(nodeModel(target, 'Managed đi')).toBeVisible();
    await editCloudNode(target, 'Managed đi', 'Managed về'); await syncNow(target);
    await syncNow(page); await closeCloud(page); await expect(nodeModel(page, 'Managed về')).toBeVisible();
  } finally {
    await context.close();
    if (credential) await new SyncClient(api).deleteProject(credential.projectId, credential.token);
  }
});

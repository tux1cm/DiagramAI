import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDocument } from '../packages/diagram-core/src/index.ts';
import { SyncClient, snapshotHash } from '../packages/sync-core/src/index.ts';

const base = process.argv[2];
if (!['https://br-soft-surf-b3hws0gm-health.compute.c-4.ap-southeast-1.aws.neon.tech/', 'https://br-noisy-waterfall-b37wduo3-health.compute.c-4.ap-southeast-1.aws.neon.tech/'].includes(base)) throw new Error('Provide an explicit existing DiagramAI managed API origin.');
const client = new SyncClient(base), access = { id: randomUUID(), key: `dai_workspace_v1_${randomBytes(32).toString('base64url')}` };
let created = false;
try {
  await client.createWorkspace(access); created = true; await client.createWorkspace(access);
  const folder = { id: randomUUID(), title: 'P5 fixture managed workspace' }; await client.workspaceFolder(access, folder);
  const document = createDocument('P5 fixture managed drawing'), input = { id: randomUUID(), folderId: folder.id, project: { document, hash: await snapshotHash(document), operationId: randomUUID(), deviceLabel: 'Managed workspace fixture' } };
  const first = await client.workspaceCreateDrawing(access, input), retried = await client.workspaceCreateDrawing(access, input);
  assert.equal(first.credentials.deviceId === retried.credentials.deviceId, true);
  const catalog = await client.workspaceCatalog(access); assert.equal(catalog.folders.length, 1); assert.equal(catalog.drawings.length, 1);
  const otherDevice = await client.workspaceDrawing(access, input.id);
  const edited = { ...document, title: 'P5 fixture managed second device edit' };
  await client.push(input.id, otherDevice.credentials.token, { document: edited, hash: await snapshotHash(edited), baseRevision: 1, operationId: randomUUID() });
  assert.equal((await client.pull(input.id, first.credentials.token, 1)).document.title, edited.title);
  const denied = await fetch(new URL(`/v1/workspaces/${access.id}`, base)); assert.equal(denied.status, 401);
  console.log('PASS managed workspace: private catalog, project/drawing discovery, recoverable create retry, cross-device edit and authorization.');
} finally {
  if (created) { await client.deleteWorkspace(access); console.log('Only this run\'s workspace/drawing fixtures deleted; unrelated data unchanged.'); }
}

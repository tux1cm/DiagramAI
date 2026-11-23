import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDocument } from '../packages/diagram-core/src/index.ts';
import { SyncClient, snapshotHash } from '../packages/sync-core/src/index.ts';

const base = process.argv[2];
if (!base || !/^https:\/\/br-[a-z0-9-]+-health\.compute\.[a-z0-9.-]+\.neon\.tech\/?$/.test(base)) throw new Error('Provide the explicit existing managed Function HTTPS origin.');
const origin = 'https://tux1cm.github.io';
const client = new SyncClient(base, (input, options) => fetch(input, { ...options, headers: { ...options?.headers, Origin: origin } }));
let created;
try {
  const preflight = await fetch(new URL('/v1/projects', base), { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  created = await client.create(createDocument(`P5 fixture managed ${randomUUID()}`), randomUUID(), 'Managed owner fixture');
  const { projectId, token } = created.credentials;
  const unauthorized = await fetch(new URL(`/v1/projects/${projectId}/snapshot`, base));
  assert.equal(unauthorized.status, 401);
  const pair = await client.pairing(projectId, token), editor = await client.join(pair.code, 'Managed editor fixture');
  const document = { ...created.snapshot.document, title: 'P5 fixture managed edited' };
  const pending = { document, hash: await snapshotHash(document), operationId: randomUUID(), baseRevision: 1 };
  assert.equal((await client.push(projectId, editor.credentials.token, pending)).acceptedRevision, 2);
  assert.equal((await client.push(projectId, editor.credentials.token, pending)).acceptedRevision, 2);
  assert.equal((await client.pull(projectId, token, 1)).document.title, document.title);
  assert.equal(await client.pull(projectId, token, 2), null);
  await client.revoke(projectId, token, editor.credentials.deviceId);
  await assert.rejects(client.pull(projectId, editor.credentials.token, 0), { status: 401 });
  const recovered = await client.recover(projectId, created.recoveryKey, 'Managed recovery fixture');
  assert.equal(recovered.credentials.scope, 'owner');
  console.log('PASS managed Function: CORS, private create/pull, pairing, CAS/idempotent ACK, revoke and recovery.');
} finally {
  if (created) {
    await client.deleteProject(created.credentials.projectId, created.credentials.token);
    console.log('Managed fixture deleted; local diagrams and unrelated projects untouched.');
  }
}

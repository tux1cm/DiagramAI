import { spawnSync } from 'node:child_process';

// Repository explicitly confirmed by the owner. No generic account-wide operations.
const repository = 'tux1cm/DiagramAI';
const mode = process.argv[2] ?? 'status';
if (!['status', 'setup', 'dispatch', 'jobs', 'wait'].includes(mode)) throw new Error('Use status, setup, dispatch, jobs or wait <run-id> ...');
const credential = spawnSync('git', ['-c', 'credential.interactive=false', 'credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\npath=tux1cm/DiagramAI.git\n\n',
  encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
});
// Credentials stay in memory and are never printed or written into project files.
const token = credential.stdout?.split(/\r?\n/).find((line) => line.startsWith('password='))?.slice(9);
if (credential.status !== 0 || !token) {
  console.error('BLOCKED: no usable GitHub credential in Git Credential Manager. Sign in to GitHub for Git first.');
  process.exit(2);
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok && !(method === 'GET' && response.status === 404)) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
if (mode === 'setup') {
  async function variable(name, value) {
    const existing = await api(`/actions/variables/${name}`);
    await api(existing.status === 404 ? '/actions/variables' : `/actions/variables/${name}`, existing.status === 404 ? 'POST' : 'PATCH', { name, value });
  }
  await variable('VITE_BASE_PATH', '/DiagramAI/');
  if (process.env.DIAGRAMAI_API_BASE_URL) {
    const url = new URL(process.env.DIAGRAMAI_API_BASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('API base must be public HTTPS without credentials');
    await variable('VITE_API_BASE_URL', url.href);
  }
  const pages = await api('/pages');
  await api('/pages', pages.status === 404 ? 'POST' : 'PUT', { build_type: 'workflow' });
  console.log('Configured Pages GitHub Actions and public base path /DiagramAI/. No secret configured.');
}
if (mode === 'dispatch') {
  const response = await api('/actions/workflows/deploy-pages.yml/dispatches', 'POST', { ref: 'main' });
  if (response.status !== 204) throw new Error(`Dispatch failed: HTTP ${response.status}`);
  console.log('Requested Pages deployment on main. Check status; dispatch is not proof of success.');
}
if (mode === 'wait') {
  const ids = process.argv.slice(3);
  if (!ids.length || ids.length > 5 || ids.some((id) => !/^\d+$/.test(id))) throw new Error('Provide 1-5 exact Actions run IDs');
  const pending = new Set(ids);
  const states = new Map();
  const deadline = Date.now() + 15 * 60 * 1000;
  while (pending.size) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the selected Actions runs');
    for (const id of pending) {
      const run = await api(`/actions/runs/${id}`);
      if (run.status !== 200) throw new Error(`Run ${id} not found`);
      const state = `${run.data.status}/${run.data.conclusion ?? '-'}`;
      if (states.get(id) !== state) { console.log(`${id} ${run.data.name}: ${state}`); states.set(id, state); }
      if (run.data.status === 'completed') {
        if (run.data.conclusion !== 'success') throw new Error(`Actions failed: https://github.com/${repository}/actions/runs/${id}`);
        pending.delete(id);
      }
    }
    if (pending.size) await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  console.log('Selected Actions runs completed successfully.');
}
const pages = await api('/pages');
console.log(JSON.stringify({ repository, pages: pages.status === 404 ? 'not-enabled' : { url: pages.data.html_url, status: pages.data.status, buildType: pages.data.build_type } }, null, 2));
const runs = await api('/actions/runs?per_page=5');
console.log(JSON.stringify((runs.data.workflow_runs ?? []).map(({ id, name, status, conclusion, html_url }) => ({ id, name, status, conclusion, url: html_url })), null, 2));
if (mode === 'jobs') {
  for (const run of runs.data.workflow_runs ?? []) {
    const jobs = await api(`/actions/runs/${run.id}/jobs`);
    console.log(JSON.stringify({ run: run.id, jobs: jobs.data.jobs?.map(({ name, status, conclusion, steps }) => ({ name, status, conclusion, steps: steps?.map(({ name, status, conclusion }) => ({ name, status, conclusion })) })) }, null, 2));
  }
}

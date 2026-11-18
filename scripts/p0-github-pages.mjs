import { spawnSync } from 'node:child_process';

// Repository explicitly confirmed by the owner. No generic account-wide operations.
const repository = 'tux1cm/DiagramAI';
const mode = process.argv[2] ?? 'status';
if (!['status', 'setup', 'dispatch'].includes(mode)) throw new Error('Use status, setup or dispatch');
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
  const variable = await api('/actions/variables/VITE_BASE_PATH');
  await api(variable.status === 404 ? '/actions/variables' : '/actions/variables/VITE_BASE_PATH', variable.status === 404 ? 'POST' : 'PATCH', { name: 'VITE_BASE_PATH', value: '/DiagramAI/' });
  const pages = await api('/pages');
  await api('/pages', pages.status === 404 ? 'POST' : 'PUT', { build_type: 'workflow' });
  console.log('Configured Pages GitHub Actions and public base path /DiagramAI/. No secret configured.');
}
if (mode === 'dispatch') {
  const response = await api('/actions/workflows/deploy-pages.yml/dispatches', 'POST', { ref: 'main' });
  if (response.status !== 204) throw new Error(`Dispatch failed: HTTP ${response.status}`);
  console.log('Requested P0 Pages deployment on main. Check status; dispatch is not proof of success.');
}
const pages = await api('/pages');
console.log(JSON.stringify({ repository, pages: pages.status === 404 ? 'not-enabled' : { url: pages.data.html_url, status: pages.data.status, buildType: pages.data.build_type } }, null, 2));
const runs = await api('/actions/runs?per_page=5');
console.log(JSON.stringify((runs.data.workflow_runs ?? []).map(({ id, name, status, conclusion, html_url }) => ({ id, name, status, conclusion, url: html_url })), null, 2));

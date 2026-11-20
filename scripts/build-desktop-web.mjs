import { spawnSync } from 'node:child_process';

// Desktop assets are rooted at /, even when the Web deployment uses /repo/.
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:web'], {
  env: { ...process.env, VITE_BASE_PATH: '/', DIAGRAMAI_DESKTOP_BUILD: '1' },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

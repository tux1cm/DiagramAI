import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import { migrateSync } from './sync-test-database.mjs';
import { verifySyncExport } from './verified-sync-export.mjs';

const [project, target, mode, backupMode, backupFile] = process.argv.slice(2), production = mode === '--production';
if (!project || !target || !/^[a-z0-9-]+$/.test(project) || !/^[a-zA-Z0-9_-]+$/.test(target) || mode && !production) throw new Error('Usage: deploy-sync-api.mjs <existing-project-id> <explicit-branch-id> [--production]');
if (backupMode && (!production || backupMode !== '--verified-export' || !backupFile) || backupFile && backupMode !== '--verified-export') throw new Error('An explicit --verified-export <encrypted-file> is allowed only with --production.');
const cwd = fileURLToPath(new URL('../apps/api/', import.meta.url));
function neon(args, extraEnv = {}) {
  const result = spawnSync(process.platform === 'win32' ? 'neon.cmd' : 'neon', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, CI: '1', ...extraEnv }, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    let detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
    for (const value of Object.values({ ...process.env, ...extraEnv })) if (value && value.length >= 16) detail = detail.split(value).join('[redacted]');
    detail = detail.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[database redacted]').replace(/dai_(?:device|recovery)_v1_[A-Za-z0-9_-]+/g, '[capability redacted]');
    throw new Error(`Neon command failed; no billing change or fallback attempted. Sanitized diagnostics:\n${detail.slice(-6000)}`);
  }
  return result.stdout;
}
const branches = JSON.parse(neon(['branches', 'list', '--project-id', project, '--output', 'json']));
const branch = branches.find((item) => item.id === target || item.name === target);
if (!branch || branch.protected) throw new Error('Unknown/protected target; refusing changes.');
if (production ? !(branch.id === target && branch.primary && branch.default) : branch.primary || branch.default || /prod/i.test(branch.name)) throw new Error('Production needs its exact branch ID plus --production; dev deployment cannot target production.');
let backupId = null;
if (production && !backupFile) {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const backup = JSON.parse(neon(['snapshots', 'create', '--project-id', project, '--branch', branch.id, '--name', `p5-before-sync-${stamp}`, '--output', 'json']));
  backupId = backup.snapshot?.id ?? backup.id;
  if (!backupId) throw new Error('No backup ID acknowledged; production migration was not started.');
}
const raw = neon(['connection-string', branch.id, '--project-id', project]).match(/postgres(?:ql)?:\/\/[^\s]+/)?.[0];
if (!raw) throw new Error('No database URL received; credentials were not logged.');
const uri = new URL(raw); uri.searchParams.set('sslmode', 'verify-full');
const pool = new Pool({ connectionString: uri.toString(), max: 1, connectionTimeoutMillis: 15000, statement_timeout: 15000 });
try {
  if (production && backupFile) backupId = await verifySyncExport(backupFile, project, branch.id, pool);
  if (production && !backupId) throw new Error('No verified backup; migration not started.');
  await migrateSync(pool);
} finally { await pool.end(); }
// Secrets travel in the child environment, not argv, files, frontend variables
// or transcript output. --no-env-pull prevents writing a plaintext .env copy.
neon(['deploy', '--project-id', project, '--branch', branch.id, '--config', 'neon.ts', '--update-existing', '--no-env-pull', '--output', 'json'], {
  DIAGRAMAI_DEPLOY_DATABASE_URL: uri.toString(),
  DIAGRAMAI_DEPLOY_CORS_ORIGINS: 'https://tux1cm.github.io,http://tauri.localhost,https://tauri.localhost,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173',
  DIAGRAMAI_DEPLOY_RATE_SECRET: randomBytes(32).toString('hex'), DIAGRAMAI_DEPLOY_SYNC_ENABLED: 'true',
});
const listed = JSON.parse(neon(['functions', 'list', '--project-id', project, '--branch', branch.id, '--output', 'json']));
const functions = Array.isArray(listed) ? listed : listed.functions ?? [];
const api = functions.find((item) => item.slug === 'health');
console.log(JSON.stringify({ branchId: branch.id, production, backupId, deployed: true, url: api?.invocation_url ?? api?.url ?? null }, null, 2));

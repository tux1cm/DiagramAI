import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

// Application-schema export, independent of Neon snapshots. Windows per-user
// DPAPI only: no plaintext backup/credentials file and no silent fallback.
const [project, branch] = process.argv.slice(2);
if (process.platform !== 'win32' || project !== 'blue-mode-25353507' || !['br-noisy-waterfall-b37wduo3', 'br-soft-surf-b3hws0gm'].includes(branch)) throw new Error('Backup requires Windows and an explicit existing DiagramAI branch ID.');
const command = spawnSync('neon.cmd', ['connection-string', branch, '--project-id', project], { encoding: 'utf8', shell: true });
const raw = command.status === 0 && command.stdout.match(/postgres(?:ql)?:\/\/[^\s]+/)?.[0];
if (!raw) throw new Error('Could not receive database credentials; output suppressed.');
const uri = new URL(raw); uri.searchParams.set('sslmode', 'verify-full');
const pool = new Pool({ connectionString: uri.toString(), max: 1, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
const tables = ['schema_migrations', 'workspaces', 'workspace_folders', 'projects', 'project_devices', 'project_recovery', 'project_revisions', 'sync_operations', 'pairing_codes', 'rate_limit_buckets', 'storage_budget', 'workspace_drawings', 'share_links', 'short_links', 'workspace_deletions'];
const backup = { format: 'diagramai-sync-admin-backup-v1', project, branch, createdAt: new Date().toISOString(), migrations: {}, tables: {} };
try {
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const name of tables) {
      const exists = (await db.query('SELECT to_regclass($1) AS relation', [`diagramai_sync.${name}`])).rows[0].relation;
      if (!exists && ['workspaces', 'workspace_folders', 'workspace_drawings', 'share_links', 'short_links', 'workspace_deletions'].includes(name)) continue;
      backup.tables[name] = (await db.query(`SELECT coalesce(json_agg(t),'[]'::json) AS rows FROM diagramai_sync.${name} t`)).rows[0].rows;
    }
    await db.query('COMMIT');
  } catch { await db.query('ROLLBACK').catch(() => {}); throw new Error('Backup read failed; no database changes or credential output.'); }
  finally { db.release(); }
} finally { await pool.end(); }
const migrations = new URL('../apps/api/migrations/', import.meta.url);
for (const file of (await readdir(migrations)).filter((name) => name.endsWith('.up.sql') && backup.tables.schema_migrations.some((migration) => migration.version === Number(name.split('_')[0]))).sort()) backup.migrations[file] = await readFile(new URL(file, migrations), 'utf8');
const bytes = Buffer.from(JSON.stringify(backup)), sha256 = createHash('sha256').update(bytes).digest('hex');
function protect(input, decrypt = false) {
  const method = decrypt ? 'Unprotect' : 'Protect';
  const script = `Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${method}($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: input.toString('base64'), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Windows backup protection failed; no plaintext fallback.');
  return Buffer.from(result.stdout.trim(), 'base64');
}
const directory = join(process.env.LOCALAPPDATA, 'Temp', 'opencode', 'diagramai-backups');
await mkdir(directory, { recursive: true });
const path = join(directory, `${branch}-${Date.now()}.json.dpapi`);
await writeFile(path, protect(bytes), { flag: 'wx' });
const reopened = protect(await readFile(path), true);
if (createHash('sha256').update(reopened).digest('hex') !== sha256) throw new Error('Backup verification failed; retain the Neon snapshot.');
console.log(JSON.stringify({ path, branch, sha256, verified: true, projects: backup.tables.projects.length, scope: 'diagramai_sync schema data + up migrations; not a whole-database dump', protection: 'Windows CurrentUser DPAPI; same-user recovery required' }, null, 2));

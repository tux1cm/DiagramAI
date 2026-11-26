import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function verifySyncExport(file, project, branch, pool) {
  if (process.platform !== 'win32') throw new Error('Encrypted export verification requires Windows CurrentUser DPAPI.');
  const encrypted = await readFile(file);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $plain=[Security.Cryptography.ProtectedData]::Unprotect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($plain))'], { input: encrypted.toString('base64'), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Backup could not be decrypted; migration not started.');
  const bytes = Buffer.from(result.stdout.trim(), 'base64'), backup = JSON.parse(bytes.toString('utf8'));
  const age = Date.now() - Date.parse(backup.createdAt);
  if (backup.format !== 'diagramai-sync-admin-backup-v1' || backup.project !== project || backup.branch !== branch || !Number.isFinite(age) || age < 0 || age > 3600000) throw new Error('Backup must target this exact branch and be at most one hour old.');
  // An export is accepted only after a real restore with all SQL constraints on
  // the guarded dev branch, rolled back, not merely a successful file decrypt.
  const restored = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-sync-backup.mjs', import.meta.url)), file, project, 'br-soft-surf-b3hws0gm'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (restored.status !== 0) throw new Error('Backup dev restore verification failed; migration not started.');
  const receipt = JSON.parse(restored.stdout), digest = createHash('sha256').update(bytes).digest('hex');
  if (!receipt.verified || receipt.sha256 !== digest) throw new Error('Backup restore receipt does not match this export.');
  const tables = ['schema_migrations', 'projects', 'project_devices', 'project_recovery', 'project_revisions', 'sync_operations', 'pairing_codes', 'storage_budget', 'workspaces', 'workspace_folders', 'workspace_drawings', 'share_links', 'short_links', 'workspace_deletions'];
  const stable = (value) => value !== null && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const rowsKey = (rows) => JSON.stringify(rows.map((row) => JSON.stringify(stable(row))).sort());
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const table of tables) {
      const exists = (await db.query('SELECT to_regclass($1) AS relation', [`diagramai_sync.${table}`])).rows[0].relation;
      if (!exists && !backup.tables[table] && ['workspaces', 'workspace_folders', 'workspace_drawings', 'share_links', 'short_links', 'workspace_deletions'].includes(table)) continue;
      if (!exists || !Array.isArray(backup.tables[table])) throw new Error('Backup schema differs from production; create a new export.');
      const rows = (await db.query(`SELECT to_jsonb(t) AS value FROM diagramai_sync.${table} t`)).rows.map((row) => row.value);
      if (rowsKey(rows) !== rowsKey(backup.tables[table])) throw new Error('Production data changed since backup; create a new export.');
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { db.release(); }
  return `verified-export-sha256:${digest}`;
}

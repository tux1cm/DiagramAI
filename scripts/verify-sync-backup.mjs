import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { testDatabase } from './sync-test-database.mjs';

const [file, project, branch] = process.argv.slice(2);
if (process.platform !== 'win32' || !file) throw new Error('Provide a DPAPI application backup and an explicit dev project/branch.');
const { connectionString } = testDatabase(project, branch); // Refuses production.
const encrypted = await readFile(file);
const decrypted = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $plain=[Security.Cryptography.ProtectedData]::Unprotect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($plain))'], { input: encrypted.toString('base64'), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
if (decrypted.status !== 0) throw new Error('Cannot decrypt backup for this Windows user; no plaintext output.');
const bytes = Buffer.from(decrypted.stdout.trim(), 'base64'), backup = JSON.parse(bytes.toString('utf8'));
if (backup.format !== 'diagramai-sync-admin-backup-v1' || backup.project !== project) throw new Error('Wrong backup format/project.');
const migrations = ['001_sync.up.sql', '002_project_count.up.sql', '003_workspaces.up.sql', '004_scoped_shares.up.sql', '005_short_links.up.sql', '006_workspace_deletions.up.sql'].filter((name) => name in backup.migrations);
if (migrations.length < 2 || Object.keys(backup.migrations).length !== migrations.length) throw new Error('Unknown or incomplete backup migrations.');
for (const file of migrations) {
  const trusted = await readFile(new URL(`../apps/api/migrations/${file}`, import.meta.url), 'utf8');
  if (trusted !== backup.migrations[file]) throw new Error('Backup migration differs from trusted source; no SQL executed.');
}
const schema = `p5_backup_verify_${randomUUID().replaceAll('-', '')}`;
const tables = ['schema_migrations', ...(migrations.length >= 3 ? ['workspaces', 'workspace_folders'] : []), 'projects', 'project_devices', 'project_recovery', 'project_revisions', 'sync_operations', 'pairing_codes', 'rate_limit_buckets', 'storage_budget', ...(migrations.length >= 3 ? ['workspace_drawings'] : []), ...(migrations.length >= 4 ? ['share_links'] : []), ...(migrations.length >= 5 ? ['short_links'] : []), ...(migrations.length >= 6 ? ['workspace_deletions'] : [])];
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE ${schema}.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const file of migrations) await db.query(backup.migrations[file].replaceAll('diagramai_sync', schema));
    await db.query(`DELETE FROM ${schema}.storage_budget`); // Only the newly created isolated fixture row.
    for (const table of tables) {
      if (!Array.isArray(backup.tables[table])) throw new Error('Backup table missing.');
      await db.query(`INSERT INTO ${schema}.${table} SELECT * FROM jsonb_populate_recordset(NULL::${schema}.${table},$1::jsonb)`, [JSON.stringify(backup.tables[table])]);
      const count = (await db.query(`SELECT count(*)::int AS count FROM ${schema}.${table}`)).rows[0].count;
      if (count !== backup.tables[table].length) throw new Error('Restored table count differs.');
    }
  } finally { await db.query('ROLLBACK'); db.release(); }
  console.log(JSON.stringify({ verified: true, sha256: createHash('sha256').update(bytes).digest('hex'), projects: backup.tables.projects.length, restore: 'all application tables restored with constraints in an isolated dev schema, transaction rolled back; existing data unchanged' }, null, 2));
} catch { throw new Error('Dev restore verification failed and was rolled back; backup contents/credentials suppressed.'); }
finally { await pool.end(); }

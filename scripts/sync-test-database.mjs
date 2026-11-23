import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function testDatabase(project, branchName) {
  const ciUrl = process.env.DIAGRAMAI_SYNC_CI_DATABASE_URL;
  if (ciUrl) {
    const target = new URL(ciUrl);
    if (process.env.CI !== 'true' || !['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/diagramai_sync_ci') throw new Error('CI test database must be the explicitly named localhost fixture database.');
    return { connectionString: ciUrl, branchId: 'br-ci-postgres' };
  }
  if (!project || !branchName || !/^[a-z0-9-]+$/.test(project) || !/^[a-zA-Z0-9_-]+$/.test(branchName)) throw new Error('Provide the existing Neon project ID and an explicit non-production branch.');
  function neon(args) {
    const result = spawnSync(process.platform === 'win32' ? 'neon.cmd' : 'neon', args, { encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, CI: '1' } });
    if (result.status !== 0) throw new Error('Neon CLI failed. Check authentication/target separately; credential output was suppressed.');
    return result.stdout;
  }
  const branches = JSON.parse(neon(['branches', 'list', '--project-id', project, '--output', 'json']));
  const branch = branches.find((item) => item.id === branchName || item.name === branchName);
  if (!branch || branch.primary || branch.default || branch.protected || /prod/i.test(branch.name)) throw new Error('Refusing migration/tests on a primary, default, protected or production branch.');
  const output = neon(['connection-string', branch.id, '--project-id', project]);
  const received = output.match(/postgres(?:ql)?:\/\/[^\s]+/)?.[0];
  if (!received) throw new Error('No connection string received; output was not logged.');
  const parsed = new URL(received); parsed.searchParams.set('sslmode', 'verify-full');
  return { connectionString: parsed.toString(), branchId: branch.id };
}
export async function migrateSync(pool) {
  const directory = new URL('../apps/api/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d+_.+\.up\.sql$/.test(file)).sort();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('diagramai-sync-migrations',0))");
    await db.query('CREATE SCHEMA IF NOT EXISTS diagramai_sync');
    await db.query('CREATE TABLE IF NOT EXISTS diagramai_sync.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of files) {
      const version = Number(file.split('_')[0]), sql = await readFile(new URL(file, directory), 'utf8'), checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await db.query('SELECT checksum FROM diagramai_sync.schema_migrations WHERE version=$1', [version]);
      if (applied.rowCount && applied.rows[0].checksum !== checksum) throw new Error('Migration checksum differs.');
      if (!applied.rowCount) { await db.query(sql); await db.query('INSERT INTO diagramai_sync.schema_migrations(version,checksum) VALUES ($1,$2)', [version, checksum]); }
    }
    await db.query('COMMIT');
  } catch { await db.query('ROLLBACK').catch(() => {}); throw new Error('P5 migration failed/checksum differs; transaction rolled back. No credentials logged.'); }
  finally { db.release(); }
}

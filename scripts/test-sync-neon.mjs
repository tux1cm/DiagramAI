import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { migrateSync, testDatabase } from './sync-test-database.mjs';

// Explicit target only. Never use the checked-out/default production context.
const [project, branchName] = process.argv.slice(2);
const { connectionString, branchId } = testDatabase(project, branchName);
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15000, statement_timeout: 15000 });
try {
  await migrateSync(pool);
  console.log('P5 additive migrations verified on the guarded test database. No credentials printed or saved.');
} finally { await pool.end(); }
const test = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts'], {
  env: { ...process.env, DIAGRAMAI_SYNC_TEST_DATABASE_URL: connectionString, DIAGRAMAI_SYNC_TEST_BRANCH: branchId }, stdio: 'inherit', shell: process.platform === 'win32',
});
process.exit(test.status ?? 1);

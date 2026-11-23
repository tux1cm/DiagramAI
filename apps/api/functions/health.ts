import { attachDatabasePool } from '@neon/functions';
import { Pool } from 'pg';
import { createHealthHandler } from '../src/health-handler';
import { createSyncHandler } from '../src/sync-handler';
import { SyncService } from '../src/sync-service';

// Long-lived Neon Functions runtime: reuse a pg Pool, not the serverless driver.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 4000,
  query_timeout: 4000,
  statement_timeout: 4000,
  idleTimeoutMillis: 10000,
});
attachDatabasePool(pool);
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const health = createHealthHandler({ allowedOrigins, queryDatabase: async () => {
  if (!process.env.DATABASE_URL) throw new Error('Database not configured');
  await pool.query('SELECT 1 AS connected');
} });
const secret = process.env.SYNC_RATE_SECRET ?? '';
const sync = createSyncHandler({
  allowedOrigins,
  enabled: process.env.SYNC_ENABLED === 'true',
  service: secret.length >= 32 ? new SyncService(pool, secret) : undefined,
  // Do not trust caller-supplied X-Forwarded-For. A shared bucket is safer until
  // the Neon runtime's authoritative client-address contract has been verified.
});

export default {
  fetch: (request: Request) => new URL(request.url).pathname === '/v1/health' ? health(request) : sync(request),
};

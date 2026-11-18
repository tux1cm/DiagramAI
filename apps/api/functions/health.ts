import { attachDatabasePool } from '@neon/functions';
import { Pool } from 'pg';
import { createHealthHandler } from '../src/health-handler';

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

export default {
  fetch: createHealthHandler({
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    queryDatabase: async () => {
      if (!process.env.DATABASE_URL) throw new Error('Database not configured');
      await pool.query('SELECT 1 AS connected');
    },
  }),
};

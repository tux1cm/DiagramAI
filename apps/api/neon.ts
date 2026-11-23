import { defineConfig } from '@neon/config/v1';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing deployment environment: ${name}`);
  return value;
}

export default defineConfig({
  functions: {
    // Keep the existing function slug/origin: P0 health remains at /v1/health.
    health: { name: 'DiagramAI private sync API', source: './functions/health.ts', env: {
      DATABASE_URL: required('DIAGRAMAI_DEPLOY_DATABASE_URL'),
      CORS_ALLOWED_ORIGINS: required('DIAGRAMAI_DEPLOY_CORS_ORIGINS'),
      SYNC_RATE_SECRET: required('DIAGRAMAI_DEPLOY_RATE_SECRET'),
      SYNC_ENABLED: process.env.DIAGRAMAI_DEPLOY_SYNC_ENABLED ?? 'false',
    } },
  },
});

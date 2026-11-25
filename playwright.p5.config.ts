import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalTeardown: './tests/p5/teardown.ts',
  testDir: './tests/workspace-p5', outputDir: 'test-results/workspace-p5', workers: 1, timeout: 90000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/p5', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173/p5-test/', browserName: 'chromium', viewport: { width: 1366, height: 768 }, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), trace: 'retain-on-failure' },
  webServer: [
    { command: 'node --import tsx scripts/p5-api-server.mjs', url: 'http://127.0.0.1:8787/v1/health', reuseExistingServer: false, timeout: 120000, gracefulShutdown: { signal: 'SIGTERM', timeout: 20000 } },
    { command: 'npm run build:web && npm run preview', url: 'http://127.0.0.1:4173/p5-test/', reuseExistingServer: false, timeout: 120000, env: { VITE_BASE_PATH: '/p5-test/', VITE_API_BASE_URL: 'http://127.0.0.1:8787' } },
  ],
});

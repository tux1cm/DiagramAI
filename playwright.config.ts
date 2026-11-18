import { defineConfig } from '@playwright/test';

const basePath = process.env.VITE_BASE_PATH ?? '/';
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/web',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:4173${basePath}`,
    trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  projects: [
    { name: 'chromium-1366', use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } } },
    { name: 'chromium-1920', use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } } },
    { name: 'chromium-1280', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: 'npm run build:web && npm run preview',
    url: `http://127.0.0.1:4173${basePath}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});

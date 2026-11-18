import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/live',
  outputDir: 'test-results/live',
  workers: 1,
  timeout: 45000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/live', open: 'never' }]],
  use: {
    baseURL: 'https://tux1cm.github.io/DiagramAI/',
    browserName: 'chromium',
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'live-1366', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'live-1920', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'live-1280', use: { viewport: { width: 1280, height: 720 } } },
  ],
});

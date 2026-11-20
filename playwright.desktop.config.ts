import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/desktop',
  workers: 1,
  timeout: 180000,
  outputDir: 'test-results/desktop',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/desktop', open: 'never' }]],
});

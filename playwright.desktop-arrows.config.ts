import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/desktop-arrows', outputDir: 'test-results/desktop-arrows', workers: 1, timeout: 90000,
  reporter: [['list']],
});

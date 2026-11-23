import { defineConfig } from '@playwright/test';
import p5 from './playwright.p5.config';

export default defineConfig({
  ...p5, testDir: './tests/desktop-p5', outputDir: 'test-results/desktop-p5', timeout: 180000,
  use: { ...p5.use, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/desktop-p5', open: 'never' }]],
});

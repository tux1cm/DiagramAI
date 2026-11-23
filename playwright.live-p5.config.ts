import { defineConfig } from '@playwright/test';

process.env.DIAGRAMAI_MANAGED_TEST_API = 'https://br-noisy-waterfall-b37wduo3-health.compute.c-4.ap-southeast-1.aws.neon.tech/';
export default defineConfig({
  testDir: './tests/managed-p5', outputDir: 'test-results/live-p5', workers: 1, timeout: 90000,
  reporter: [['list']],
  use: { baseURL: 'https://tux1cm.github.io/DiagramAI/', browserName: 'chromium', ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) },
});

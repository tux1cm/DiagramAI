import { defineConfig } from '@playwright/test';

const api = process.env.DIAGRAMAI_NATIVE_MANAGED_API;
if (api !== 'https://br-noisy-waterfall-b37wduo3-health.compute.c-4.ap-southeast-1.aws.neon.tech/') throw new Error('Final installer verification requires the explicit existing production API origin.');
export default defineConfig({
  testDir: './tests/desktop-p5', outputDir: 'test-results/desktop-managed-p5', workers: 1, timeout: 180000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173/p5-managed/', browserName: 'chromium', channel: 'msedge' },
  webServer: { command: 'npm run build:web && npm run preview', url: 'http://127.0.0.1:4173/p5-managed/', reuseExistingServer: false, timeout: 120000, env: { VITE_BASE_PATH: '/p5-managed/', VITE_API_BASE_URL: api } },
});

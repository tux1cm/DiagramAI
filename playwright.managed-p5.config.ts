import { defineConfig } from '@playwright/test';

const api = process.env.DIAGRAMAI_MANAGED_TEST_API;
if (api !== 'https://br-soft-surf-b3hws0gm-health.compute.c-4.ap-southeast-1.aws.neon.tech/') throw new Error('Managed UI verification requires the explicit existing P5 dev Function.');
export default defineConfig({
  testDir: './tests/managed-p5', outputDir: 'test-results/managed-p5', workers: 1, timeout: 90000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173/p5-managed/', browserName: 'chromium', ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
  webServer: { command: 'npm run build:web && npm run preview', url: 'http://127.0.0.1:4173/p5-managed/', reuseExistingServer: false, timeout: 120000, env: { VITE_BASE_PATH: '/p5-managed/', VITE_API_BASE_URL: api } },
});

import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  functions: {
    health: { name: 'DiagramAI P0 health', source: './functions/health.ts' },
  },
});

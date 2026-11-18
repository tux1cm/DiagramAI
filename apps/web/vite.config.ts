import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, envDir, 'VITE_');
  const base = process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH ?? '/';
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..') || base.includes('//')) {
    throw new Error('VITE_BASE_PATH must be / or /repository-name/');
  }
  return {
    plugins: [react()],
    base,
    envDir,
    server: { fs: { allow: ['../..'] } },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});

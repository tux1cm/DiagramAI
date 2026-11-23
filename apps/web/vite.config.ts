import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { pwa } from './pwa';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, envDir, 'VITE_');
  const base = process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH ?? '/';
  const apiBase = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL ?? '';
  let apiOrigin = '';
  if (apiBase) {
    const api = new URL(apiBase);
    if (api.username || api.password || api.search || api.hash || api.pathname !== '/' || !(api.protocol === 'https:' || api.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(api.hostname))) throw new Error('VITE_API_BASE_URL must be a public HTTPS origin (or localhost test API), without credentials/query/path.');
    apiOrigin = api.origin;
  }
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..') || base.includes('//')) {
    throw new Error('VITE_BASE_PATH must be / or /repository-name/');
  }
  return {
    plugins: [react(), pwa(base), {
      name: 'diagramai-web-capability-csp', apply: 'build',
      transformIndexHtml() {
        // Native IPC has its own Tauri CSP; do not block it with a second policy.
        if (process.env.DIAGRAMAI_DESKTOP_BUILD === '1') return [];
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${apiOrigin}; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'` }, injectTo: 'head-prepend' }];
      },
    }],
    base,
    envDir,
    server: { fs: { allow: ['../..'] } },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});

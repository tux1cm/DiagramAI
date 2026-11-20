import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@diagramai/ui';
import '@diagramai/ui/styles.css';
import { isTauri } from '@tauri-apps/api/core';

if (import.meta.env.PROD && !isTauri() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => { /* Online editing and IndexedDB remain available without offline caching. */ }); });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing React root');

createRoot(root).render(
  <StrictMode>
    <AppShell basePath={import.meta.env.BASE_URL} apiBaseUrl={import.meta.env.VITE_API_BASE_URL ?? ''} />
  </StrictMode>,
);

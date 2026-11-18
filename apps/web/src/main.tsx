import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { P0Shell } from '@diagramai/ui';
import '@diagramai/ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing React root');

createRoot(root).render(
  <StrictMode>
    <P0Shell basePath={import.meta.env.BASE_URL} apiBaseUrl={import.meta.env.VITE_API_BASE_URL ?? ''} />
  </StrictMode>,
);

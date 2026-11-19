import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  cursor: <path d="M5 3l14 9-7 1-3 7z"/>,
  hand: <path d="M8 13V5a2 2 0 014 0v6-7a2 2 0 014 0v7-5a2 2 0 014 0v10c0 4-3 6-6 6h-3c-3 0-4-2-6-5l-2-4a2 2 0 013-2z"/>,
  sparkle: <><path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z"/><path d="M19 2v4M17 4h4"/></>,
  file: <><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v6h5"/></>,
  link: <path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-2 2M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l2-2"/>,
  undo: <path d="M9 14 3 9l6-5M3 9h11a7 7 0 010 14h-3"/>,
  redo: <path d="m15 14 6-5-6-5M21 9H10a7 7 0 000 14h3"/>,
  save: <path d="M4 3h14l3 3v15H3V3zM7 3v7h10V3M7 21v-8h10v8"/>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>,
  upload: <path d="M12 21V9m-5 5 5-5 5 5M4 7V3h16v4"/>,
  cloud: <path d="M7 19a5 5 0 01-1.2-9.8 7 7 0 0113.4 2A4 4 0 0119 19H7z"/>,
  search: <><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 5 5"/></>,
  chev: <path d="m6 9 6 6 6-6"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m10 2-1 3-3 1-3-1-2 4 2 3-1 3 1 3 3 1 3-1 3 1 3-1 1-3 3-1 3 1 2-4-2-3 1-3-1-3-3-1-3 1z"/></>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.5 9a3 3 0 115 2.5c-2 1.5-2.5 2-2.5 4M12 19h.01"/></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3"/></>,
  fit: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  text: <path d="M4 5h16M12 5v14M8 19h8M4 5v3m16-3v3"/>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/></>,
};

export function Icon({ name, size = '', className = '' }: { name: keyof typeof paths; size?: '' | 'sm' | 'lg'; className?: string }) {
  return <svg className={`ico ${size} ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the immutable reference byte-identical', () => {
  expect(readFileSync('design/reference/DiagramAI_Mockup.html').equals(readFileSync('DiagramAI_Mockup.html'))).toBe(true);
});

it('permits exactly the reference script hash in the desktop CSP', () => {
  const text = readFileSync('DiagramAI_Mockup.html', 'utf8').replace(/\r\n/g, '\n');
  const script = text.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeDefined();
  const hash = createHash('sha256').update(script!).digest('base64');
  const config = JSON.parse(readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8'));
  expect(config.app.security.csp).toContain(`'sha256-${hash}'`);
  expect(config.app.security.csp).not.toContain("script-src 'self' 'unsafe-inline'");
});

import { describe, expect, it, vi } from 'vitest';
import { createHealthHandler } from '../../apps/api/src/health-handler';
import { checkHealth, healthUrl } from '@diagramai/shared';

const origin = 'https://example.github.io';
function fixture() {
  const queryDatabase = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return { queryDatabase, handler: createHealthHandler({ queryDatabase, allowedOrigins: [origin] }) };
}
function request(method = 'GET', from: string | null = origin, path = '/v1/health') {
  return new Request(`https://api.example${path}`, { method, headers: from ? { Origin: from } : {} });
}

describe('P0 health handler (injected database; not a live Neon test)', () => {
  it('queries the database before confirming success', async () => {
    const { handler, queryDatabase } = fixture();
    const response = await handler(request());
    expect(queryDatabase).toHaveBeenCalledExactlyOnceWith();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', apiVersion: 'v1', database: 'ok' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('answers preflight without querying the database', async () => {
    const { handler, queryDatabase } = fixture();
    const response = await handler(request('OPTIONS'));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(queryDatabase).not.toHaveBeenCalled();
  });
  it.each(['https://evil.example', 'https://example.github.io.evil.example', 'null'])('rejects origin %s before querying', async (from) => {
    const { handler, queryDatabase } = fixture();
    const response = await handler(request('GET', from));
    expect(response.status).toBe(403);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(queryDatabase).not.toHaveBeenCalled();
  });
  it('does not treat CORS as authentication: allows public CLI probe', async () => {
    const { handler } = fixture();
    expect((await handler(request('GET', null))).status).toBe(200);
  });
  it('fails closed when origin allowlist is empty', async () => {
    const handler = createHealthHandler({ queryDatabase: async () => {}, allowedOrigins: [] });
    expect((await handler(request())).status).toBe(403);
  });
  it('does not reflect wildcard or malformed configured origins', async () => {
    const handler = createHealthHandler({ queryDatabase: async () => {}, allowedOrigins: ['*', 'null', `${origin}/path`] });
    expect((await handler(request())).status).toBe(403);
  });
  it('hides database errors', async () => {
    const { handler, queryDatabase } = fixture();
    queryDatabase.mockRejectedValueOnce(new Error('secret postgres://user:password@host/db'));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/password|secret|postgres:\/\//);
  });
  it('rejects unrelated routes and methods without DB access', async () => {
    const { handler, queryDatabase } = fixture();
    expect((await handler(request('POST'))).status).toBe(405);
    expect((await handler(request('GET', origin, '/'))).status).toBe(404);
    expect(queryDatabase).not.toHaveBeenCalled();
  });
});

describe('public health client', () => {
  it('joins a public function base URL', () => {
    expect(healthUrl('https://api.example/')).toBe('https://api.example/v1/health');
    expect(healthUrl('http://localhost:8787')).toBe('http://localhost:8787/v1/health');
  });
  it.each(['http://api.example', 'https://user:secret@api.example', 'https://api.example/?token=abc', 'https://api.example/#secret'])('rejects unsafe base %s', (base) => {
    expect(() => healthUrl(base)).toThrow();
  });
  it('validates JSON rather than accepting any 200 page', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok' }));
    await expect(checkHealth('https://api.example', fetcher)).rejects.toThrow('Invalid health response');
  });
  it('accepts a valid response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok', apiVersion: 'v1', database: 'ok' }));
    await expect(checkHealth('https://api.example', fetcher)).resolves.toEqual({ status: 'ok', apiVersion: 'v1', database: 'ok' });
  });
  it('rejects non-success HTTP status', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    await expect(checkHealth('https://api.example', fetcher)).rejects.toThrow('503');
  });
});

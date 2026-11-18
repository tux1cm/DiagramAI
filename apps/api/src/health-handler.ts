import { API_VERSION } from '@diagramai/shared';

export interface HealthDependencies {
  queryDatabase: () => Promise<void>;
  allowedOrigins: readonly string[];
}

// A public connectivity probe, not authentication for future project APIs.
export function createHealthHandler({ queryDatabase, allowedOrigins }: HealthDependencies) {
  const origins = new Set(allowedOrigins.filter((origin) => {
    try { return new URL(origin).origin === origin && origin !== 'null'; } catch { return false; }
  }));
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin');
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
    const json = (value: unknown, status: number) => Response.json(value, { status, headers });
    if (origin && !origins.has(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    if (new URL(request.url).pathname !== '/v1/health') return json({ error: 'NOT_FOUND' }, 404);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Max-Age', '600');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET') {
      headers.set('Allow', 'GET, OPTIONS');
      return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    }
    try {
      await queryDatabase();
      return json({ status: 'ok', apiVersion: API_VERSION, database: 'ok' }, 200);
    } catch {
      // Do not serialize Postgres errors: they can contain hostnames/credentials.
      return json({ status: 'unavailable', apiVersion: API_VERSION, database: 'unavailable' }, 503);
    }
  };
}

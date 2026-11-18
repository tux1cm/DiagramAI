export const API_VERSION = 'v1';

export interface HealthResponse {
  status: 'ok';
  apiVersion: typeof API_VERSION;
  database: 'ok';
}

export function healthUrl(base: string): string {
  const url = new URL(base.endsWith('/') ? base : `${base}/`);
  if (url.username || url.password || url.search || url.hash) throw new Error('API URL must not contain credentials, query or fragment');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('API URL requires HTTPS (except local development)');
  }
  return new URL('v1/health', url).href;
}

export async function checkHealth(base: string, fetcher: typeof fetch = fetch): Promise<HealthResponse> {
  const response = await fetcher(healthUrl(base), {
    method: 'GET', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Health HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'ok' ||
    !('apiVersion' in body) || body.apiVersion !== API_VERSION || !('database' in body) || body.database !== 'ok') {
    throw new Error('Invalid health response');
  }
  return { status: 'ok', apiVersion: API_VERSION, database: 'ok' };
}

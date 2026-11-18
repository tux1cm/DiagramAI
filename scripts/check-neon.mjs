// No credentials accepted or printed. This is a live probe, not a unit test.
const base = process.env.DIAGRAMAI_HEALTH_BASE_URL;
const origin = process.env.DIAGRAMAI_TEST_ORIGIN;
if (!base || !origin) {
  console.error('BLOCKED: set DIAGRAMAI_HEALTH_BASE_URL and DIAGRAMAI_TEST_ORIGIN (real Pages origin).');
  process.exit(2);
}
const parsed = new URL(base.endsWith('/') ? base : `${base}/`);
if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
  throw new Error('Health base must be a public HTTPS URL without credentials/query/fragment');
}
if (new URL(origin).origin !== origin) throw new Error('Test origin must be exact, without a path');
const url = new URL('v1/health', parsed);
const headers = { Origin: origin };
const options = await fetch(url, {
  method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'content-type' },
  signal: AbortSignal.timeout(10000),
});
if (options.status !== 204 || options.headers.get('access-control-allow-origin') !== origin ||
  !options.headers.get('access-control-allow-methods')?.includes('GET') ||
  !options.headers.get('access-control-allow-headers')?.toLowerCase().includes('content-type')) {
  throw new Error(`Preflight FAIL (${options.status})`);
}
const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
const body = await response.json();
if (!response.ok || response.headers.get('access-control-allow-origin') !== origin ||
  body.status !== 'ok' || body.apiVersion !== 'v1' || body.database !== 'ok') throw new Error('GET health FAIL');
const rejected = await fetch(url, { headers: { Origin: 'https://untrusted.invalid' }, signal: AbortSignal.timeout(10000) });
if (rejected.status !== 403 || rejected.headers.has('access-control-allow-origin')) throw new Error('Origin rejection FAIL');
console.log('PASS: live health + PostgreSQL + preflight + disallowed origin. Still verify from a browser on the real Pages URL.');

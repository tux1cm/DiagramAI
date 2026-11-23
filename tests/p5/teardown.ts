export default async function teardown() {
  // Explicit HTTP cleanup also works on Windows, where killing a process tree
  // does not reliably deliver Node's SIGTERM handler.
  const response = await fetch('http://127.0.0.1:8787/__p5_test__/cleanup', { method: 'POST', signal: AbortSignal.timeout(30000) });
  if (response.status !== 204) throw new Error('P5 fixture cleanup did not finish. No broad deletion was attempted.');
}

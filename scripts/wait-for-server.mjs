import { setTimeout as delay } from 'node:timers/promises';

/** Child output is diagnostic; a successful HTTP response is the readiness signal. */
export async function waitForServer(server, url, { timeoutMs = 20000 } = {}) {
  let output = '',
    failure;
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-8000);
  };
  const exited = (code, signal) => {
    failure = new Error(`Dev server exited (${code ?? signal}).`);
  };
  const errored = (error) => {
    failure = error;
  };
  server.stdout?.on('data', capture);
  server.stderr?.on('data', capture);
  server.on('exit', exited);
  server.on('error', errored);
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (failure || server.exitCode !== null)
        throw failure ?? new Error(`Dev server exited (${server.exitCode}).`);
      try {
        const response = await globalThis.fetch(url, {
          signal: globalThis.AbortSignal.timeout(1000),
        });
        if (response.ok) {
          await response.body?.cancel();
          return;
        }
        await response.body?.cancel();
      } catch {
        /* Wait through connection-refused errors while the process binds its port. */
      }
      await delay(100);
    }
    throw new Error(`Dev server did not respond successfully at ${url} within ${timeoutMs}ms.`);
  } catch (error) {
    throw new Error(`${error.message}\n${output.trim()}`, { cause: error });
  } finally {
    server.stdout?.off('data', capture);
    server.stderr?.off('data', capture);
    server.off('exit', exited);
    server.off('error', errored);
  }
}

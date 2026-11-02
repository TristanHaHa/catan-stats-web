// @vitest-environment node
import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
// JavaScript helper is also used directly by the standalone browser test.
// @ts-expect-error The runner helper deliberately has no TypeScript compilation step.
import { waitForServer } from '../scripts/wait-for-server.mjs';

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const value = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return value;
}
it('recognizes a healthy server without depending on console banners', async () => {
  const address = await port();
  const child = spawn(
    process.execPath,
    [
      '-e',
      `require('node:http').createServer((req,res)=>{res.end('ready')}).listen(${address},'127.0.0.1')`,
    ],
    { stdio: 'pipe', windowsHide: true },
  );
  try {
    await expect(
      waitForServer(child, `http://127.0.0.1:${address}/`, { timeoutMs: 1200 }),
    ).resolves.toBeUndefined();
  } finally {
    child.kill();
    await once(child, 'exit');
  }
});
it('reports an early server exit with its stderr instead of a generic timeout', async () => {
  const address = await port();
  const child = spawn(
    process.execPath,
    ['-e', "console.error('readiness-fixture-error');process.exit(1)"],
    { stdio: 'pipe', windowsHide: true },
  );
  await expect(
    waitForServer(child, `http://127.0.0.1:${address}/`, { timeoutMs: 1200 }),
  ).rejects.toThrow('readiness-fixture-error');
});

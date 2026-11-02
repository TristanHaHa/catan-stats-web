/* global fetch, document, console */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = 'http://127.0.0.1:4175/catan-stats-web/';
try { await fetch(url); throw new Error('Port 4175 is already serving. Exit the existing launcher before testing.'); }
catch (error) { if (!(error instanceof TypeError)) throw error; }
const exe = path.resolve('Catan Stats.exe');
const server = spawn(exe, ['--no-browser'], { windowsHide: true, stdio: 'ignore' });
let browser;
try {
  let response;
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error(`Launcher exited with ${server.exitCode}`);
    try { response = await fetch(url); break; } catch { await delay(100); }
  }
  assert.equal(response?.status, 200);
  assert.match(await response.text(), /Settler’s Ledger/);
  assert.match(await (await fetch(url + 'LICENSE.txt')).text(), /Copyright \(c\) 2020 Tristan Ha/);
  assert.equal((await fetch(url + 'missing')).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  const second = spawn(exe, ['--no-browser'], { windowsHide: true, stdio: 'ignore' });
  const [code] = await once(second, 'exit'); assert.equal(code, 0); assert.equal(server.exitCode, null);
  browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()}: ${r.url()}`); });
  await page.goto(url);
  await page.getByRole('button', { name: /Play on this device/ }).click();
  await page.getByRole('button', { name: /Start game/ }).click();
  await page.getByRole('button', { name: 'Roll dice', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.is-rolling'));
  assert.equal(await page.locator('.dice-pair .die').count(), 2);
  await page.reload();
  assert.equal(await page.locator('.dice-pair .die').count(), 2);
  assert.deepEqual(failures, []);
  console.log('Launcher passed: embedded assets, gameplay, reload, single instance, 404 and method checks.');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}

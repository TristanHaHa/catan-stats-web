import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { waitForServer } from './wait-for-server.mjs';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
const real = process.env.LEDGER_REAL_FIREBASE === 'true';
const config = JSON.parse(
  readFileSync(new URL('../src/multiplayer/firebase-public.json', import.meta.url), 'utf8'),
);
const projectId = 'demo-settlers-ledger';
let browser, server;
try {
  // Drive the actual frontend with two isolated browsers and a demo-only project.
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
    {
      env: {
        ...process.env,
        VITE_FIREBASE_API_KEY: real ? config.apiKey : 'demo-key',
        VITE_FIREBASE_AUTH_DOMAIN: real ? config.authDomain : `${projectId}.firebaseapp.com`,
        VITE_FIREBASE_PROJECT_ID: real ? config.projectId : projectId,
        VITE_FIREBASE_APP_ID: real ? config.appId : 'demo-app',
        VITE_FIREBASE_EMULATORS: real ? 'false' : 'true',
      },
      stdio: 'pipe',
      windowsHide: true,
    },
  );
  await waitForServer(server, 'http://127.0.0.1:5174/catan-stats-web/');
  browser = await chromium.launch();
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await contextA.newPage(),
    b = await contextB.newPage();
  const base = 'http://127.0.0.1:5174/catan-stats-web/';
  await a.goto(base);
  await a.getByRole('button', { name: 'Create a shared table', exact: true }).click();
  await a.getByLabel('Your name at the table').fill(real ? 'Provisioning QA Host' : 'Tristan');
  await a.getByRole('button', { name: 'Create shared table →' }).click();
  await a.locator('.room-code').waitFor();
  const uiCode = await a.locator('.room-code').innerText();
  await b.goto(`${base}?room=${uiCode}`);
  await b.getByLabel('Your display name').fill('Clara');
  await b.getByRole('button', { name: 'Join the table →' }).click();
  await b.getByRole('button', { name: 'Request seat', exact: true }).first().waitFor();
  await b.getByRole('button', { name: 'Request seat', exact: true }).first().click();
  await a.getByRole('button', { name: 'Approve seat', exact: true }).click();
  await a.getByRole('button', { name: 'Open the table · start game →' }).click();
  await b.getByRole('button', { name: 'Back to play →' }).click();
  await b.getByRole('button', { name: 'Record 7', exact: true }).click();
  await a.locator('.roll-display strong').filter({ hasText: '7' }).waitFor();
  await b.getByRole('button', { name: 'Start timer', exact: true }).click();
  await b.getByRole('button', { name: 'Next turn →' }).click();
  await a.locator('.active-player').filter({ hasText: 'Player 2' }).waitFor();
  assert.equal(await b.getByRole('button', { name: 'Record 7', exact: true }).isDisabled(), true);
  await a.screenshot({ path: 'test-results/multiplayer.png', fullPage: true });
  await contextB.setOffline(true);
  await b.getByRole('status').filter({ hasText: 'Offline' }).waitFor();
  assert.equal(await b.getByRole('button', { name: 'Roll dice', exact: true }).isDisabled(), true);
  await contextB.setOffline(false);
  await b.reload();
  await b.getByLabel('Your display name').fill('Clara');
  await b.getByRole('button', { name: 'Join the table →' }).click();
  await b.getByRole('button', { name: 'Back to play →' }).click();
  await b.locator('.active-player').filter({ hasText: 'Player 2' }).waitFor();
  assert.equal(await b.getByRole('button', { name: 'Record 7', exact: true }).isDisabled(), true);
  console.log(
    'PASS two-browser UI: room creation, invitation, spectator request, host approval, live roll/turn sync, waiting permissions, offline lock, reconnect',
  );
  if (real) {
    await a
      .getByRole('navigation', { name: 'Game navigation' })
      .getByRole('button', { name: 'Game room', exact: true })
      .click();
    await a.getByRole('button', { name: 'End game', exact: true }).click();
    await a.getByRole('button', { name: 'Confirm end game' }).click();
    await a.getByRole('heading', { name: 'A game well spent.' }).waitFor();
    console.log(`PASS production Spark project ${config.projectId}: QA room ${uiCode} completed.`);
  }
} finally {
  await browser?.close();
  server?.kill();
}

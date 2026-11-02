/* global navigator, document, innerWidth, HTMLElement, window */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { waitForServer } from './wait-for-server.mjs';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
const external = process.env.LEDGER_BASE_URL;
const real = !!external || process.env.LEDGER_REAL_FIREBASE === 'true';
const captures = real ? 'test-results' : 'docs';
const config = JSON.parse(
  readFileSync(new URL('../src/multiplayer/firebase-public.json', import.meta.url), 'utf8'),
);
const projectId = 'demo-settlers-ledger';
let browser, server;
try {
  // Drive the actual frontend with two isolated browsers and a demo-only project.
  if (!external) {
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
  }
  browser = await chromium.launch();
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await contextA.newPage(),
    b = await contextB.newPage();
  const base = external || 'http://127.0.0.1:5174/catan-stats-web/';
  await a.goto(base);
  await a.getByLabel('Your name', { exact: true }).fill(real ? 'Provisioning QA Host' : 'Tristan');
  await a.getByRole('button', { name: 'Create lobby' }).click();
  await a.locator('.room-code').waitFor();
  const uiCode = await a.locator('.room-code').innerText();
  assert.deepEqual(
    (await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
    [],
    'Host lobby accessibility',
  );
  await a.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await a.screenshot({ path: `${captures}/shared-lobby.png`, fullPage: true });
  await a.setViewportSize({ width: 390, height: 844 });
  assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await a.screenshot({ path: `${captures}/shared-lobby-mobile.png`, fullPage: true });
  await a.setViewportSize({ width: 1440, height: 1000 });
  await contextA.grantPermissions(['clipboard-read', 'clipboard-write']);
  await a.getByRole('button', { name: 'Copy invite link', exact: true }).click();
  await a.getByRole('status').filter({ hasText: 'Invite link copied' }).waitFor();
  const invitation = await a.evaluate(() => navigator.clipboard.readText());
  assert.equal(invitation, `${base}?room=${uiCode}`);
  await b.goto(invitation);
  await b.getByLabel('Your display name').fill('Clara');
  await b.getByRole('button', { name: 'Join lobby' }).click();
  await b.getByRole('button', { name: 'Play as Player 1 (seat 1)', exact: true }).waitFor();
  assert.match(uiCode, /^[0-9]{4}$/);
  assert.equal(await b.locator('.invitation-strip').count(), 0, 'Guests have no sharing panel');
  assert.equal(await b.getByRole('button', { name: 'Copy invite link', exact: true }).count(), 0);
  assert.equal(await b.getByRole('list', { name: 'Players and connection status' }).count(), 1);
  assert.deepEqual(
    (await new AxeBuilder({ page: b }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
    [],
    'Guest lobby accessibility',
  );
  await a.getByLabel('Seat 1 name').fill('Clara');
  await b.getByRole('button', { name: 'Play as Clara (seat 1)', exact: true }).waitFor();
  await b.getByRole('button', { name: 'Play as Clara (seat 1)', exact: true }).click();
  await b.getByText('Your player', { exact: true }).waitFor();
  await a.getByLabel('Seat 1 name').fill('Clara Rose');
  await b.getByRole('heading', { name: 'Clara Rose', exact: true }).waitFor();
  await b.getByText('Your player', { exact: true }).waitFor();
  await a.getByLabel('Seat 4 name').fill('Morgan');
  assert.equal(
    await a.getByRole('button', { name: 'Start game →', exact: true }).isDisabled(),
    true,
  );
  await b.getByRole('heading', { name: 'Morgan', exact: true }).waitFor();
  await a.getByText('Player changes saved.', { exact: false }).waitFor();
  await a.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await a.screenshot({ path: `${captures}/shared-lobby.png`, fullPage: true });
  await b.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await b.screenshot({ path: `${captures}/shared-lobby-mobile.png`, fullPage: true });
  await a.getByRole('button', { name: 'Start game →' }).click();
  await b.getByRole('button', { name: 'Go to game →' }).click();
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
  await b.getByRole('button', { name: 'Join lobby' }).click();
  await b.getByRole('button', { name: 'Go to game →' }).click();
  await b.locator('.active-player').filter({ hasText: 'Player 2' }).waitFor();
  assert.equal(await b.getByRole('button', { name: 'Record 7', exact: true }).isDisabled(), true);
  console.log(
    'PASS two-browser UI: room creation, invitation, live player names, direct player selection, unified presence, host-only sharing, live roll/turn sync, waiting permissions, offline lock, reconnect',
  );
  await b
    .getByRole('navigation', { name: 'Game navigation' })
    .getByRole('button', { name: 'Room', exact: true })
    .click();
  await b.getByRole('button', { name: 'Leave room', exact: true }).click();
  await a
    .getByRole('navigation', { name: 'Game navigation' })
    .getByRole('button', { name: 'Game room', exact: true })
    .click();
  await a.locator('.lobby-player').first().getByText('Disconnected', { exact: true }).waitFor();
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

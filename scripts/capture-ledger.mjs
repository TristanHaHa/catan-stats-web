/* global document */
import { chromium } from '@playwright/test';
import process from 'node:process';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.install({ time: new Date('2026-11-01T20:30:00Z') });
  await page.clock.pauseAt(new Date('2026-11-01T20:30:00Z'));
  await page.goto(process.env.LEDGER_CAPTURE_URL || 'http://127.0.0.1:5173/catan-stats-web/');
  await page.evaluate(() => document.fonts.ready);
  const capture = async name => {
    await page.mouse.move(0, 0);
    return page.screenshot({ path: `docs/${name}.png`, fullPage: true, animations: 'disabled', caret: 'hide' });
  };
  const nav = name => page.getByRole('navigation', { name: 'Game navigation' }).getByRole('button', { name, exact: true }).click();
  await capture('home');
  await page.getByRole('button', { name: /Play on this device/ }).click();
  for (const [i, name] of ['Tristan','Clara','Sam','Maya'].entries()) await page.getByLabel(`Seat ${i + 1} name`).fill(name);
  await capture('setup');
  await page.getByRole('button', { name: 'Start game →' }).click();
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  for (const [i, total] of [7,8,4,6,9,5,8,6,10,7,3,11,8,6,9,5,12,7,6,4].entries()) {
    await page.getByRole('button', { name: `Record ${total}`, exact: true }).click();
    await page.clock.fastForward(24000 + i % 4 * 11000);
    await page.getByRole('button', { name: 'Next turn →' }).click();
  }
  await page.getByRole('button', { name: 'Record 8', exact: true }).click();
  await page.clock.fastForward(45000);
  await capture('dashboard');
  await page.getByRole('button', { name: 'Switch to Dark Walnut theme' }).click();
  await capture('walnut');
  await page.getByRole('button', { name: 'Switch to Parchment theme' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav('Insights'); await capture('insights');
  await nav('History'); await page.getByRole('button', { name: 'Previous roll' }).click(); await capture('history');
  await nav('Game room'); await capture('room');
  await page.getByRole('button', { name: 'End game', exact: true }).click(); await page.getByRole('button', { name: 'Confirm end game' }).click(); await capture('recap');
} finally { await browser.close(); }

import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const navigation = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Game navigation' })
    .getByRole('button', { name, exact: true });
test('lobby is the same first screen at mobile, tablet, and desktop widths', async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Game lobby', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'walnut');
    await expect(page.getByRole('tab', { name: 'Host a game' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('tab', { name: 'Host a game' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Join a game' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Room code' })).toBeVisible();
  await page.goto('./?room=0042');
  await expect(page.getByRole('heading', { name: 'Game lobby', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Join a game' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Room code')).toHaveValue('0042');
  await expect(page.getByRole('button', { name: 'Join lobby', exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('ledger.room', '123456ABCDEF');
    localStorage.setItem('ledger.name', 'Alex');
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Rejoin lobby', exact: true }).click();
  await expect(page.getByLabel('Room code')).toHaveValue('123456ABCDEF');
  await expect(page.getByRole('textbox', { name: 'Your display name', exact: true })).toHaveValue(
    'Alex',
  );
});
test('saved games return to the lobby and resume only on request', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Record 7', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Game lobby', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume game', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.locator('.roll-display strong')).toHaveText('7');
  await navigation(page, 'History').click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Live game', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lobby', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game lobby', exact: true })).toBeFocused();
  await page.getByRole('radio', { name: /One device/ }).click();
  await page.getByRole('button', { name: 'Start game →', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Replace saved game');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('catan-stats.session.v1')!).rolls[0].total,
    ),
  ).toBe(7);
});
async function setup(page: Page, seats = 4) {
  await page.goto('./');
  await page.getByRole('radio', { name: /One device/ }).click();
  await page.locator('.roster-details.collapsible summary').click();
  for (let i = 4; i < seats; i++)
    await page.getByRole('button', { name: '+ Add player', exact: true }).click();
  await page.getByLabel('Seat 1 name').fill('Alex');
  await page.getByLabel('Seat 2 name').fill('Alex');
  await page.getByRole('button', { name: 'Start game →', exact: true }).click();
}
for (const seats of [4, 8])
  test(`${seats} player complete ledger workflow`, async ({ page }) => {
    await setup(page, seats);
    await expect(page.getByRole('button', { name: 'Next turn →' })).toBeDisabled();
    await page.getByRole('button', { name: 'Roll dice', exact: true }).click();
    await page.getByRole('button', { name: 'Record 7', exact: true }).click();
    await page.getByRole('button', { name: 'Record 12', exact: true }).click();
    await navigation(page, 'History').click();
    await expect(page.getByRole('navigation', { name: 'Roll history' })).toContainText('3 / 3');
    await page.getByRole('button', { name: 'Previous roll' }).click();
    await expect(page.locator('.roll-display strong')).toHaveText('7');
    await navigation(page, 'Live table').click();
    await page.getByRole('button', { name: 'Start timer', exact: true }).click();
    await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
    const paused = await page.getByLabel('Elapsed turn time').textContent();
    await page.reload();
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await expect(page.getByLabel('Elapsed turn time')).toHaveText(paused!);
    await page.getByRole('button', { name: 'Resume timer', exact: true }).click();
    for (let i = 0; i < seats; i++) await page.getByRole('button', { name: 'Next turn →' }).click();
    await expect(page.locator('.active-player')).toContainText('Seat 1');
    await expect(page.locator('.active-player')).toContainText('Alex');
    await page.reload();
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause timer', exact: true })).toBeEnabled();
    await expect(page.locator('.live-heading')).toContainText(`${seats} completed turns`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await navigation(page, 'Game room').click();
    await page.getByRole('button', { name: 'Reset game', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'End game', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm end game' }).click();
    await expect(page.getByRole('heading', { name: 'A game well spent.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'A game well spent.' })).toBeFocused();
    await navigation(page, 'Game room').click();
    await page.getByRole('button', { name: 'Reset game', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm reset game' }).click();
    await navigation(page, 'Live table').click();
    await expect(page.locator('.live-heading')).toContainText(
      `${seats} players · 0 completed turns`,
    );
    await navigation(page, 'Game room').click();
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm new game' }).click();
    await page.locator('.roster-details.collapsible summary').click();
    await expect(page.getByRole('textbox', { name: /Seat .* name/ })).toHaveCount(seats);
  });
test('corrupt saves are preserved and competing local writers are detected', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('catan-stats.session.v1', '{broken'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your saved game needs attention' }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('catan-stats.session.v1'))).toBe('{broken');
  await page.getByRole('button', { name: 'Discard saved data', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm discard saved data' }).click();
  await page.getByRole('radio', { name: /One device/ }).click();
  await page.getByRole('button', { name: 'Start game →' }).click();
  const other = await context.newPage();
  await other.goto('./');
  await other.getByRole('button', { name: 'Resume game', exact: true }).click();
  await other.getByRole('button', { name: 'Record 7', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Another tab');
  await page.getByRole('button', { name: 'Record 12', exact: true }).click();
  await page.getByRole('button', { name: 'Reload saved session' }).click();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.locator('.roll-display strong')).toHaveText('7');
});
test('wall-clock restoration, pause exclusion, correct arithmetic, keyboard confirmation', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-12T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-12T12:00:01Z'));
  await setup(page);
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await page.clock.fastForward(10000);
  await expect(page.getByLabel('Elapsed turn time')).toHaveText('0:10');
  await page.reload();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.getByLabel('Elapsed turn time')).toHaveText('0:10');
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  await page.clock.fastForward(20000);
  await page.reload();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.getByLabel('Elapsed turn time')).toHaveText('0:10');
  await page.getByRole('button', { name: 'Resume timer', exact: true }).click();
  await page.clock.fastForward(5000);
  await page.getByRole('button', { name: 'Next turn →' }).click();
  await navigation(page, 'Insights').click();
  await expect(page.getByRole('table').last()).toContainText('15.0s');
  await navigation(page, 'Game room').click();
  await page.getByRole('button', { name: 'Reset game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset game', exact: true })).toBeFocused();
});
test('storage errors leave the game playable and visibly unsaved', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await setup(page);
  await expect(page.getByRole('status')).toContainText('Changes are not saved');
  await page.getByRole('button', { name: 'Record 7', exact: true }).click();
  await expect(page.locator('.roll-display strong')).toHaveText('7');
  await expect(page.getByRole('status')).toContainText('Changes are not saved');
});
test('generated dice record once, while manual entry and reduced motion stay immediate', async ({
  page,
}) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await setup(page);
  const button = page.getByRole('button', { name: 'Roll dice', exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.locator('.dice-pair .die')).toHaveCount(2);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('catan-stats.session.v1')!),
  );
  expect(saved.rolls).toHaveLength(1);
  expect(saved.phase).toBe('ready');
  expect(saved.completedTurns).toHaveLength(0);
  expect(saved.rolls[0].total).toBe(saved.rolls[0].dice[0] + saved.rolls[0].dice[1]);
  await page.clock.fastForward(540);
  await expect(button).toBeEnabled();
  await expect(page.locator('.roll-display strong')).toHaveText(String(saved.rolls[0].total));
  await page.getByRole('button', { name: 'Record 7', exact: true }).click();
  await expect(page.locator('.roll-display strong')).toHaveText('7');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button.click();
  await expect(page.locator('.is-rolling')).toHaveCount(0);
  await expect(button).toBeEnabled();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('catan-stats.session.v1')!).rolls.length,
    ),
  ).toBe(3);
});
test('history inspection never writes state and traverses the entire roll log', async ({
  page,
}) => {
  await setup(page);
  for (const total of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    await page.getByRole('button', { name: `Record ${total}`, exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem('catan-stats.session.v1'));
  await navigation(page, 'History').click();
  const log = page.getByRole('list', { name: 'Recorded rolls' });
  await expect(log.getByRole('listitem')).toHaveCount(8);
  await expect(log.getByRole('button').first()).toContainText('#10');
  await log.getByRole('button').filter({ hasText: '#3' }).click();
  await expect(log.locator('[aria-current=true]')).toContainText('#3');
  await page.getByRole('button', { name: 'Previous roll' }).click();
  await page.getByRole('button', { name: 'Previous roll' }).click();
  await expect(log.locator('[aria-current=true]')).toContainText('#1');
  await expect(page.getByRole('button', { name: 'Previous roll' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('catan-stats.session.v1'))).toBe(saved);
  await page.getByRole('button', { name: 'Back to latest' }).click();
  await expect(page.locator('.history-view')).toHaveText('Latest roll #10');
});
test('midgame additions, correction, undo, and theme persistence', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Record 7', exact: true }).click();
  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await navigation(page, 'Game room').click();
  await page.getByRole('button', { name: '+ Add player', exact: true }).click();
  await page.getByRole('button', { name: 'Save roster', exact: true }).click();
  await page.getByRole('button', { name: 'Correct roll', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm correct roll' }).click();
  await page.getByRole('button', { name: 'Undo latest roll', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm undo latest roll' }).click();
  await navigation(page, 'Live table').click();
  await expect(page.locator('.live-heading')).toContainText('5 players');
  await expect(page.getByRole('button', { name: 'Pause timer', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Switch to Parchment theme' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');
  await navigation(page, 'History').click();
  await expect(page.locator('.event-timeline')).toContainText('Host removed latest roll');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('both themes and main views pass automated accessibility checks', async ({ page }) => {
  await page.goto('./');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('radio', { name: /One device/ }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Start game →' }).click();
  for (const theme of ['walnut', 'parchment']) {
    if (theme === 'parchment')
      await page.getByRole('button', { name: 'Switch to Parchment theme' }).click();
    for (const name of ['Live table', 'Insights', 'History', 'Game room']) {
      await navigation(page, name).click();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations, `${theme} ${name}`).toEqual([]);
    }
  }
});

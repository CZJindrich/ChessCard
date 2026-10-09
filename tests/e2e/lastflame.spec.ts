/**
 * Last Flame end to end, with no console errors:
 * - Quick Last Flame (you and two Warden bots on 10×10): the Last Flame layout (Truce chip, the
 *   Gloam Bell, Glory on the plaques, the Snuff drawer), a move and End Turn, and the bots taking
 *   their turns until it is yours again.
 * - Hot-seat Last Flame (two players on one screen, `hot_seat_privacy` on): a Pass screen veils
 *   the hand before each player's turn.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickTile, gameFacts, seedStorage, startOneClick, waitIdle, watchErrors } from './helpers';

/** Night setup: every seat on this screen presses Ready (hot-seat: one after the other). */
async function readyAll(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const facts = await gameFacts(page);
    if (facts.phase !== 'night_setup') return;
    const ready = page.getByTestId('ready');
    if (!(await ready.isVisible().catch(() => false))) {
      await page.waitForTimeout(300);
      continue;
    }
    await ready.click();
    await page.waitForTimeout(300);
  }
}

/** Wait for the local player's seat turn (bots may act first). */
async function waitForMyTurn(page: Page, seat = 0): Promise<void> {
  await page.waitForFunction(
    (me) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.result !== null || (s.latest.phase === 'players' && s.uiSeat === me));
    },
    seat,
    { timeout: 90_000 },
  );
}

test('Quick Last Flame: the layout, a move, End Turn, and the bots act', async ({ page }) => {
  test.setTimeout(150_000);
  const problems = watchErrors(page);
  await seedStorage(page, { games: 3, presentation: { animation_speed: 3, enemy_turn_speed: 'instant', confirm_end_turn: 'never' } });
  await startOneClick(page, 'quick_last_flame', 'Velveteen');
  await expect(page.getByTestId('night-title')).toContainText('Night 1', { timeout: 5_000 });
  await expect(page.getByTestId('night-title')).toBeHidden({ timeout: 5_000 });
  await readyAll(page);
  await waitForMyTurn(page);

  // The Last Flame frame: Truce on Night 1, the Gloam Bell, Glory and First Light on the plaques,
  // and the right rail folded into a drawer.
  await expect(page.getByTestId('truce')).toBeVisible();
  await expect(page.getByTestId('gloam-bell')).toBeVisible();
  for (const seat of [0, 1, 2]) await expect(page.getByTestId(`glory-${seat}`)).toBeVisible();
  await expect(page.locator('[data-testid^="first-light-"]')).toHaveCount(1);
  await expect(page.getByTestId('snuff-drawer')).toHaveCount(0);
  await page.getByTestId('drawer-tab').click();
  await expect(page.getByTestId('snuff-drawer')).toBeVisible();
  await page.getByTestId('drawer-tab').click();
  await expect(page.getByTestId('snuff-drawer')).toHaveCount(0);

  // Move the hero to its first gold dot.
  const hero = await page.evaluate(() => {
    const ww = window.__ww;
    const s = ww?.controller.getSnapshot();
    const id = s?.latest.players[0].heroPieceId ?? '';
    return { id, pos: s?.latest.pieces[id]?.pos ?? null };
  });
  if (!hero.pos) throw new Error('no hero on the board');
  await clickTile(page, hero.pos);
  const move = await page.evaluate((id) => window.__ww?.controller.highlightsFor(id)?.moves[0] ?? null, hero.id);
  if (move) {
    await clickTile(page, move.pos);
    await expect.poll(() => page.evaluate((id) => window.__ww?.controller.getSnapshot().latest.pieces[id]?.pos, hero.id)).toEqual(move.to);
  }

  // End the turn: the bots act (their plaques say so in the log) and the round comes back to you.
  const before = await gameFacts(page);
  const logBefore = await page.evaluate(() => window.__ww?.controller.getSnapshot().latest.log.length ?? 0);
  await page.getByTestId('end-turn').click();
  await page.waitForFunction(
    ({ round, night }) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.result !== null || (s.latest.phase === 'players' && s.uiSeat === 0 && (s.latest.round > round || s.latest.night > night)));
    },
    { round: before.round, night: before.night },
    { timeout: 120_000 },
  );
  const turns = await page.evaluate((from) => (window.__ww?.controller.getSnapshot().latest.log ?? []).slice(from).filter((e) => /takes the turn/.test(e.text)).map((e) => e.text), logBefore);
  expect(turns.some((t) => /Warden/.test(t)), `bot turns in the log: ${turns.join(' | ')}`).toBe(true);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('hot-seat Last Flame: a Pass screen hides the hand before each player turn', async ({ page }) => {
  test.setTimeout(150_000);
  const problems = watchErrors(page);
  await seedStorage(page, { games: 3, presentation: { animation_speed: 3, enemy_turn_speed: 'instant', confirm_end_turn: 'never' } });
  await page.goto('./');
  await page.getByRole('button', { name: /New Game/ }).first().click();
  await page.getByRole('radio', { name: /Last Flame/ }).first().click();
  // Two players on this screen (the default seat plus one), and one bot so the Trial has three.
  await page.getByRole('button', { name: /Add player/ }).click();
  await expect(page.getByTestId('hot-seat-privacy')).toBeVisible();
  await expect(page.getByTestId('hot-seat-privacy').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByTestId('game-screen').waitFor();
  await expect(page.getByTestId('night-title')).toBeHidden({ timeout: 5_000 });
  await readyAll(page);

  const veil = page.getByTestId('pass-screen');
  const names = new Set<string>();
  for (let turn = 0; turn < 2; turn++) {
    await expect(veil).toBeVisible({ timeout: 60_000 });
    // Behind the veil no card is shown and keys do nothing.
    await page.keyboard.press(' ');
    await expect(veil).toBeVisible();
    const title = (await veil.getByRole('heading').textContent()) ?? '';
    names.add(title);
    await veil.getByRole('button', { name: /^I am / }).click();
    await expect(veil).toBeHidden();
    await expect(page.locator('.ww-hand-card').first()).toBeVisible();
    await waitIdle(page, 'players');
    await page.getByTestId('end-turn').click();
  }
  expect(names.size, [...names].join(' | ')).toBe(2);
  expect(problems, problems.join('\n')).toEqual([]);
});

/**
 * The Boss Night end to end, with no console errors. A crafted state (loaded through
 * `window.__ww`) skips to the last regular Night's end; the Chandlery leads into the Boss Night:
 * - the boss intro (name, epithet, weakness), one full round against the boss (its HP bar,
 *   intents in the queue, End Turn, the Snuff Strike), then the boss struck down at 1 HP and
 *   Dawn Breaks, whose MVP line agrees with the stat tiles;
 * - defeat on the Boss Night (the boss's toll fills the Hour Candle): The Long Night Falls, and
 *   Retry this Night brings the Boss Night back.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickTile, craft, seedStorage, startOneClick, waitIdle, watchErrors } from './helpers';

/** From Night 1's players phase: on to the Boss Night with `bossId`, its intro on screen. */
async function toBossNight(page: Page, bossId: string): Promise<void> {
  await expect(page.getByTestId('night-title')).toBeHidden({ timeout: 5_000 });
  await page.getByTestId('ready').click();
  await waitIdle(page, 'players');
  await craft(page, `st.night = st.config.nights - 1; st.round = st.roundsThisNight; st.vigil.dread = 0; st.config = { ...st.config, boss_choice: '${bossId}' };`);
  await page.getByTestId('end-turn').click();
  const chandlery = page.getByTestId('chandlery');
  const keep = page.getByRole('button', { name: /^Keep \d/ });
  await expect(chandlery.or(keep)).toBeVisible({ timeout: 60_000 });
  if (await keep.isVisible()) await keep.click();
  await expect(chandlery).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Skip the draft/ }).click();
  await page.getByRole('button', { name: 'No Boon' }).click();
  await waitIdle(page, 'night_setup');
  await expect(page.getByTestId('night-title')).toBeHidden({ timeout: 5_000 });
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('boss-intro')).toBeVisible({ timeout: 20_000 });
}

test('the Boss Night: intro, a round against the boss, then Dawn Breaks', async ({ page }) => {
  test.setTimeout(150_000);
  const problems = watchErrors(page);
  await seedStorage(page, { games: 3 });
  await startOneClick(page, 'quick_play', 'Brannoc');
  await toBossNight(page, 'guttered_king');

  const intro = page.getByTestId('boss-intro');
  await expect(intro).toContainText('The Guttered King');
  await expect(intro).toContainText('Monarch of Melted Wax');
  await expect(intro).toContainText('Weakness:');
  await page.keyboard.press(' ');
  await expect(intro).toBeHidden();
  await waitIdle(page, 'players');

  // A round against the boss: its HP bar and escape count, its intents queued; End Turn.
  await expect(page.getByTestId('boss-bar')).toBeVisible();
  await expect(page.getByText(/Escapes: \d|Boxed in!/)).toBeVisible();
  const round = await page.evaluate(() => window.__ww?.controller.getSnapshot().latest.round ?? 0);
  await page.getByTestId('end-turn').click();
  await page.waitForFunction(
    (r) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.result !== null || (s.latest.phase === 'players' && s.latest.round > r));
    },
    round,
    { timeout: 60_000 },
  );

  // The boss at 1 HP with Brannoc beside it: strike it down.
  await craft(
    page,
    `st.vigil.dread = 0; const b = st.pieces[st.boss.pieceId]; b.hp = 1; const h = st.pieces[st.players[0].heroPieceId]; h.smoldering = false; h.hp = Math.max(1, h.hp);
     const taken = new Set(Object.values(st.pieces).filter((p) => p.id !== h.id).flatMap((p) => { const o = []; for (let dx = 0; dx < p.size; dx++) for (let dy = 0; dy < p.size; dy++) o.push((p.pos.x + dx) + ',' + (p.pos.y + dy)); return o; }));
     const spots = [[b.pos.x, b.pos.y - 1], [b.pos.x + 1, b.pos.y - 1], [b.pos.x - 1, b.pos.y], [b.pos.x + 2, b.pos.y], [b.pos.x, b.pos.y + 2], [b.pos.x - 1, b.pos.y + 1]];
     const free = spots.find(([x, y]) => x >= 0 && y >= 0 && x < st.board.w && y < st.board.h && !taken.has(x + ',' + y) && st.board.tiles[y * st.board.w + x].type !== 'pillar');
     h.pos = { x: free[0], y: free[1] }; h.movesLeft = 1; h.strikesLeft = 1; h.exhausted = false;`,
  );
  await waitIdle(page, 'players');
  const target = await page.evaluate(() => {
    const ww = window.__ww;
    const s = ww?.controller.getSnapshot();
    const heroId = s?.latest.players[0].heroPieceId ?? '';
    return { hero: s?.latest.pieces[heroId].pos, strike: ww?.controller.highlightsFor(heroId)?.strikes[0]?.pos };
  });
  if (!target.hero || !target.strike) throw new Error('no strike on the boss');
  await clickTile(page, target.hero);
  await clickTile(page, target.strike);

  const over = page.getByTestId('game-over');
  await expect(over).toBeVisible({ timeout: 30_000 });
  await expect(over).toHaveAttribute('data-outcome', 'victory');
  await expect(over.getByText('Dawn Breaks')).toBeVisible();
  for (const label of ['Play Again', 'Same Seed', 'Change Hero', 'Main Menu']) await expect(over.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  // The MVP's numbers are a share of the team's stat tiles.
  const stats = await page.evaluate(() => {
    const tile = (label: string): number => Number(Array.from(document.querySelectorAll('.ww-finale__stat')).find((el) => el.querySelector('dt')?.textContent === label)?.querySelector('dd')?.textContent ?? 'NaN');
    const line = document.querySelector('.ww-finale__mvp-line')?.textContent ?? '';
    return { kills: tile('Snuff slain'), damage: tile('Damage'), line };
  });
  const mvp = /^(\d+)(?: of the \d+)? kills? · (\d+) damage$/.exec(stats.line);
  expect(mvp, stats.line).not.toBeNull();
  if (mvp) {
    expect(Number(mvp[1])).toBeLessThanOrEqual(stats.kills);
    expect(Number(mvp[2])).toBeLessThanOrEqual(stats.damage);
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

test('the Boss Night lost: The Long Night Falls, and Retry this Night brings it back', async ({ page }) => {
  test.setTimeout(150_000);
  const problems = watchErrors(page);
  await seedStorage(page, { games: 3 });
  await startOneClick(page, 'quick_play', 'Brannoc');
  await toBossNight(page, 'hush_hierophant');
  await page.keyboard.press(' ');
  await waitIdle(page, 'players');

  // One Dread short: the boss's toll at this round's Tally fills the Hour Candle.
  await craft(page, 'st.vigil.dread = st.vigil.dreadMax - 1;');
  await waitIdle(page, 'players');
  await page.getByTestId('end-turn').click();
  const over = page.getByTestId('game-over');
  await expect(over).toBeVisible({ timeout: 60_000 });
  await expect(over).toHaveAttribute('data-outcome', 'defeat');
  await expect(over.getByText('The Long Night Falls')).toBeVisible({ timeout: 10_000 });
  await over.getByTestId('retry-night').click();
  await expect(over).toBeHidden();
  // The Boss Night starts again from its setup, and its intro plays again.
  await page.getByTestId('ready').click({ timeout: 30_000 });
  await expect(page.getByTestId('boss-intro')).toBeVisible({ timeout: 20_000 });
  expect(problems, problems.join('\n')).toEqual([]);
});

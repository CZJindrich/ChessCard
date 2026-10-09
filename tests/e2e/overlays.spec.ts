/**
 * The game's big moments end to end, with no console errors: the Chandlery after Night 1 and
 * The Long Night Falls with Retry this Night (the Boss Night has its own spec, boss.spec.ts).
 * Long stretches (the rest of a Night) are skipped by loading a crafted state through
 * `window.__ww`; every decision on screen is a real click.
 */
import { expect, test, type Page } from '@playwright/test';
import type { GameController } from '../../src/game';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __ww?: { controller: GameController; load: (state: GameState) => void };
  }
}

/** Later-game profile (Tolls, Moth Die and Boons on), every tip already seen, fast enemy turns. */
async function seedStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('chesscard.profile', JSON.stringify({ version: 1, playerName: 'Ash', gamesCompleted: 3 }));
    localStorage.setItem('chesscard.presentation', JSON.stringify({ animation_speed: 3, enemy_turn_speed: 'fast', confirm_end_turn: 'never' }));
    const tips = ['plume', 'dread', 'push', 'bump', 'hot_wax', 'chimney', 'shrine', 'ward', 'dazed', 'aimed', 'smoldering', 'toll', 'moth_die', 'chandlery', 'boss_phase', 'crown', 'check', 'gloam_warning', 'lit_shrine'];
    localStorage.setItem('chesscard.tips', JSON.stringify(tips));
  });
}

function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  return problems;
}

async function startQuickPlay(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick Play/ }).first().click();
  await page.getByRole('button', { name: /Play as Brannoc/ }).click();
  await expect(page.getByTestId('game-screen')).toBeVisible();
  await expect(page.getByTestId('night-title')).toBeHidden({ timeout: 5_000 });
}

async function waitFor(page: Page, phase: string): Promise<void> {
  await page.waitForFunction(
    (ph) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.phase === ph || s.latest.result !== null);
    },
    phase,
    { timeout: 60_000 },
  );
}

/** Patch the authoritative state in the page (the body runs there; `st` is a deep copy). */
async function craft(page: Page, body: string): Promise<void> {
  await page.evaluate((src) => {
    const ww = window.__ww;
    if (!ww) throw new Error('no game on window.__ww');
    const st = structuredClone(ww.controller.getSnapshot().latest);
    new Function('st', src)(st);
    ww.load(st);
  }, body);
}

async function ready(page: Page): Promise<void> {
  await page.getByTestId('ready').click();
  await waitFor(page, 'players');
}

/** Skip to the last round of this Night and end the turn: on to Dawn and the Chandlery. */
async function finishNight(page: Page, extra = ''): Promise<void> {
  await craft(page, `st.round = st.roundsThisNight; if (st.vigil) st.vigil.dread = 0; ${extra}`);
  await page.getByTestId('end-turn').click();
  const chandlery = page.getByTestId('chandlery');
  const keep = page.getByRole('button', { name: /^Keep \d/ });
  await expect(chandlery.or(keep)).toBeVisible({ timeout: 60_000 });
  if (await keep.isVisible()) await keep.click();
  await expect(chandlery).toBeVisible({ timeout: 30_000 });
}

test('the Chandlery after Night 1: summary, draft, Boon, then Night 2', async ({ page }) => {
  const problems = watchErrors(page);
  await seedStorage(page);
  await startQuickPlay(page);
  await ready(page);
  await finishNight(page);

  const chandlery = page.getByTestId('chandlery');
  await expect(chandlery.getByText('Snuff slain')).toBeVisible();
  await expect(chandlery.getByText('Candles standing')).toBeVisible();
  await expect(chandlery.locator('.ww-draft__card')).toHaveCount(3);
  await chandlery.locator('.ww-draft__card').first().click();
  await expect(page.getByRole('radio', { name: /Heirloom/ })).toBeVisible();
  await page.getByRole('radio', { name: /Temper/ }).click();
  await page.locator('.ww-boon-card').first().click();
  await page.getByRole('button', { name: 'Take the Boon' }).click();
  await expect(page.getByTestId('night-title')).toContainText('Night 2');
  expect(problems, problems.join('\n')).toEqual([]);
});

test('The Long Night Falls, and Retry this Night brings the Night back', async ({ page }) => {
  const problems = watchErrors(page);
  await seedStorage(page);
  await startQuickPlay(page);
  await ready(page);
  // The engine's own defeat (the boss's toll) is in boss.spec.ts; here the defeat is loaded as
  // it lands (Dread full, the cause recorded), so the screen and Retry are tested on any seed.
  await craft(
    page,
    `st.vigil.dread = st.vigil.dreadMax; st.phase = 'game_over';
     st.result = { mode: 'vigil', outcome: 'defeat', stars: 0, cause: 'The c3 Vigil Candle was snuffed.', finalDread: st.vigil.dreadMax, retries: 0 };`,
  );
  const over = page.getByTestId('game-over');
  await expect(over).toBeVisible({ timeout: 30_000 });
  await expect(over).toHaveAttribute('data-outcome', 'defeat');
  await expect(over.getByText('The Long Night Falls')).toBeVisible({ timeout: 10_000 });
  await expect(over.getByText('The c3 Vigil Candle was snuffed.')).toBeVisible();
  await over.getByTestId('retry-night').click();
  await expect(over).toBeHidden();
  await waitFor(page, 'night_setup');
  expect(problems, problems.join('\n')).toEqual([]);
});

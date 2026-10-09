/**
 * The game's big moments end to end, with no console errors: the Chandlery after Night 1, the
 * Boss Night's intro, Dawn Breaks after the boss falls, and The Long Night Falls with Retry this
 * Night. Long stretches (the rest of a Night) are skipped by loading a crafted state through
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

test('the Boss Night: the intro, then Dawn Breaks when the boss falls', async ({ page }) => {
  const problems = watchErrors(page);
  await seedStorage(page);
  await startQuickPlay(page);
  await ready(page);
  await finishNight(page, "st.night = st.config.nights - 1; st.config = { ...st.config, boss_choice: 'hush_hierophant' };");
  await page.getByRole('button', { name: /Skip the draft/ }).click();
  await page.getByRole('button', { name: 'No Boon' }).click();
  await waitFor(page, 'night_setup');
  await expect(page.getByTestId('night-title')).toBeHidden({ timeout: 5_000 });
  await page.getByTestId('ready').click();

  const intro = page.getByTestId('boss-intro');
  await expect(intro).toBeVisible({ timeout: 20_000 });
  await expect(intro).toContainText('Hush Hierophant');
  await expect(intro).toContainText('The Bell That Swallows Song');
  await expect(intro).toContainText('Weakness:');
  await page.keyboard.press(' ');
  await expect(intro).toBeHidden();
  await waitFor(page, 'players');

  // The boss at 1 HP with Brannoc beside it: strike it down.
  await craft(
    page,
    `const b = st.pieces[st.boss.pieceId]; b.hp = 1; const h = st.pieces[st.players[0].heroPieceId];
     const taken = new Set(Object.values(st.pieces).filter((p) => p.id !== h.id).flatMap((p) => { const o = []; for (let dx = 0; dx < p.size; dx++) for (let dy = 0; dy < p.size; dy++) o.push((p.pos.x + dx) + ',' + (p.pos.y + dy)); return o; }));
     const spots = [[b.pos.x, b.pos.y - 1], [b.pos.x + 1, b.pos.y - 1], [b.pos.x - 1, b.pos.y], [b.pos.x + 2, b.pos.y]];
     const free = spots.find(([x, y]) => x >= 0 && y >= 0 && !taken.has(x + ',' + y) && st.board.tiles[y * st.board.w + x].type !== 'pillar');
     h.pos = { x: free[0], y: free[1] }; h.movesLeft = 1; h.strikesLeft = 1;`,
  );
  const target = await page.evaluate(() => {
    const ww = window.__ww;
    const s = ww?.controller.getSnapshot();
    const heroId = s?.latest.players[0].heroPieceId ?? '';
    return { hero: s?.latest.pieces[heroId].pos, strike: ww?.controller.highlightsFor(heroId)?.strikes[0]?.pos };
  });
  if (!target.hero || !target.strike) throw new Error('no strike on the boss');
  for (const pos of [target.hero, target.strike]) {
    const box = await page.getByTestId('board-input').boundingBox();
    const tile = Number(await page.locator('.ww-gameboard').getAttribute('data-tile'));
    if (!box) throw new Error('board not laid out');
    const rows = Math.round(box.height / tile);
    await page.mouse.click(box.x + pos.x * tile + tile / 2, box.y + (rows - 1 - pos.y) * tile + tile / 2);
  }
  const over = page.getByTestId('game-over');
  await expect(over).toBeVisible({ timeout: 30_000 });
  await expect(over).toHaveAttribute('data-outcome', 'victory');
  await expect(over.getByText('Dawn Breaks')).toBeVisible();
  for (const label of ['Play Again', 'Same Seed', 'Change Hero', 'Main Menu']) await expect(over.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});

test('The Long Night Falls, and Retry this Night brings the Night back', async ({ page }) => {
  const problems = watchErrors(page);
  await seedStorage(page);
  await startQuickPlay(page);
  await ready(page);
  // One Dread short of the end, with a Snuff about to hit a Candle.
  await craft(
    page,
    `st.vigil.dread = st.vigil.dreadMax - 1; const candle = Object.values(st.pieces).find((p) => p.kind === 'candle');
     const snuff = Object.values(st.pieces).find((p) => p.side === 'snuff');
     const intent = st.intents.find((i) => i.attackerId === snuff.id);
     if (!st.intents.some((i) => i.tiles.some((t) => t.x === candle.pos.x && t.y === candle.pos.y)) && intent) { intent.tiles = [{ ...candle.pos }]; }`,
  );
  await page.getByTestId('end-turn').click();
  const over = page.getByTestId('game-over');
  await expect(over).toBeVisible({ timeout: 60_000 });
  await expect(over).toHaveAttribute('data-outcome', 'defeat');
  await expect(over.getByText('The Long Night Falls')).toBeVisible({ timeout: 10_000 });
  await over.getByTestId('retry-night').click();
  await expect(over).toBeHidden();
  await waitFor(page, 'night_setup');
  expect(problems, problems.join('\n')).toEqual([]);
});

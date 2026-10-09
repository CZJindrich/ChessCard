/**
 * Quick Play end to end: Title → QUICK PLAY → pick Brannoc → (deploy) → move, strike and play a
 * card through the real board and hand → End Turn → the Snuff Strike plays out → back to the
 * players phase, with no console errors on the way.
 *
 * Board positions are read from the running game (`window.__ww`), but every action is a real
 * click on the screen.
 */
import { expect, test, type Page } from '@playwright/test';
import type { GameController } from '../../src/game';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __ww?: { controller: GameController; load: (state: GameState) => void };
  }
}

interface Pos {
  x: number;
  y: number;
}

interface PieceLite {
  id: string;
  pos: Pos;
  side: string;
  owner: number | null;
}

interface SnapLite {
  phase: string;
  round: number;
  animating: boolean;
  uiSeat: number | null;
  result: unknown;
  heroId: string;
  pieces: PieceLite[];
  hand: string[];
}

async function readSnap(page: Page): Promise<SnapLite> {
  return page.evaluate(() => {
    const ww = window.__ww;
    if (!ww) throw new Error('no game controller on window.__ww');
    const s = ww.controller.getSnapshot();
    const seat = s.uiSeat ?? 0;
    return {
      phase: s.latest.phase,
      round: s.latest.round,
      animating: s.animating,
      uiSeat: s.uiSeat,
      result: s.latest.result,
      heroId: s.latest.players[0].heroPieceId,
      pieces: Object.values(s.latest.pieces).map((p) => ({ id: p.id, pos: p.pos, side: p.side, owner: p.owner })),
      hand: s.latest.players[seat].hand.map((c) => c.uid),
    };
  });
}

async function waitIdle(page: Page, phase: string): Promise<void> {
  await page.waitForFunction(
    (ph) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && (s.latest.phase === ph || s.latest.result !== null) && !s.animating;
    },
    phase,
    { timeout: 45_000 },
  );
}

async function tileCentre(page: Page, pos: Pos): Promise<Pos> {
  const box = await page.getByTestId('board-input').boundingBox();
  const tile = Number(await page.locator('.ww-gameboard').getAttribute('data-tile'));
  if (!box || !tile) throw new Error('board not laid out');
  const rows = Math.round(box.height / tile);
  return { x: box.x + pos.x * tile + tile / 2, y: box.y + (rows - 1 - pos.y) * tile + tile / 2 };
}

async function clickTile(page: Page, pos: Pos): Promise<void> {
  const c = await tileCentre(page, pos);
  await page.mouse.click(c.x, c.y);
}

/** Moves and strikes the controller currently highlights for a piece. */
async function highlights(page: Page, pieceId: string): Promise<{ moves: Array<{ pos: Pos; to: Pos }>; strikes: Pos[] }> {
  return page.evaluate((id) => {
    const hl = window.__ww?.controller.highlightsFor(id);
    return { moves: hl?.moves.map((m) => ({ pos: m.pos, to: m.to })) ?? [], strikes: hl?.strikes.map((m) => m.pos) ?? [] };
  }, pieceId);
}

function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

test('Quick Play: move, strike, play a card, end the turn and survive the Snuff', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));

  await page.goto('./');
  await page.getByRole('button', { name: /Quick Play/ }).first().click();
  await page.getByRole('button', { name: /Play as Brannoc/ }).click();
  await expect(page.getByTestId('game-screen')).toBeVisible();

  const ready = page.getByTestId('ready');
  if (await ready.isVisible().catch(() => false)) await ready.click();
  await waitIdle(page, 'players');

  let snap = await readSnap(page);
  expect(snap.uiSeat).toBe(0);
  const heroId = snap.heroId;
  const hero = () => snap.pieces.find((p) => p.id === heroId);
  const enemies = () => snap.pieces.filter((p) => p.side === 'snuff');

  // Move: select the hero, then the gold dot that brings it closest to a Snuff.
  await clickTile(page, hero()!.pos);
  await expect.poll(() => page.evaluate(() => window.__ww?.controller.getSnapshot().selection.pieceId)).toBe(heroId);
  const { moves } = await highlights(page, heroId);
  expect(moves.length).toBeGreaterThan(0);
  const target = moves.slice().sort((a, b) => Math.min(...enemies().map((e) => chebyshev(a.to, e.pos))) - Math.min(...enemies().map((e) => chebyshev(b.to, e.pos))))[0];
  await clickTile(page, target.pos);
  await expect.poll(async () => (await readSnap(page)).pieces.find((p) => p.id === heroId)?.pos).toEqual(target.to);
  await waitIdle(page, 'players');
  snap = await readSnap(page);

  // Strike: the hero stays selected after moving; click its first gold ring.
  const { strikes } = await highlights(page, heroId);
  expect(strikes.length, 'a Snuff in reach after the move').toBeGreaterThan(0);
  const enemyCount = enemies().length;
  if ((await page.evaluate(() => window.__ww?.controller.getSnapshot().selection.pieceId)) !== heroId) await clickTile(page, hero()!.pos);
  await clickTile(page, strikes[0]);
  await expect.poll(async () => (await readSnap(page)).pieces.filter((p) => p.side === 'snuff').length).toBeLessThan(enemyCount);
  await waitIdle(page, 'players');

  // Card: Spark if it is in hand (the tutorial's line), else each playable card in turn, then its
  // first glowing target (or Play for board-wide cards).
  snap = await readSnap(page);
  const handBefore = snap.hand.length;
  const playable = page.locator('.ww-hand-card:not(.ww-hand-card--disabled)');
  const uids = await playable.evaluateAll((els) => els.map((el) => ({ uid: el.getAttribute('data-card-uid'), id: el.getAttribute('data-card-id') })));
  uids.sort((a, b) => Number(b.id === 'spark') - Number(a.id === 'spark'));
  expect(uids.length).toBeGreaterThan(0);
  let played = false;
  for (const card of uids) {
    await page.locator(`.ww-hand-card[data-card-uid="${card.uid}"]`).click();
    const info = await page.evaluate(() => {
      const i = window.__ww?.controller.targetInfo();
      return i ? { steps: i.steps, first: i.targets[0]?.pos ?? null } : null;
    });
    if (info && info.steps === 0) await page.keyboard.press('Enter');
    else if (info?.first) await clickTile(page, info.first);
    played = await expect
      .poll(async () => (await readSnap(page)).hand.length, { timeout: 3_000 })
      .toBe(handBefore - 1)
      .then(() => true)
      .catch(() => false);
    if (played) break;
    await page.keyboard.press('Escape');
  }
  expect(played, 'a card was played').toBe(true);
  await waitIdle(page, 'players');

  // End the turn (confirming if asked) and let the Snuff Strike, Rise and Tally play out.
  const roundBefore = (await readSnap(page)).round;
  await page.getByTestId('end-turn').click();
  const confirm = page.getByTestId('confirm-end-turn');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForFunction(
    (round) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.result !== null || (s.latest.phase === 'players' && s.latest.round > round));
    },
    roundBefore,
    { timeout: 60_000 },
  );
  snap = await readSnap(page);
  expect(snap.result === null ? snap.round : roundBefore + 1).toBe(roundBefore + 1);
  expect(problems, problems.join('\n')).toEqual([]);
});

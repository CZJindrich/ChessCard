/**
 * Shared e2e helpers: seeded local storage (profile, presentation, seen tips), console error
 * capture, waiting for the controller to be idle in a phase, clicking board tiles, and loading
 * crafted states through `window.__ww`.
 */
import type { Page } from '@playwright/test';
import type { GameController } from '../../src/game';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __ww?: { controller: GameController; load: (state: GameState) => void };
  }
}

export interface Pos {
  x: number;
  y: number;
}

export const ALL_TIPS = ['plume', 'dread', 'push', 'bump', 'hot_wax', 'chimney', 'shrine', 'ward', 'dazed', 'aimed', 'smoldering', 'toll', 'moth_die', 'chandlery', 'boss_phase', 'crown', 'check', 'gloam_warning', 'lit_shrine'];

export interface SeedOptions {
  /** Completed games in the profile (0 = the first-ever game: the tutorial). */
  games?: number;
  presentation?: Record<string, unknown>;
  /** Tips already seen (default: all, so none interrupts). */
  tips?: string[];
  name?: string;
}

/** Seed local storage before the app loads. */
export async function seedStorage(page: Page, opts: SeedOptions = {}): Promise<void> {
  const payload = {
    profile: JSON.stringify({ version: 1, playerName: opts.name ?? 'Ash', gamesCompleted: opts.games ?? 3 }),
    presentation: JSON.stringify(opts.presentation ?? { animation_speed: 3, enemy_turn_speed: 'fast', confirm_end_turn: 'never' }),
    tips: JSON.stringify(opts.tips ?? ALL_TIPS),
  };
  await page.addInitScript((p) => {
    localStorage.setItem('chesscard.profile', p.profile);
    localStorage.setItem('chesscard.presentation', p.presentation);
    localStorage.setItem('chesscard.tips', p.tips);
  }, payload);
}

/** Console errors and uncaught exceptions on the page (the WebSocket's own reconnect noise excluded). */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/WebSocket connection .* failed/.test(msg.text())) problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  return problems;
}

/** Wait until playback is idle in `phase` (or the game is over). */
export async function waitIdle(page: Page, phase: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(
    (ph) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.phase === ph || s.latest.result !== null);
    },
    phase,
    { timeout },
  );
}

export async function tileCentre(page: Page, pos: Pos): Promise<Pos> {
  const box = await page.getByTestId('board-input').boundingBox();
  const tile = Number(await page.locator('.ww-gameboard').getAttribute('data-tile'));
  if (!box || !tile) throw new Error('board not laid out');
  const rows = Math.round(box.height / tile);
  return { x: box.x + pos.x * tile + tile / 2, y: box.y + (rows - 1 - pos.y) * tile + tile / 2 };
}

export async function clickTile(page: Page, pos: Pos): Promise<void> {
  const c = await tileCentre(page, pos);
  await page.mouse.click(c.x, c.y);
}

/** Patch the authoritative state in the page (the body runs there; `st` is a deep copy). */
export async function craft(page: Page, body: string): Promise<void> {
  await page.evaluate((src) => {
    const ww = window.__ww;
    if (!ww) throw new Error('no game on window.__ww');
    const st = structuredClone(ww.controller.getSnapshot().latest);
    new Function('st', src)(st);
    ww.load(st);
  }, body);
}

/** Title → a one-click mode → a hero → the game screen. */
export async function startOneClick(page: Page, mode: 'quick_play' | 'quick_last_flame', hero: string): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: mode === 'quick_play' ? /Quick Play/ : /Quick Last Flame/ }).first().click();
  await page.mouse.move(2, 2);
  await page.getByRole('button', { name: new RegExp(`Play as ${hero}`) }).click({ force: true });
  await page.getByTestId('game-screen').waitFor();
}

/** A few facts of the running game. */
export async function gameFacts(page: Page): Promise<{ phase: string; round: number; night: number; uiSeat: number | null; animating: boolean; over: boolean }> {
  return page.evaluate(() => {
    const ww = window.__ww;
    if (!ww) throw new Error('no game on window.__ww');
    const s = ww.controller.getSnapshot();
    return { phase: s.latest.phase, round: s.latest.round, night: s.latest.night, uiSeat: s.uiSeat, animating: s.animating, over: s.latest.result !== null };
  });
}

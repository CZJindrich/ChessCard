// @vitest-environment jsdom
/**
 * The game screen's Last Flame presentation and the input hardening, rendered in jsdom with
 * states crafted through the engine and loaded via `window.__ww`:
 * - the right rail as a drawer (and opening by itself for End Turn's preview), the Truce chip,
 *   the Gloam Bell, Glory with First Light and the Wanted seal on the plaques, the queue numbers
 *   on the board, the Gloam layers;
 * - an eliminated player: the spectator's note, haunting (violet tiles, Skip), the podium's
 *   "out" line;
 * - Retry this Night from the pause menu, the co-op vote bar, the tutorial's own Ready and
 *   its guard, and the keyboard cursor (arrows, Enter).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../../src/config';
import { setContent } from '../../../src/engine/content';
import type { GameState, Standing } from '../../../src/engine/types';
import type { Route } from '../../../src/ui/app/navigation';
import { createAppServices, type AppServices, type UiAudio } from '../../../src/ui/app/services';
import { App } from '../../../src/ui/App';
import { playUntil } from './harness';

vi.setConfig({ testTimeout: 20_000 });

const FAST = JSON.stringify({ animation_speed: 3, enemy_turn_speed: 'instant', confirm_end_turn: 'never' });
const ALL_TIPS = JSON.stringify(['plume', 'dread', 'push', 'bump', 'hot_wax', 'chimney', 'shrine', 'ward', 'dazed', 'aimed', 'smoldering', 'toll', 'moth_die', 'chandlery', 'boss_phase', 'crown', 'check', 'gloam_warning', 'lit_shrine']);

function fakeAudio(): UiAudio {
  return { unlock: vi.fn(), play: vi.fn(), setMusic: vi.fn() };
}

function appServices(route: Route, gamesCompleted = 3): AppServices {
  const storage = memoryStorage({
    'chesscard.profile': JSON.stringify({ version: 1, playerName: 'Ash', gamesCompleted }),
    'chesscard.presentation': FAST,
  });
  return createAppServices({ storage, audioBridge: null, audio: fakeAudio(), initialRoute: route, online: null, env: { now: () => new Date('2026-10-09T12:00:00Z'), randomSeed: () => 'lf-screen', clipboard: null } });
}

async function run(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
  }
}

async function start(mode: 'quick_play' | 'quick_last_flame', hero: string, gamesCompleted = 3): Promise<AppServices> {
  const app = appServices({ screen: 'hero_pick', mode }, gamesCompleted);
  render(<App services={app} />);
  fireEvent.click(screen.getByRole('button', { name: `Play as ${hero}` }));
  await run(2400);
  return app;
}

function latest(): GameState {
  const ww = window.__ww;
  if (!ww) throw new Error('no game on window.__ww');
  return ww.controller.getSnapshot().latest;
}

async function load(state: GameState): Promise<void> {
  await act(async () => {
    window.__ww?.load(state);
  });
  await run(300);
}

/** The Last Flame players phase on your turn (bots may act first). */
function myTurn(s: GameState): GameState {
  return playUntil(structuredClone(s), (x) => x.phase === 'players' && x.activeSeat === 0);
}

function ring(s: GameState, x: number, y: number): number {
  return Math.min(x, y, s.board.w - 1 - x, s.board.h - 1 - y);
}

const sizeProps = ['clientWidth', 'clientHeight'] as const;
const originals = sizeProps.map((p) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, p));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 560 });
});

afterAll(() => {
  sizeProps.forEach((p, i) => {
    const d = originals[i];
    if (d) Object.defineProperty(HTMLElement.prototype, p, d);
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  setContent(null);
  localStorage.clear();
  localStorage.setItem('chesscard.tips', ALL_TIPS);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.__ww;
});

describe('Last Flame layout', () => {
  it('folds the right rail into a drawer and opens it for the End Turn preview', async () => {
    await start('quick_last_flame', 'Velveteen, the Moth Witch');
    await load(myTurn(latest()));
    expect(screen.getByTestId('game-screen').className).toContain('ww-game--last-flame');
    expect(screen.queryByTestId('snuff-drawer')).toBeNull();
    fireEvent.click(screen.getByTestId('drawer-tab'));
    expect(within(screen.getByTestId('snuff-drawer')).getByText('The Snuff will strike')).toBeTruthy();
    fireEvent.click(screen.getByTestId('drawer-tab'));
    expect(screen.queryByTestId('snuff-drawer')).toBeNull();
    await act(async () => window.__ww?.controller.setEndTurnPreview(true));
    expect(within(screen.getByTestId('snuff-drawer')).getByText('If you end the turn now')).toBeTruthy();
  });

  it('shows the Truce, the Gloam Bell, Glory, First Light and the Wanted seal', async () => {
    await start('quick_last_flame', 'Velveteen, the Moth Witch');
    const s = myTurn(latest());
    if (!s.lastFlame) throw new Error('not a Last Flame game');
    s.players[0].glory = 3;
    s.players[1].glory = 9;
    s.players[2].glory = 4;
    s.lastFlame.leader = 1;
    s.firstLight = 2;
    await load(s);
    expect(screen.getByTestId('truce').textContent).toContain('Truce');
    expect(screen.getByTestId('gloam-bell').getAttribute('aria-label')).toMatch(/The Gloam Bell: the smoke ring closes/);
    expect(screen.getByTestId('glory-1').textContent).toContain('9');
    expect(screen.getByTestId('wanted-1')).toBeTruthy();
    expect(screen.queryByTestId('wanted-0')).toBeNull();
    expect(screen.getByTestId('first-light-2')).toBeTruthy();
    // The queue numbers ride on the attackers (the rail is a drawer).
    expect(document.querySelectorAll('.ww-queue-badge').length).toBe(new Set(s.intents.map((i) => i.attackerId)).size);
  });

  it('draws the Gloam and the warning band, and the bell rings in the closing round', async () => {
    await start('quick_last_flame', 'Velveteen, the Moth Witch');
    const s = myTurn(latest());
    if (!s.lastFlame) throw new Error('not a Last Flame game');
    s.board.tiles.forEach((t, i) => {
      const r = ring(s, i % s.board.w, Math.floor(i / s.board.w));
      t.gloam = r === 0;
      t.gloamWarning = r === 1;
    });
    // The round whose Tally applies the next closing: the bell rings.
    const next = s.lastFlame.gloam.schedule[s.lastFlame.gloam.closingsDone];
    if (!next) throw new Error('no Gloam closing scheduled');
    s.night = next.night;
    s.round = next.round;
    s.lastFlame.truce = false;
    await load(s);
    expect(document.querySelectorAll('.ww-gloam-layer .ww-gloam').length).toBe(4 * (s.board.w - 1));
    expect(screen.getByTestId('gloam-warning')).toBeTruthy();
    expect(screen.getByTestId('gloam-bell').className).toContain('ww-gloam-bell--closing');
    expect(screen.queryByTestId('truce')).toBeNull();
  });
});

describe('out of the Trial', () => {
  /** Seat 0 eliminated, owing a Haunt at the Tally (haunting on). */
  function eliminated(s: GameState): GameState {
    const next = myTurn(s);
    next.config = { ...next.config, haunting: true };
    const me = next.players[0];
    me.eliminated = true;
    me.eliminationBand = 1;
    me.haunt.pending = true;
    me.haunt.lastHeroId = null;
    for (const piece of Object.values(next.pieces)) if (piece.owner === 0) delete next.pieces[piece.id];
    next.phase = 'tally';
    next.activeSeat = null;
    if (next.lastFlame) next.lastFlame.tallyPaused = true;
    return next;
  }

  it('shows the spectator, the violet haunt tiles and Skip', async () => {
    await start('quick_last_flame', 'Velveteen, the Moth Witch');
    await load(eliminated(latest()));
    expect(screen.getByTestId('spectating').textContent).toContain('Out of the Trial · 1st to fall');
    expect(within(screen.getByTestId('plaque-0')).getByText(/Haunting/)).toBeTruthy();
    const prompt = screen.getByTestId('haunt-prompt');
    expect(prompt.textContent).toContain('Place a Sootling Plume on a violet tile');
    const tiles = window.__ww?.controller.hauntTargets() ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.ww-marks__haunt .ww-target-glow').length).toBe(tiles.length);
    fireEvent.click(screen.getByTestId('haunt-skip'));
    await run(300);
    expect(latest().players[0].haunt.pending).toBe(false);
    expect(screen.queryByTestId('haunt-prompt')).toBeNull();
  });

  it('places the Haunt Plume on a clicked violet tile', async () => {
    await start('quick_last_flame', 'Velveteen, the Moth Witch');
    await load(eliminated(latest()));
    const tile = window.__ww?.controller.hauntTargets()[0];
    if (!tile) throw new Error('no haunt tile');
    const plumes = latest().plumes.length;
    await act(async () => window.__ww?.controller.clickTile(tile.pos));
    await run(600);
    const after = latest();
    expect(after.players[0].haunt.pending).toBe(false);
    expect(after.plumes.length).toBeGreaterThanOrEqual(plumes);
    expect(after.plumes.some((m) => m.source === 'haunt' && m.pos.x === tile.pos.x && m.pos.y === tile.pos.y) || after.phase !== 'tally').toBe(true);
  });

  it('skips the Haunt by itself after 15 seconds offline', async () => {
    await start('quick_last_flame', 'Velveteen, the Moth Witch');
    await load(eliminated(latest()));
    expect(screen.getByTestId('haunt-prompt').textContent).toContain('15');
    await run(15_500);
    expect(latest().players[0].haunt.pending).toBe(false);
  });

  it('the podium says who fell, and in what order', async () => {
    await start('quick_last_flame', 'Velveteen, the Moth Witch');
    const s = structuredClone(latest());
    const blank = { snuff_kill: 0, rival_unit: 0, rival_hero: 0, bounty: 0, shrine: 0, boss_damage: 0, boss_kill: 0, survival: 0, hero_fell: 0, effect: 0 };
    const standing = (seat: number, placement: number, score: number, alive: boolean, band: number | null): Standing => ({
      seat,
      placement,
      score,
      glory: score - (alive ? 5 : 0),
      standingBonus: alive ? 5 : 0,
      alive,
      eliminationBand: band,
      bossDamage: 0,
      breakdown: { ...blank, snuff_kill: score - (alive ? 5 : 0) + (alive ? 0 : 2), survival: alive ? 5 : 0, hero_fell: alive ? 0 : -2 },
    });
    await load({ ...s, phase: 'game_over', result: { mode: 'last_flame', reason: 'last_standing', standings: [standing(1, 1, 18, true, null), standing(0, 2, 9, false, 2), standing(2, 3, 4, false, 1)] } });
    const over = screen.getByTestId('game-over');
    expect(within(over).getByText('Out · 2nd to fall')).toBeTruthy();
    expect(within(over).getByText('Out · 1st to fall')).toBeTruthy();
    expect(within(over).getAllByText('−2').length).toBe(2);
  });
});

describe('Retry, votes, the tutorial and the keyboard', () => {
  it('Retry this Night from the pause menu restarts the Night (solo)', async () => {
    await start('quick_play', 'Brannoc, the Sconce Paladin');
    const s = playUntil(structuredClone(latest()), (x) => x.phase === 'players' && x.round === 2);
    await load(s);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('pause-retry-button'));
    const confirm = screen.getByTestId('pause-retry');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Retry this Night' }));
    await run(500);
    expect(latest().phase).toBe('night_setup');
    expect(latest().vigil?.retries).toBe(1);
  });

  it('a co-op retry vote shows who agreed and lets the others answer', async () => {
    await start('quick_play', 'Brannoc, the Sconce Paladin');
    const s = playUntil(structuredClone(latest()), (x) => x.phase === 'players');
    s.players[1] = { ...structuredClone(s.players[0]), seat: 1, name: 'Bea', kind: 'human', heroPieceId: 'none', house: 'house_tallow' };
    s.config = { ...s.config, seats: [...s.config.seats, { kind: 'human', hero: 'moth_witch', name: 'Bea' }] };
    if (!s.vigil) throw new Error('not a Vigil');
    s.vigil.retryVotes = [0];
    await load(s);
    const bar = screen.getByTestId('vote-bar');
    expect(bar.textContent).toContain('Retry this Night?');
    expect(bar.textContent).toContain('Ash agreed');
    expect(bar.textContent).toContain('waiting for Bea');
    fireEvent.click(within(bar).getByRole('button', { name: 'Decline' }));
    await run(300);
    expect(latest().vigil?.retryVotes).toEqual([]);
    expect(screen.queryByTestId('vote-bar')).toBeNull();
  });

  it('the scripted first Night readies itself and its guard keeps the coached line', async () => {
    await start('quick_play', 'Brannoc, the Sconce Paladin', 0);
    await run(2000);
    expect(screen.queryByTestId('ready')).toBeNull();
    expect(latest().phase).toBe('players');
    expect(screen.getByTestId('coach-mark').getAttribute('data-mark')).toBe('1');
    await act(async () => {
      window.__ww?.controller.endTurn(true);
    });
    expect(latest().phase).toBe('players');
    expect(screen.getByTestId('notice').textContent).toContain('Follow the guide');
    fireEvent.click(screen.getByTestId('skip-tutorial'));
    await act(async () => {
      window.__ww?.controller.endTurn(true);
    });
    await run(800);
    const after = latest();
    expect(after.players[0].turnEnded || after.phase !== 'players' || after.round > 1).toBe(true);
  });

  it('arrow keys move a keyboard cursor from the hero; Enter acts on its tile; Esc hides it', async () => {
    await start('quick_play', 'Brannoc, the Sconce Paladin');
    const s = playUntil(structuredClone(latest()), (x) => x.phase === 'players');
    await load(s);
    const hero = s.pieces[s.players[0].heroPieceId];
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(window.__ww?.controller.getSnapshot().selection.hover).toEqual(hero.pos);
    expect(screen.getByTestId('key-cursor')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(window.__ww?.controller.getSnapshot().selection.pieceId).toBe(hero.id);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(window.__ww?.controller.getSnapshot().selection.hover).toEqual({ x: Math.min(s.board.w - 1, hero.pos.x + 1), y: hero.pos.y });
    // Esc first drops the selection, then the cursor, then opens the pause menu.
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('key-cursor')).toBeNull();
    expect(screen.queryByTestId('pause-menu')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('pause-menu')).toBeTruthy();
  });

  it('keys never fire while typing in a field', async () => {
    await start('quick_play', 'Brannoc, the Sconce Paladin');
    await load(playUntil(structuredClone(latest()), (x) => x.phase === 'players'));
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    fireEvent.keyDown(field, { key: 'd' });
    fireEvent.keyDown(field, { key: ' ' });
    expect(screen.queryByTestId('deck-viewer')).toBeNull();
    expect(latest().players[0].turnEnded).toBe(false);
    field.remove();
  });
});

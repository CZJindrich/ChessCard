// @vitest-environment jsdom
/**
 * Render tests for the game's overlays and big moments: the Night title card, pause menu, deck
 * viewer, rules, boss intro, Toll reveal, Chandlery, the finale screens, the Pass screen, coach
 * marks and tips. States are crafted with the engine and loaded through `window.__ww`.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../../src/config';
import { setContent } from '../../../src/engine/content';
import type { GameResult, GameState, Standing } from '../../../src/engine/types';
import type { Route } from '../../../src/ui/app/navigation';
import { createAppServices, type AppServices, type UiAudio } from '../../../src/ui/app/services';
import { App } from '../../../src/ui/App';
import { playUntil } from './harness';

// Several tests play a whole Night with the engine first; give them room on a busy machine.
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
  return createAppServices({ storage, audioBridge: null, audio: fakeAudio(), initialRoute: route, env: { now: () => new Date('2026-10-09T12:00:00Z'), randomSeed: () => 'overlay-test', clipboard: null } });
}

async function run(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
  }
}

/** Open Quick Play as Brannoc and let the title card pass. */
async function startGame(gamesCompleted = 3, mode: 'quick_play' | 'quick_last_flame' = 'quick_play', hero = 'Brannoc, the Sconce Paladin'): Promise<AppServices> {
  const app = appServices({ screen: 'hero_pick', mode }, gamesCompleted);
  render(<App services={app} />);
  fireEvent.click(screen.getByRole('button', { name: `Play as ${hero}` }));
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

describe('Night title card', () => {
  it('opens the game with the Night, its site and the goal, then fades', async () => {
    await startGame();
    const card = screen.getByTestId('night-title');
    expect(within(card).getByText('Night 1 · Cathedral of Tallow')).toBeTruthy();
    expect(within(card).getByText('Survive 4 rounds. Keep the Candles lit.')).toBeTruthy();
    await run(2400);
    expect(screen.queryByTestId('night-title')).toBeNull();
  });

  it('reads "Night 1 · First Vigil" in the first-ever game', async () => {
    await startGame(0);
    expect(within(screen.getByTestId('night-title')).getByText('Night 1 · First Vigil')).toBeTruthy();
  });
});

describe('pause menu, deck viewer and rules', () => {
  it('Esc with nothing selected pauses (playback holds); Resume closes', async () => {
    await startGame();
    await run(2400);
    fireEvent.keyDown(window, { key: 'Escape' });
    const menu = screen.getByTestId('pause-menu');
    expect(window.__ww?.controller.getSnapshot().held).toBe(true);
    for (const label of ['Resume', 'Settings', 'How to Play', 'Concede', 'Main Menu']) expect(within(menu).getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('button', { name: /Settings/ }));
    expect(screen.getByTestId('pause-settings').textContent).toContain('Animation speed');
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    expect(screen.queryByTestId('pause-menu')).toBeNull();
    expect(window.__ww?.controller.getSnapshot().held).toBe(false);
  });

  it('D shows your own deck by pile; R shows the 8 rules; Esc closes', async () => {
    await startGame();
    await run(2400);
    fireEvent.keyDown(window, { key: 'd' });
    const deck = screen.getByTestId('deck-viewer');
    expect(within(deck).getByText(/Draw pile/)).toBeTruthy();
    expect(within(deck).getByText(/In hand/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.queryByTestId('deck-viewer')).toBeNull();
    const rules = screen.getByTestId('rules-overlay');
    expect(within(rules).getAllByRole('listitem')).toHaveLength(8);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('rules-overlay')).toBeNull();
  });
});

describe('boss intro', () => {
  it('shows the boss, its phase-1 intents, its rule and its weakness; a click skips it', async () => {
    await startGame();
    await run(2400);
    const s = latest();
    const night = playUntil({ ...structuredClone(s), night: s.config.nights - 1, round: 0 }, (x) => x.phase === 'night_setup' && x.isBossNight, (x) => {
      if (x.vigil) x.vigil.dread = 0;
    });
    await load(night);
    fireEvent.click(screen.getByTestId('ready'));
    await run(200);
    const intro = screen.getByTestId('boss-intro');
    const boss = night.boss ? night.boss.id : '';
    expect(boss).not.toBe('');
    expect(intro.textContent).toContain('Weakness:');
    expect(intro.querySelectorAll('.ww-boss-card__intent').length).toBeGreaterThanOrEqual(2);
    expect(window.__ww?.controller.getSnapshot().held).toBe(true);
    fireEvent.click(intro);
    expect(screen.queryByTestId('boss-intro')).toBeNull();
    expect(window.__ww?.controller.getSnapshot().held).toBe(false);
  });
});

describe('Toll and Chandlery', () => {
  it('the Toll offers a Blessing and a Curse with its reward', async () => {
    await startGame();
    await run(2400);
    const toll = playUntil(structuredClone(latest()), (x) => x.phase === 'toll' && x.toll.offer !== null && x.toll.active === null, (x) => {
      if (x.vigil) x.vigil.dread = 0;
    });
    await load(toll);
    const dialog = screen.getByTestId('toll');
    expect(within(dialog).getByText('Blessing')).toBeTruthy();
    expect(within(dialog).getByText('Curse')).toBeTruthy();
    expect(within(dialog).getByText(/Reward: take 2 cards/)).toBeTruthy();
  });

  it('the Chandlery summarises the Night, drafts from the wax tray and offers the Boons', async () => {
    await startGame();
    await run(2400);
    const ch = playUntil(structuredClone(latest()), (x) => x.phase === 'chandlery', (x) => {
      if (x.vigil) x.vigil.dread = 0;
    });
    await load(ch);
    const scene = screen.getByTestId('chandlery');
    expect(within(scene).getByText('Snuff slain')).toBeTruthy();
    expect(within(scene).getByText('Candles standing')).toBeTruthy();
    expect(within(scene).getByText('Next')).toBeTruthy();
    const cards = scene.querySelectorAll('.ww-draft__card');
    expect(cards).toHaveLength(3);
    await act(async () => {
      fireEvent.click(cards[0]);
    });
    await run(300);
    fireEvent.click(screen.getByRole('radio', { name: /Heirloom/ }));
    expect(screen.getByRole('radiogroup', { name: 'Heirlooms' }).querySelectorAll('.ww-heirloom')).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: /Prune/ }));
    expect(screen.getByText(/the deck can't go below 8/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByTestId('deck-viewer')).toBeTruthy();
  });
});

function vigilResult(outcome: 'victory' | 'defeat', s: GameState): GameState {
  const result: GameResult = { mode: 'vigil', outcome, stars: outcome === 'victory' ? 3 : 0, cause: outcome === 'defeat' ? 'The c3 Vigil Candle was snuffed.' : null, finalDread: outcome === 'victory' ? 1 : s.vigil?.dreadMax ?? 12, retries: 0 };
  return { ...structuredClone(s), phase: 'game_over', result };
}

describe('finale screens', () => {
  it('victory: Dawn Breaks with stars, stats, the seed and four buttons', async () => {
    await startGame();
    await run(2400);
    await load(vigilResult('victory', latest()));
    const over = screen.getByTestId('game-over');
    expect(over.getAttribute('data-outcome')).toBe('victory');
    expect(within(over).getByText('Dawn Breaks')).toBeTruthy();
    expect(within(over).getByLabelText('3 of 3 stars')).toBeTruthy();
    for (const stat of ['Damage', 'Snuff slain', 'Plumes blocked', 'Candles saved', 'Retries']) expect(within(over).getByText(stat)).toBeTruthy();
    for (const label of ['Play Again', 'Same Seed', 'Change Hero', 'Main Menu']) expect(within(over).getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    expect(over.textContent).toContain(latest().seed);
  });

  it('defeat: The Long Night Falls with its cause and Retry this Night when enabled', async () => {
    await startGame();
    await run(2400);
    await load(vigilResult('defeat', latest()));
    const over = screen.getByTestId('game-over');
    expect(within(over).getByText('The Long Night Falls')).toBeTruthy();
    expect(within(over).getByText('The c3 Vigil Candle was snuffed.')).toBeTruthy();
    expect(within(over).getByTestId('retry-night')).toBeTruthy();
    expect(within(over).queryByRole('button', { name: /Change Hero/ })).toBeNull();
  });

  it('Last Flame: the podium and the Glory breakdown', async () => {
    await startGame(3, 'quick_last_flame', 'Velveteen, the Moth Witch');
    await run(2400);
    const s = structuredClone(latest());
    const blank = { snuff_kill: 0, rival_unit: 0, rival_hero: 0, bounty: 0, shrine: 0, boss_damage: 0, boss_kill: 0, survival: 0, hero_fell: 0, effect: 0 };
    const standing = (seat: number, placement: number, score: number): Standing => ({ seat, placement, score, glory: score - 5, standingBonus: 5, alive: true, eliminationBand: null, bossDamage: 0, breakdown: { ...blank, snuff_kill: score - 5, survival: 5 } });
    await load({ ...s, phase: 'game_over', result: { mode: 'last_flame', reason: 'boss_fell', standings: [standing(0, 1, 20), standing(1, 2, 12), standing(2, 3, 8)] } });
    const over = screen.getByTestId('game-over');
    expect(within(over).getByText('The Last Flame')).toBeTruthy();
    expect(within(over).getByText('1st')).toBeTruthy();
    expect(within(over).getByText('Snuff slain')).toBeTruthy();
    expect(within(over).getByText('Final score')).toBeTruthy();
  });
});

describe('Pass screen', () => {
  it('veils a Last Flame hot-seat turn until the player reveals it', async () => {
    await startGame(3, 'quick_last_flame', 'Velveteen, the Moth Witch');
    await run(2400);
    const s = playUntil(structuredClone(latest()), (x) => x.phase === 'players' && x.activeSeat === 0);
    s.players[1].kind = 'human';
    await load(s);
    const veil = screen.getByTestId('pass-screen');
    expect(within(veil).getByText('Pass the candle to Ash')).toBeTruthy();
    fireEvent.click(within(veil).getByRole('button', { name: 'I am Ash' }));
    expect(screen.queryByTestId('pass-screen')).toBeNull();
  });
});

describe('onboarding', () => {
  it('coach mark 1 points at the hero; Skip tutorial ends the coaching', async () => {
    await startGame(0);
    await run(2400);
    const ready = screen.queryByTestId('ready');
    if (ready) fireEvent.click(ready);
    await run(3000);
    const mark = screen.getByTestId('coach-mark');
    expect(mark.getAttribute('data-mark')).toBe('1');
    expect(mark.textContent).toContain('Click your hero');
    fireEvent.click(screen.getByTestId('skip-tutorial'));
    expect(screen.queryByTestId('coach-layer')).toBeNull();
  });

  it('a first-time tip shows once (here: the Plume tip on the first End Turn preview)', async () => {
    localStorage.removeItem('chesscard.tips');
    await startGame(1);
    await run(2400);
    const s = playUntil(structuredClone(latest()), (x) => x.phase === 'players');
    s.plumes = s.plumes.length > 0 ? s.plumes : [{ id: 'm900', pos: { x: 3, y: 5 }, enemyId: 'sootling', order: 99, source: 'schedule', hauntSeat: null, hauntedHeroId: null }];
    await load(s);
    await act(async () => {
      window.__ww?.controller.setEndTurnPreview(true);
    });
    await run(300);
    const tip = screen.getAllByTestId('tip').find((t) => t.getAttribute('data-tip') === 'plume');
    expect(tip?.textContent).toContain('Smoke Plume');
    expect(JSON.parse(localStorage.getItem('chesscard.tips') ?? '[]')).toContain('plume');
  });
});

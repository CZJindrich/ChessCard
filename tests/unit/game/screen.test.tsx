// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../../src/config';
import { setContent } from '../../../src/engine/content';
import type { Route } from '../../../src/ui/app/navigation';
import { createAppServices, type AppServices, type UiAudio } from '../../../src/ui/app/services';
import { App } from '../../../src/ui/App';

const FAST = JSON.stringify({ animation_speed: 3, enemy_turn_speed: 'instant', confirm_end_turn: 'smart' });

function fakeAudio(): UiAudio {
  return { unlock: vi.fn(), play: vi.fn(), setMusic: vi.fn() };
}

function services(route: Route, gamesCompleted = 3): { services: AppServices; audio: UiAudio } {
  const audio = fakeAudio();
  const storage = memoryStorage({
    'chesscard.profile': JSON.stringify({ version: 1, playerName: 'Ash', gamesCompleted }),
    'chesscard.presentation': FAST,
  });
  return {
    audio,
    services: createAppServices({ storage, audioBridge: null, audio, initialRoute: route, env: { now: () => new Date('2026-10-09T12:00:00Z'), randomSeed: () => 'screen-test', clipboard: null } }),
  };
}

/** Let the controller's timers (fast playback, instant enemy phases) run. */
async function run(ms = 6000): Promise<void> {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
  }
}

// jsdom has no layout: give the board stage a size so the board renders.
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
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.__ww;
});

describe('Game screen', () => {
  it('opens from the hero picker and shows the bars, plaques, board and Ready', async () => {
    const { services: app } = services({ screen: 'hero_pick', mode: 'quick_play' });
    render(<App services={app} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play as Brannoc, the Sconce Paladin' }));
    expect(screen.getByTestId('game-screen')).toBeTruthy();
    expect(screen.getByText('Night 1/3')).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'Players' })).getByText('Ash')).toBeTruthy();
    expect(screen.getByTestId('board-input')).toBeTruthy();
    expect(screen.getByTestId('ready')).toBeTruthy();
    expect(window.__ww?.controller.getSnapshot().latest.phase).toBe('night_setup');
    await run(1000);
  });

  it('plays a round: Ready, End Turn with the smart confirmation, the Snuff Strike, round 2', async () => {
    const route: Route = { screen: 'hero_pick', mode: 'quick_play' };
    const { services: app } = services(route);
    render(<App services={app} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play as Brannoc, the Sconce Paladin' }));
    fireEvent.click(screen.getByTestId('ready'));
    await run();
    const controller = window.__ww?.controller;
    expect(controller?.getSnapshot().latest.phase).toBe('players');
    expect(screen.getAllByRole('button', { name: /, \d Flame/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('end-turn'));
    const confirm = screen.queryByTestId('confirm-end-turn');
    if (confirm) fireEvent.click(confirm);
    await run();
    const latest = controller?.getSnapshot().latest;
    expect(latest?.round === 2 || latest?.result !== null).toBe(true);
  });

  it('shows the reason when an unplayable card is clicked', async () => {
    const { services: app, audio } = services({ screen: 'hero_pick', mode: 'quick_play' });
    render(<App services={app} />);
    fireEvent.pointerDown(window); // unlocks the (gated) UI audio
    fireEvent.click(screen.getByRole('button', { name: 'Play as Brannoc, the Sconce Paladin' }));
    fireEvent.click(screen.getByTestId('ready'));
    await run();
    const disabled = document.querySelector<HTMLButtonElement>('.ww-hand-card--disabled');
    if (!disabled) return;
    await act(async () => {
      fireEvent.click(disabled);
    });
    expect(screen.getByTestId('notice').textContent?.length).toBeGreaterThan(0);
    expect(audio.play).toHaveBeenCalledWith('uiError', undefined);
  });

  it('leaves to the Main Menu from the game menu', async () => {
    const { services: app } = services({ screen: 'hero_pick', mode: 'quick_play' });
    render(<App services={app} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play as Brannoc, the Sconce Paladin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Main Menu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave to Main Menu' }));
    expect(app.nav.get().stack).toEqual([{ screen: 'title' }]);
  });

  it('autoplays the all-bot demo', async () => {
    const { services: app } = services({ screen: 'how_to_play' });
    render(<App services={app} />);
    fireEvent.click(screen.getByRole('button', { name: /demo/i }));
    await run(8000);
    const latest = window.__ww?.controller.getSnapshot().latest;
    expect(latest && (latest.round > 1 || latest.night > 1 || latest.result !== null)).toBe(true);
  });
});

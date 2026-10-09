// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setContent } from '../../../src/engine/content';
import { CODEX_TABS, type GameRoute } from '../../../src/ui/app/navigation';
import { renderApp, TEST_NOW } from './helpers';

beforeEach(() => {
  setContent(null);
});

afterEach(() => {
  cleanup();
  setContent(null);
  document.documentElement.className = '';
});

function currentGame(app: ReturnType<typeof renderApp>): GameRoute {
  const route = app.services.nav.current();
  if (route.screen !== 'game') throw new Error(`expected the game route, got ${route.screen}`);
  return route;
}

describe('Title', () => {
  it('shows the menu from largest to smallest, with mode subtitles', () => {
    renderApp();
    const menu = screen.getByRole('navigation', { name: 'Main menu' });
    const names = within(menu)
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(names[0]).toContain('Quick Play');
    expect(names[0]).toContain('Vigil — team up against the Snuff');
    expect(names[1]).toContain('Quick Last Flame');
    expect(names[1]).toContain('Last Flame — every candle for itself');
    expect(names.slice(2).map((n) => n.replace(/(Seats|Enter).*/, '').trim())).toEqual(['New Game', 'Join Online', 'How to Play', 'Codex', 'Settings']);
    expect(screen.getByRole('heading', { name: 'Wickwatch' })).toBeTruthy();
  });

  it('unlocks audio on the first press, plays the menu music and click cues', () => {
    const app = renderApp();
    expect(app.audio.setMusic).toHaveBeenCalledWith('menu');
    fireEvent.pointerDown(window);
    expect(app.audio.unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Codex/ }));
    expect(app.audio.play).toHaveBeenCalledWith('uiClick', undefined);
    expect(app.services.nav.current().screen).toBe('codex');
  });

  it('toggles mute from the corner button', () => {
    const app = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Mute sound' }));
    expect(app.services.presentation.get().mute).toBe(true);
  });
});

describe('Hero picker', () => {
  it('lists four heroes and starts the first-ever Quick Play in one click', () => {
    const app = renderApp({ route: { screen: 'hero_pick', mode: 'quick_play' } });
    expect(screen.getByText('Night 1 · First Vigil — Survive 4 rounds. Keep the Candles lit.')).toBeTruthy();
    const cards = screen.getAllByRole('button', { name: /^Play as / });
    expect(cards).toHaveLength(4);
    expect(screen.getByText('Walks and strikes like a king. Shields his friends.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play as Brannoc, the Sconce Paladin' }));
    const game = currentGame(app);
    expect(game.config).toMatchObject({ mode: 'vigil', tutorial: true, seed: 'wick-test01' });
    expect(game.config.seats[0].hero).toBe('sconce_paladin');
    expect(screen.getByTestId('game-screen')).toBeTruthy();
  });

  it('shows the Last Flame primer the first time', () => {
    renderApp({ route: { screen: 'hero_pick', mode: 'quick_last_flame' } });
    expect(screen.getByText('The most Glory wins.')).toBeTruthy();
    expect(screen.getByText(/You and 2 Warden bots · 10×10/)).toBeTruthy();
  });

  it('uses the later-game Quick Play once games are recorded', () => {
    const app = renderApp({ route: { screen: 'hero_pick', mode: 'quick_play' }, profile: { gamesCompleted: 4 } });
    fireEvent.click(screen.getByRole('button', { name: 'Play as Vey, the Ember Duelist' }));
    expect(currentGame(app).config).toMatchObject({ tutorial: false, difficulty: 'dusk', tolls: true });
  });
});

describe('Setup', () => {
  it('renders seats, presets, basics and the Advanced panel', () => {
    renderApp({ route: { screen: 'setup' } });
    expect(screen.getByRole('radio', { name: 'Vigil — team up against the Snuff' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Seat 1 name' })).toBeTruthy();
    for (const chip of ['Short', 'Standard', 'Long', 'Daily']) expect(screen.getByRole('button', { name: chip })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Custom \d/ })).toHaveLength(3);
    for (const name of ['Start', 'Host Online', 'Copy settings code', 'Paste code']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByRole('group', { name: 'Dread maximum' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Truce' })).toBeNull();
  });

  it('switches to Last Flame with a bot seat and Last Flame rules', () => {
    renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Last Flame — every candle for itself' }));
    expect(screen.getByRole('textbox', { name: 'Seat 2 name' })).toHaveProperty('value', 'Warden of Tallow');
    expect(screen.getByRole('radiogroup', { name: 'Board size' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByRole('radiogroup', { name: 'Truce' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Dread maximum' })).toBeNull();
  });

  it('greys out a hero another seat holds, with the reason', () => {
    renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Brannoc, the Sconce Paladin' }));
    fireEvent.click(screen.getByRole('button', { name: /Add ai ally/i }));
    const seat2 = screen.getByRole('radiogroup', { name: 'Seat 2 hero' });
    const brannoc = within(seat2).getByRole('radio', { name: 'Brannoc, the Sconce Paladin' });
    expect(brannoc.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(brannoc);
    expect(brannoc.getAttribute('aria-checked')).toBe('false');
  });

  it('starts a game with the resolved config and keeps the selection for Back', () => {
    const app = renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('radio', { name: /Long/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    const game = currentGame(app);
    expect(game.config).toMatchObject({ length: 'long', nights: 6, seed: 'wick-test01', turn_timer: 'off' });
    act(() => app.services.nav.back());
    expect(screen.getByRole('radio', { name: /Long/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('hosts online with the online timer default', () => {
    const app = renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('button', { name: /Host Online/ }));
    const route = app.services.nav.current();
    expect(route.screen === 'lobby' && route.role === 'host' && route.config.turn_timer).toBe('normal');
    expect(screen.getByRole('button', { name: /Open room/ })).toBeTruthy();
  });

  it('applies the Daily and locks its parts', () => {
    renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
    expect(screen.getByRole('button', { name: 'Daily' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' }).className).toContain('blocked');
  });

  it('pastes a settings code and lists clamped and unknown keys', () => {
    const app = renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('button', { name: /Paste code/ }));
    const payload = { v: 1, presets: { mode: 'vigil', length: 'standard', difficulty: 'midnight' }, overrides: { hand_size: 12, potions: 2 }, contentHash: 'x' };
    const code = 'WAX1:' + btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    fireEvent.change(screen.getByRole('textbox', { name: 'Settings code' }), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
    const toast = app.services.toasts.get()[0];
    expect(toast.title).toBe('Settings code applied');
    expect(toast.lines).toContain('Hand size adjusted from 12 to 7');
    expect(toast.lines).toContain('Ignored unknown settings: potions');
    expect(screen.getByRole('radio', { name: /Standard/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('rejects a damaged code inside the dialog', () => {
    renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('button', { name: /Paste code/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Settings code' }), { target: { value: 'not a code' } });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
    expect(screen.getByText(/Not a Wickwatch settings code/)).toBeTruthy();
  });

  it('shows the code when there is no clipboard, and saves a Custom preset', () => {
    const app = renderApp({ route: { screen: 'setup' } });
    fireEvent.click(screen.getByRole('button', { name: /Copy settings code/ }));
    expect((screen.getByRole('textbox', { name: 'Settings code' }) as HTMLTextAreaElement).value).toMatch(/^WAX1:/);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Custom 1' }));
    expect(app.services.profile.get().customPresets[0]?.name).toBe('Custom 1');
    expect(screen.getByRole('button', { name: 'Custom 1' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('How to Play', () => {
  it('shows the 8 rules, 8 runes and the glossary, and starts the tutorial', () => {
    const app = renderApp({ route: { screen: 'how_to_play' } });
    expect(screen.getAllByRole('listitem').filter((li) => li.className === 'ww-rulecard')).toHaveLength(8);
    expect(screen.getByText('Red tiles are promises.')).toBeTruthy();
    for (const rune of ['King step', 'Knight leap', 'Rook slide', 'Bishop slide', 'Queen slide', 'Pawn', 'Flying', 'Artillery']) {
      expect(screen.getAllByText(rune).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole('button', { name: /Glossary/ }));
    expect(screen.getByText('First Light')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Play the tutorial/ }));
    expect(app.services.nav.current()).toEqual({ screen: 'hero_pick', mode: 'tutorial' });
  });

  it('starts the demo as an all-bot game', () => {
    const app = renderApp({ route: { screen: 'how_to_play' } });
    fireEvent.click(screen.getByRole('button', { name: /Watch a 20-second demo/ }));
    const game = currentGame(app);
    expect(game.demo).toBe(true);
    expect(game.config.seats.every((s) => s.kind !== 'human')).toBe(true);
  });
});

describe('Codex', () => {
  it('renders every tab from the content registry', () => {
    renderApp({ route: { screen: 'codex' } });
    expect(screen.getAllByRole('tab')).toHaveLength(CODEX_TABS.length);
    const expectations: Record<string, string> = {
      Heroes: 'Brannoc',
      Units: 'Taper Captain',
      Cards: 'Grand Illumination, rite, cost 4',
      Snuff: 'Snuffer Knight',
      Bosses: 'Nocturna',
      Tolls: 'Black Sun',
      'Moth Die': 'Draw +1',
      Tiles: 'Hot Wax',
      'Heirlooms & Boons': 'Brass Thimble',
    };
    for (const [tab, text] of Object.entries(expectations)) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
      const panel = screen.getByRole('tabpanel');
      expect(within(panel).queryAllByText(text).length + within(panel).queryAllByLabelText(text).length, `${tab}: ${text}`).toBeGreaterThan(0);
    }
  });

  it('filters by search text', () => {
    renderApp({ route: { screen: 'codex', tab: 'units' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the Codex' }), { target: { value: 'censer' } });
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getAllByRole('article')).toHaveLength(1);
    expect(within(panel).getByText('Incense Acolyte')).toBeTruthy();
  });

  it('lists mod errors with file and path, then loads a valid mod and resets', () => {
    const app = renderApp({ route: { screen: 'codex', tab: 'cards' } });
    fireEvent.click(screen.getByRole('button', { name: /Load mod/ }));
    const textbox = screen.getByRole('textbox', { name: 'Mod JSON' });
    fireEvent.change(textbox, { target: { value: '{ "cards": [ { "name": "no id" } ], "potions": [] }' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply mod/ }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('potions')).toBeTruthy();
    expect(within(alert).getByText('[0]')).toBeTruthy();
    expect(app.services.content.get().modded).toBe(false);

    fireEvent.change(textbox, { target: { value: '{ "cards": [ { "id": "spark", "name": "Bright Spark", "cost": 0 } ] }' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply mod/ }));
    expect(app.services.content.get().modded).toBe(true);
    expect(screen.getByLabelText('Bright Spark, rite, cost 0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Load mod/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reset to base content/ }));
    expect(app.services.content.get().modded).toBe(false);
    expect(screen.getByLabelText('Spark, rite, cost 1')).toBeTruthy();
  });
});

describe('Settings', () => {
  it('applies presentation settings live to the document root', () => {
    const app = renderApp({ route: { screen: 'settings' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Readable font' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Reduced motion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase UI scale' }));
    expect(app.services.presentation.get()).toMatchObject({ readable_font: true, reduced_motion: true, ui_scale: 110 });
    const root = document.documentElement;
    expect(root.classList.contains('ww-readable-font')).toBe(true);
    expect(root.classList.contains('ww-reduced-motion')).toBe(true);
    expect(root.style.getPropertyValue('--ww-ui-scale')).toBe('1.1');
    expect(screen.getByRole('slider', { name: 'Music' })).toBeTruthy();
  });

  it('opens as a modal from any menu screen and closes on Escape', () => {
    renderApp({ route: { screen: 'codex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByRole('radiogroup', { name: 'Animation speed' })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Lobby and game screen', () => {
  it('normalises a typed room code and explains that online play is not wired yet', () => {
    const app = renderApp({ route: { screen: 'lobby', role: 'join' } });
    const input = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.change(input, { target: { value: 'kw-tra' } });
    expect((input as HTMLInputElement).value).toBe('KWTR');
    fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    expect(app.services.toasts.get()[0]?.title).toBe('Online play is not connected in this build');
  });

  it('goes back to the title from the game menu', () => {
    const app = renderApp({ route: { screen: 'hero_pick', mode: 'quick_play' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Play as / })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Main Menu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave to Main Menu' }));
    expect(app.services.nav.get().stack).toEqual([{ screen: 'title' }]);
  });

  it('treats Escape as Back on menu screens', () => {
    const app = renderApp({ route: { screen: 'title' } });
    act(() => app.services.nav.push({ screen: 'codex' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(app.services.nav.current().screen).toBe('title');
    expect(TEST_NOW.getUTCFullYear()).toBe(2026);
  });
});

describe('Online hook', () => {
  it('hands Join to the online client when one is provided', () => {
    const online = { openRoom: vi.fn(), joinRoom: vi.fn() };
    renderApp({ route: { screen: 'lobby', role: 'join', code: 'bcdf' }, online });
    fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    expect(online.joinRoom).toHaveBeenCalledWith('BCDF');
  });
});

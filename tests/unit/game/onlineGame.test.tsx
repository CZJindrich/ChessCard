// @vitest-environment jsdom
/**
 * The game screen online (src/net through `createNetTransport(route.online)`), against a scripted
 * server (a fake socket): the controller drives only this tab's seat and never advances the game
 * itself; the plaques say who plays each seat (you, another player, reconnecting); the decision
 * timer burns beside End Turn and ticks in its last 10 seconds; and the finale offers "Back to
 * lobby" to the host (everyone follows) instead of Play Again / Same Seed.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customSelection, memoryStorage, resolveConfig } from '../../../src/config';
import { createGame, viewFor } from '../../../src/engine';
import { setContent } from '../../../src/engine/content';
import type { GameConfig, GameState, SeatConfig } from '../../../src/engine/types';
import { OnlineSession, type ClientMessage, type RoomSeat, type RoomSnapshot, type ServerMessage, type WebSocketLike } from '../../../src/net';
import { onlineGameRoute } from '../../../src/ui/app/online';
import { createAppServices, type AppServices, type UiAudio } from '../../../src/ui/app/services';
import { App } from '../../../src/ui/App';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  push(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const SEATS: SeatConfig[] = [
  { kind: 'human', hero: 'sconce_paladin', name: 'Ann' },
  { kind: 'human', hero: 'moth_witch', name: 'Bob' },
];

function onlineConfig(): GameConfig {
  const selection = { ...customSelection({ mode: 'vigil' }), locked: { seats: SEATS }, overrides: { seed: 'online-ui' } };
  const resolved = resolveConfig(selection, { online: true });
  if (!resolved.validation.ok) throw new Error(resolved.validation.issues.map((i) => i.message).join(' '));
  return resolved.config;
}

function seat(partial: Partial<RoomSeat> & { seat: number }): RoomSeat {
  return { kind: 'human', hero: null, name: 'Open seat', occupantId: null, pendingId: null, connected: true, ready: true, status: 'human', graceEndsAt: null, ...partial };
}

function playingRoom(config: GameConfig, over: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    code: 'KWTR',
    hostId: 'host',
    phase: 'playing',
    seats: [seat({ seat: 0, name: 'Ann', hero: 'sconce_paladin', occupantId: 'host' }), seat({ seat: 1, name: 'Bob', hero: 'moth_witch', occupantId: 'guest' })],
    members: [
      { id: 'host', name: 'Ann', connected: true, seat: 0, host: true },
      { id: 'guest', name: 'Bob', connected: true, seat: 1, host: false },
    ],
    config: { ...config, seed: '' },
    selection: null,
    configVersion: 1,
    reconnectGrace: 120,
    canStart: false,
    startBlocker: null,
    game: { startedAt: Date.now(), over: false },
    expiresAt: Date.now() + 1_800_000,
    ...over,
  };
}

function gameMessage(view: GameState, you: number, seq: number): ServerMessage {
  return {
    type: 'game',
    seq,
    seats: [
      { seat: 0, controllerId: 'host', bot: null },
      { seat: 1, controllerId: 'guest', bot: null },
    ],
    you: [you],
    view,
    events: [],
    action: null,
    serverTime: Date.now(),
  };
}

interface Setup {
  services: AppServices;
  socket: FakeSocket;
  session: OnlineSession;
  audio: { play: ReturnType<typeof vi.fn> };
  state: GameState;
}

/** A tab seated at `you` (clientId `me`) in a running game, on the game screen. */
function setup(me: 'host' | 'guest'): Setup {
  const sockets: FakeSocket[] = [];
  const session = new OnlineSession({
    storage: memoryStorage(),
    url: 'ws://test/ws',
    socket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });
  session.connect();
  const socket = sockets[0];
  socket.open();
  socket.push({ type: 'welcome', protocol: 1, token: 'tok', clientId: me, name: me === 'host' ? 'Ann' : 'Bob', serverTime: Date.now() });
  const config = onlineConfig();
  const state = createGame(config);
  const you = me === 'host' ? 0 : 1;
  socket.push({ type: 'room', room: playingRoom(config) });
  socket.push(gameMessage(viewFor(state, you), you, 1));
  const route = onlineGameRoute(session);
  if (!route) throw new Error('no online game route');
  const audio = { unlock: vi.fn(), play: vi.fn(), setMusic: vi.fn() } satisfies UiAudio;
  const storage = memoryStorage({
    'chesscard.profile': JSON.stringify({ version: 1, playerName: 'Ann', gamesCompleted: 3 }),
    'chesscard.presentation': JSON.stringify({ animation_speed: 3, enemy_turn_speed: 'instant' }),
  });
  const services = createAppServices({ storage, audioBridge: null, audio, initialRoute: route, online: null, env: { clipboard: null } });
  // Unlock the gated audio, as the first click on a real page does.
  services.audio.unlock();
  render(<App services={services} />);
  return { services, socket, session, audio, state };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  setContent(null);
  localStorage.setItem('chesscard.tips', JSON.stringify(['plume', 'dread', 'push', 'bump', 'hot_wax', 'chimney', 'shrine', 'ward', 'dazed', 'aimed', 'smoldering', 'toll', 'moth_die', 'chandlery', 'boss_phase', 'crown', 'check', 'gloam_warning', 'lit_shrine']));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.__ww;
});

async function run(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
  }
}

describe('the game screen online', () => {
  it('drives only this seat, never advances the game itself, and tags every plaque', async () => {
    const { socket } = setup('guest');
    await run(300);
    const controller = window.__ww?.controller;
    expect(controller?.getSnapshot().controlledSeats).toEqual([1]);
    expect(screen.getByTestId('seat-tag-1').textContent).toBe('You');
    expect(screen.getByTestId('seat-tag-0').textContent).toBe('Online');
    // Night setup: Ready goes to the server as an action; nothing is applied locally and no
    // `advance` is ever sent (the server paces the game).
    fireEvent.click(screen.getByTestId('ready'));
    await run(3000);
    const actions = socket.sent.filter((m): m is Extract<ClientMessage, { type: 'action' }> => m.type === 'action').map((m) => m.action);
    expect(actions).toEqual([{ type: 'ready', seat: 1 }]);
    expect(controller?.getSnapshot().latest.players[1].ready).toBe(false);
    // A window.__ww.load is a no-op online (crafted states are a local-game tool).
    window.__ww?.load({ ...structuredClone(controller?.getSnapshot().latest as GameState), round: 3 });
    expect(controller?.getSnapshot().latest.round).toBe(0);
  });

  it('shows a reconnecting badge with the grace left', async () => {
    const { socket, state } = setup('host');
    const config = state.config;
    act(() =>
      socket.push({
        type: 'room',
        room: playingRoom(config, {
          seats: [
            seat({ seat: 0, name: 'Ann', hero: 'sconce_paladin', occupantId: 'host' }),
            seat({ seat: 1, name: 'Bob', hero: 'moth_witch', occupantId: 'guest', connected: false, status: 'reconnecting', graceEndsAt: Date.now() + 95_000 }),
          ],
        }),
      }),
    );
    await run(1100);
    expect(screen.getByTestId('seat-tag-1').textContent).toMatch(/^Reconnecting 1:3\d$/);
  });

  it('burns the decision timer by End Turn and ticks once a second in its last 10 seconds', async () => {
    const { socket, audio } = setup('guest');
    act(() => socket.push({ type: 'timer', seat: null, phase: 'night_setup', kind: 'deploy', deadline: Date.now() + 12_000, serverTime: Date.now() }));
    await run(300);
    const timer = screen.getByTestId('turn-timer');
    expect(timer.textContent).toContain('Deploy');
    expect(timer.textContent).toContain('0:12');
    const ticks = (): number => audio.play.mock.calls.filter(([name, opts]) => name === 'uiClick' && (opts as { pitch?: number } | undefined)?.pitch === 0.6).length;
    expect(ticks()).toBe(0);
    await run(5000);
    expect(ticks()).toBeGreaterThanOrEqual(3);
    expect(timer.className).toContain('ww-turn-timer--urgent');
    // Someone else's timer shows their name and never ticks for this player.
    act(() => socket.push({ type: 'timer', seat: 0, phase: 'players', kind: 'turn', deadline: Date.now() + 8_000, serverTime: Date.now() }));
    const before = ticks();
    await run(2000);
    expect(screen.getByTestId('turn-timer').textContent).toContain('Ann');
    expect(ticks()).toBe(before);
  });

  it('game over: the host takes the room back to the lobby; no Play Again or Same Seed', async () => {
    const { socket, state } = setup('host');
    const over: GameState = { ...structuredClone(state), phase: 'game_over', result: { mode: 'vigil', outcome: 'victory', stars: 2, cause: null, finalDread: 3, retries: 0 } };
    act(() => socket.push({ ...(gameMessage(viewFor(over, 0), 0, 2) as Extract<ServerMessage, { type: 'game' }>), reveal: { seed: 'revealed-seed', salt: 'salt' } }));
    await run(500);
    const finale = screen.getByTestId('game-over');
    expect(finale.getAttribute('data-outcome')).toBe('victory');
    expect(screen.queryByRole('button', { name: /Play Again/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Same Seed/ })).toBeNull();
    expect(finale.textContent).toContain('revealed-seed');
    fireEvent.click(screen.getByTestId('back-to-lobby'));
    expect(socket.sent).toContainEqual({ type: 'return_to_lobby' });
  });

  it('game over for a guest: wait for the host, or leave the room', async () => {
    const { socket, state, services } = setup('guest');
    const over: GameState = { ...structuredClone(state), phase: 'game_over', result: { mode: 'vigil', outcome: 'victory', stars: 1, cause: null, finalDread: 5, retries: 0 } };
    act(() => socket.push(gameMessage(viewFor(over, 1), 1, 2)));
    await run(500);
    expect(screen.queryByTestId('back-to-lobby')).toBeNull();
    expect(screen.getByText('The host will take everyone back to the lobby.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Leave room/ }));
    expect(services.nav.current().screen).toBe('title');
  });
});

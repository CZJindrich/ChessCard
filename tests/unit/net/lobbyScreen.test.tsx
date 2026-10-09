// @vitest-environment jsdom
/**
 * The lobby screen against a scripted server (a fake socket): Join with a name and code, take
 * a seat, Ready, the host's Start button and its blocker, "reconnecting" badges, and entering
 * the game route with the online session when the game starts.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../../src/config';
import { setContent } from '../../../src/engine/content';
import type { ClientMessage, RoomSeat, RoomSnapshot, ServerMessage, WebSocketLike } from '../../../src/net';
import type { Route } from '../../../src/ui/app/navigation';
import { createOnlineService } from '../../../src/ui/app/online';
import { createAppServices, type AppServices } from '../../../src/ui/app/services';
import { App } from '../../../src/ui/App';
import { AuthoritativeGame } from '../../../server/game';
import { onlineConfig } from './helpers';

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
  types(): string[] {
    return this.sent.map((m) => m.type);
  }
}

const { config, selection } = onlineConfig('vigil', [
  { kind: 'human', hero: 'sconce_paladin', name: 'Ann' },
  { kind: 'human', hero: 'moth_witch', name: 'Player 2' },
  { kind: 'bot_warden', hero: 'lampwright', name: 'Warden' },
]);

function seat(partial: Partial<RoomSeat> & { seat: number }): RoomSeat {
  return { kind: 'human', hero: null, name: 'Open seat', occupantId: null, pendingId: null, connected: false, ready: false, status: 'open', graceEndsAt: null, ...partial };
}

function room(partial: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    code: 'KWTR',
    hostId: 'host',
    phase: 'lobby',
    seats: [
      seat({ seat: 0, name: 'Ann', hero: 'sconce_paladin', occupantId: 'host', connected: true, status: 'human', ready: true }),
      seat({ seat: 1, hero: 'moth_witch' }),
      seat({ seat: 2, kind: 'bot_warden', name: 'Warden', hero: 'lampwright', status: 'bot', ready: true }),
    ],
    members: [
      { id: 'host', name: 'Ann', connected: true, seat: 0, host: true },
      { id: 'me', name: 'Bob', connected: true, seat: null, host: false },
    ],
    config: { ...config, seed: '' },
    selection: null,
    configVersion: 1,
    reconnectGrace: 120,
    canStart: false,
    startBlocker: null,
    game: null,
    expiresAt: Date.now() + 1_800_000,
    ...partial,
  };
}

let sockets: FakeSocket[] = [];

function setup(route: Route): { services: AppServices; socket: () => FakeSocket } {
  sockets = [];
  const storage = memoryStorage();
  const services = createAppServices({ storage, audioBridge: null, audio: { unlock: vi.fn(), play: vi.fn(), setMusic: vi.fn() }, initialRoute: route, online: null, env: { clipboard: null } });
  services.online = createOnlineService({
    nav: services.nav,
    toasts: services.toasts,
    storage,
    session: {
      url: 'ws://test/ws',
      socket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
    },
  });
  render(<App services={services} />);
  return {
    services,
    socket: () => {
      const s = sockets[sockets.length - 1];
      if (!s) throw new Error('no socket opened');
      return s;
    },
  };
}

afterEach(() => {
  cleanup();
  setContent(null);
});

describe('lobby screen', () => {
  it('joins with a name and code, takes a seat, Readies, and enters the game when it starts', () => {
    const { services, socket } = setup({ screen: 'lobby', role: 'join', code: 'kwtr' });
    // The join form connects at once, so the status line means something.
    act(() => socket().open());
    expect(socket().sent[0]).toMatchObject({ type: 'hello', protocol: 1 });
    act(() => socket().push({ type: 'welcome', protocol: 1, token: 'tok', clientId: 'me', name: 'Lanternwarden', serverTime: Date.now() }));
    expect(screen.getByText(/^Connected/)).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Bob' } });
    expect((screen.getByRole('textbox', { name: 'Room code' }) as HTMLInputElement).value).toBe('KWTR');
    fireEvent.click(screen.getByRole('button', { name: /^Join$/ }));
    expect(socket().sent).toContainEqual({ type: 'set_name', name: 'Bob' });
    expect(socket().sent).toContainEqual({ type: 'join_room', code: 'KWTR' });

    act(() => socket().push({ type: 'room', room: room() }));
    expect(screen.getByTestId('room-code').getAttribute('aria-label')).toBe('Room code K W T R');
    const open = screen.getByTestId('seat-1');
    expect(within(open).getByText('Open seat')).toBeTruthy();
    expect(within(screen.getByTestId('seat-0')).getByText('Host')).toBeTruthy();
    expect(within(screen.getByTestId('seat-2')).getByText(/AI ally · Normal/)).toBeTruthy();
    fireEvent.click(within(open).getByRole('button', { name: 'Take seat' }));
    expect(socket().sent).toContainEqual({ type: 'claim_seat', seat: 1 });

    const seated = room({
      seats: [
        seat({ seat: 0, name: 'Ann', occupantId: 'host', connected: true, status: 'human', ready: true }),
        seat({ seat: 1, name: 'Bob', hero: 'moth_witch', occupantId: 'me', connected: true, status: 'human' }),
        seat({ seat: 2, kind: 'bot_warden', name: 'Warden', status: 'bot', ready: true }),
      ],
      members: [
        { id: 'host', name: 'Ann', connected: true, seat: 0, host: true },
        { id: 'me', name: 'Bob', connected: true, seat: 1, host: false },
      ],
    });
    act(() => socket().push({ type: 'room', room: seated }));
    expect(within(screen.getByTestId('seat-1')).getByText('You')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /I'm Ready/ }));
    expect(socket().sent).toContainEqual({ type: 'set_ready', ready: true });
    expect(screen.getByText('The host starts once every seated player is Ready.')).toBeTruthy();

    // The game starts: the room turns to 'playing' and the first view arrives.
    const game = new AuthoritativeGame({ ...config, seats: config.seats.map((s, i) => (i === 1 ? { ...s, name: 'Bob' } : s)) }, 'salt');
    act(() => socket().push({ type: 'room', room: { ...seated, phase: 'playing', game: { startedAt: Date.now(), over: false } } }));
    act(() =>
      socket().push({
        type: 'game',
        seq: 1,
        seats: [
          { seat: 0, controllerId: 'host', bot: null },
          { seat: 1, controllerId: 'me', bot: null },
          { seat: 2, controllerId: null, bot: 'bot_warden' },
        ],
        you: [1],
        view: game.viewFor(1),
        events: [],
        action: null,
        serverTime: Date.now(),
      }),
    );
    const route = services.nav.current();
    expect(route.screen).toBe('game');
    expect(route.screen === 'game' && route.online).toBe(services.online?.session);
    expect(route.screen === 'game' && route.config.seed).toBe('');
  });

  it('opens a room for the host, shows why Start waits, and starts when everyone is Ready', () => {
    const { socket } = setup({ screen: 'lobby', role: 'host', config, selection });
    act(() => socket().open());
    act(() => socket().push({ type: 'welcome', protocol: 1, token: 'tok', clientId: 'host', name: 'Ann', serverTime: Date.now() }));
    expect(socket().types()).toEqual(['hello', 'create_room', 'ping']);
    expect(screen.getByText('Opening your room…')).toBeTruthy();

    const blocked = room({
      selection,
      config,
      startBlocker: 'Waiting for Bob to reconnect.',
      seats: [
        seat({ seat: 0, name: 'Ann', occupantId: 'host', connected: true, status: 'human', ready: true }),
        seat({ seat: 1, name: 'Bob', occupantId: 'me', status: 'reconnecting', graceEndsAt: Date.now() + 65_000 }),
        seat({ seat: 2, kind: 'bot_warden', name: 'Warden', status: 'bot', ready: true }),
      ],
    });
    act(() => socket().push({ type: 'room', room: blocked }));
    expect(within(screen.getByTestId('seat-1')).getByText('Reconnecting')).toBeTruthy();
    expect(within(screen.getByTestId('seat-1')).getByText(/1:0[45]/)).toBeTruthy();
    expect(screen.getByText('Waiting for Bob to reconnect.')).toBeTruthy();
    const start = screen.getByTestId('start-game');
    expect(start.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(start);
    expect(socket().types()).not.toContain('start_game');

    // The host's settings: a difficulty change goes to the server.
    fireEvent.click(screen.getByRole('radio', { name: /Hard/ }));
    const update = socket().sent.find((m) => m.type === 'update_config');
    expect(update && update.type === 'update_config' && update.config.difficulty).toBe('midnight');

    act(() => socket().push({ type: 'room', room: { ...blocked, canStart: true, startBlocker: null, seats: blocked.seats.map((s) => (s.seat === 1 ? { ...s, status: 'human', connected: true, ready: true, graceEndsAt: null } : s)) } }));
    fireEvent.click(screen.getByTestId('start-game'));
    expect(socket().types()).toContain('start_game');
  });

  it('leaves the room when the player goes back to the title', () => {
    const { services, socket } = setup({ screen: 'title' });
    act(() => services.nav.push({ screen: 'lobby', role: 'join' }));
    act(() => socket().open());
    act(() => socket().push({ type: 'welcome', protocol: 1, token: 'tok', clientId: 'me', name: 'Bob', serverTime: Date.now() }));
    act(() => socket().push({ type: 'room', room: room() }));
    fireEvent.click(screen.getByRole('button', { name: /Leave room/ }));
    expect(socket().types()).toContain('leave');
    expect(services.nav.current().screen).toBe('title');
    expect(services.online?.session?.get().room).toBeNull();
  });
});

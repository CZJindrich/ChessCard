/**
 * The online stack end to end, in process: the real server on an ephemeral port, two clients
 * (OnlineSession over `ws` sockets), a room created and joined by code, seats claimed, Ready,
 * a Vigil co-op game with one AI ally played for a few actions, and a Last Flame game checking
 * hidden information.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/engine/types';
import type { OnlineSession } from '../../../src/net';
import { NetTransport } from '../../../src/net';
import type { RunningServer } from '../../../server/app';
import { decisionFor, onlineConfig, session, testServer, waitFor } from './helpers';

let server: RunningServer;
const sessions: OnlineSession[] = [];

function player(server: RunningServer, name: string): OnlineSession {
  const s = session(server, name);
  sessions.push(s);
  return s;
}

beforeEach(async () => {
  server = await testServer();
});

afterEach(async () => {
  for (const s of sessions.splice(0)) s.leave();
  await server.close();
});

/** Host + guest in one room, both seated and Ready; returns the room code. */
async function seatTwo(host: OnlineSession, guest: OnlineSession, mode: 'vigil' | 'last_flame'): Promise<string> {
  const { config, selection } = onlineConfig(mode, [
    { kind: 'human', hero: 'sconce_paladin', name: 'Host seat' },
    { kind: 'human', hero: 'moth_witch', name: 'Guest seat' },
    { kind: 'bot_warden', hero: 'lampwright', name: 'Warden' },
  ]);
  host.createRoom(config, selection);
  const opened = await waitFor(host, (s) => s.room !== null, 'the room to open');
  const code = opened.room?.code ?? '';
  expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ]{4}$/);
  expect(opened.room?.seats[0].occupantId).toBe(opened.clientId);
  expect(opened.room?.hostId).toBe(opened.clientId);

  guest.joinRoom(code.toLowerCase());
  await waitFor(guest, (s) => s.room?.code === code, 'the guest to join');
  guest.claimSeat(0);
  guest.claimSeat(1);
  await waitFor(guest, (s) => s.room?.seats[1].occupantId === s.clientId, 'the guest to take seat 2');
  expect(guest.get().room?.seats[0].occupantId).toBe(host.get().clientId);
  expect(guest.get().room?.selection).toBeNull();
  expect(guest.get().room?.config.seed).toBe('');

  host.setReady(true);
  await waitFor(host, (s) => s.room?.startBlocker === 'Waiting for Bob to be Ready.', 'only the guest to be unready');
  guest.setReady(true);
  await waitFor(host, (s) => s.room?.canStart === true, 'the room to be startable');
  host.startGame();
  await Promise.all([waitFor(host, (s) => s.game !== null, 'the host game'), waitFor(guest, (s) => s.game !== null, 'the guest game')]);
  return code;
}

/** Let each session answer its decisions until `until` holds (or the step budget runs out). */
async function play(players: Array<{ s: OnlineSession; seat: number }>, until: () => boolean, steps = 80, move = true): Promise<void> {
  for (let i = 0; i < steps && !until(); i++) {
    let acted = false;
    for (const { s, seat } of players) {
      const view = s.get().game?.view;
      if (!view) continue;
      const action = decisionFor(view, seat, { move });
      if (!action) continue;
      const seq = s.get().game?.seq ?? 0;
      expect(s.sendAction(action)).toBe(true);
      await waitFor(s, (st) => (st.game?.seq ?? 0) > seq, `${action.type} to apply`).catch(() => undefined);
      acted = true;
      break;
    }
    if (!acted) await new Promise((r) => setTimeout(r, 15));
  }
}

describe('online play over real sockets', () => {
  it('runs a Vigil co-op room: create, join by code, seats, Ready, start and play', async () => {
    const host = player(server, 'Ann');
    const guest = player(server, 'Bob');
    await seatTwo(host, guest, 'vigil');

    const hostGame = host.get().game;
    const guestGame = guest.get().game;
    expect(hostGame?.you).toEqual([0]);
    expect(guestGame?.you).toEqual([1]);
    expect(hostGame?.view.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Warden']);
    expect(hostGame?.view.players.map((p) => p.kind)).toEqual(['human', 'human', 'bot_warden']);
    expect(hostGame?.seats.map((s) => s.bot)).toEqual([null, null, 'bot_warden']);
    // The seed stays secret until game over.
    expect(hostGame?.view.seed).toBe('');
    expect(hostGame?.view.config.seed).toBe('');

    // Both players get through night setup, the Toll and into the first players phase, then
    // each takes a turn (claim, a move, end turn); the AI ally acts by itself.
    const players = [
      { s: host, seat: 0 },
      { s: guest, seat: 1 },
    ];
    await play(players, () => host.get().game?.view.phase === 'players');
    expect(host.get().game?.view.phase).toBe('players');
    const round = host.get().game?.view.round ?? 0;
    await play(players, () => (host.get().game?.view.round ?? 0) > round, 60);
    const hostView = host.get().game?.view;
    expect(hostView?.round).toBe(round + 1);

    // Both clients converge on the same state (Vigil hides only deck order, for everyone).
    await waitFor(guest, (s) => s.game?.seq === host.get().game?.seq, 'the guest to catch up');
    const strip = (v: unknown): string => JSON.stringify(v);
    expect(strip(guest.get().game?.view)).toBe(strip(host.get().game?.view));
    // The AI ally ended its own turn in round 1.
    const allyLog = hostView?.log.some((l) => l.seat === 2) ?? false;
    expect(allyLog || hostView?.players[2].turnEnded === false).toBe(true);
  }, 30_000);

  it('rejects actions for seats the sender does not control', async () => {
    const host = player(server, 'Ann');
    const guest = player(server, 'Bob');
    await seatTwo(host, guest, 'vigil');
    const rejected = new Promise<string>((resolve) => guest.rejects.on((r) => resolve(r.reason)));
    guest.sendAction({ type: 'ready', seat: 0 });
    expect(await rejected).toBe('NOT_YOUR_TURN');
  }, 15_000);

  it('drives a GameController-style NetTransport from the session', async () => {
    const host = player(server, 'Ann');
    const guest = player(server, 'Bob');
    await seatTwo(host, guest, 'vigil');
    const transport = new NetTransport(guest);
    expect(transport.runsAutomation).toBe(false);
    expect(transport.controlledSeats()).toEqual([1]);
    expect(transport.getState().phase).toBe('night_setup');
    const updates: string[] = [];
    transport.onUpdate((u) => updates.push(u.action?.type ?? 'resync'));
    expect(transport.send({ type: 'ready', seat: 0 })).toEqual({ ok: false, reason: 'NOT_YOUR_TURN' });
    expect(transport.send({ type: 'ready', seat: 1 })).toEqual({ ok: true });
    await waitFor(guest, (s) => s.game?.view.players[1].ready === true, 'the guest to be ready');
    expect(updates).toContain('ready');
    expect(transport.getState().players[1].ready).toBe(true);
    transport.dispose();
  }, 15_000);

  it('hides rival hands and draws in Last Flame', async () => {
    const host = player(server, 'Ann');
    const guest = player(server, 'Bob');
    const seenByHost: GameEvent[] = [];
    host.games.on((m) => seenByHost.push(...m.events));
    await seatTwo(host, guest, 'last_flame');
    const players = [
      { s: host, seat: 0 },
      { s: guest, seat: 1 },
    ];
    // Hands are dealt at night setup; play on to Night 2, whose setup deals again through an
    // `advance` the clients receive as events.
    expect(host.get().game?.view.players[0].hand.length).toBeGreaterThan(0);
    await play(players, () => (host.get().game?.view.night ?? 0) >= 2, 400, false);
    expect(host.get().game?.view.night).toBe(2);
    const hostView = host.get().game?.view;
    const guestView = guest.get().game?.view;
    expect(hostView?.players[0].hand.length).toBeGreaterThan(0);
    expect(hostView?.players[0].hand.every((c) => c.id !== 'hidden')).toBe(true);
    expect(guestView?.players[1].hand.every((c) => c.id !== 'hidden')).toBe(true);
    // The guest's hand, as the host sees it.
    await waitFor(host, (s) => (s.game?.view.players[1].hand.length ?? 0) > 0, 'the guest hand to show as cards');
    expect(host.get().game?.view.players[1].hand.every((c) => c.id === 'hidden')).toBe(true);
    expect(guest.get().game?.view.players[0].hand.every((c) => c.id === 'hidden')).toBe(true);
    // Rivals' draws arrive as counts only.
    const rivalDraws = seenByHost.filter((e): e is Extract<GameEvent, { type: 'cards_drawn' }> => e.type === 'cards_drawn' && e.seat !== 0);
    const ownDraws = seenByHost.filter((e): e is Extract<GameEvent, { type: 'cards_drawn' }> => e.type === 'cards_drawn' && e.seat === 0);
    expect(rivalDraws.length).toBeGreaterThan(0);
    expect(rivalDraws.every((e) => e.cards.length === 0 && e.count > 0)).toBe(true);
    expect(ownDraws.some((e) => e.cards.length > 0)).toBe(true);
    expect(hostView?.seed).toBe('');
  }, 30_000);

  it('resyncs a client that reconnects with its token', async () => {
    const host = player(server, 'Ann');
    const guest = player(server, 'Bob');
    const code = await seatTwo(host, guest, 'vigil');
    const before = guest.get().clientId;
    // Drop the socket without leaving: the client reconnects and the server re-attaches it.
    const socket = (guest.client as unknown as { socket: { close(): void } | null }).socket;
    socket?.close();
    await waitFor(host, (s) => s.room?.seats[1].status === 'reconnecting', 'the reconnecting badge');
    await waitFor(guest, (s) => s.status === 'open' && s.room?.code === code && s.room.seats[1].status === 'human', 'the guest to come back', 10_000);
    expect(guest.get().clientId).toBe(before);
    expect(guest.get().game?.you).toEqual([1]);
  }, 20_000);
});

/**
 * Room lifecycle on the Hub with fake connections and fake timers: codes, joining, seat
 * claims, Ready flags (cleared by any settings change), starting, host migration, reconnect
 * grace, expiry, the in-game disconnect/stand-in/reclaim cycle, late joins, turn timers and
 * persistence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeSeats } from '../../../src/engine';
import type { GameState, SeatConfig } from '../../../src/engine/types';
import type { ServerMessageOf } from '../../../src/net/protocol';
import { decisionFor, onlineConfig } from './helpers';
import { connect, makeHub, memoryStore, type TestClient } from './hubHarness';

const SEATS_2H_1B: SeatConfig[] = [
  { kind: 'human', hero: 'sconce_paladin', name: 'One' },
  { kind: 'human', hero: 'moth_witch', name: 'Two' },
  { kind: 'bot_warden', hero: 'lampwright', name: 'Warden' },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function open(host: TestClient, mode: 'vigil' | 'last_flame' = 'vigil', seats = SEATS_2H_1B, extra: Record<string, unknown> = {}): string {
  const { config, selection } = onlineConfig(mode, seats, extra);
  host.send({ type: 'create_room', config, selection });
  const code = host.conn.room()?.code;
  if (!code) throw new Error(`no room: ${host.conn.errorCodes().join(', ')}`);
  return code;
}

function game(client: TestClient): ServerMessageOf<'game'> {
  const message = client.conn.last('game');
  if (!message) throw new Error('no game message');
  return message;
}

function view(client: TestClient): GameState {
  return game(client).view;
}

/** Host and guest seated and Ready, game started. */
function startTwo(mode: 'vigil' | 'last_flame' = 'vigil', extra: Record<string, unknown> = {}, store = memoryStore()) {
  const hub = makeHub({ store });
  const host = connect(hub, 'Ann');
  const guest = connect(hub, 'Bob');
  const code = open(host, mode, SEATS_2H_1B, extra);
  guest.send({ type: 'join_room', code });
  guest.send({ type: 'claim_seat', seat: 1 });
  host.send({ type: 'set_ready', ready: true });
  guest.send({ type: 'set_ready', ready: true });
  host.send({ type: 'start_game' });
  return { hub, host, guest, code, store };
}

/** Let a client answer its decisions while timers run, until `until` holds. */
function playUntil(clients: Array<{ c: TestClient; seat: number }>, until: () => boolean, rounds = 400): void {
  for (let i = 0; i < rounds && !until(); i++) {
    for (const { c, seat } of clients) {
      const last = c.conn.last('game');
      if (!last || !last.you.includes(seat)) continue;
      const action = decisionFor(last.view, seat, { move: false });
      if (action) c.send({ type: 'action', action });
    }
    vi.advanceTimersByTime(20);
  }
}

describe('rooms: lobby', () => {
  it('hands out unique 4-letter codes from the vowel-free alphabet', () => {
    const hub = makeHub();
    const codes = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const host = connect(hub, `Host ${i}`);
      codes.add(open(host));
    }
    expect(codes.size).toBe(40);
    for (const code of codes) expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ]{4}$/);
    expect(hub.roomCount).toBe(40);
  });

  it('requires hello, the same engine and the base content', () => {
    const hub = makeHub();
    const stranger = connect(hub, 'X');
    const conn = stranger.conn;
    // A connection that never said hello.
    const silent = { messages: [] as unknown[], send: (m: unknown) => silent.messages.push(m), close: () => undefined };
    hub.connect(silent);
    hub.receive(silent, JSON.stringify({ type: 'join_room', code: 'BCDF' }));
    expect(silent.messages).toContainEqual(expect.objectContaining({ type: 'error', code: 'hello_required' }));
    stranger.send({ type: 'hello', protocol: 1, name: 'X', engineVersion: '0.0.1', contentHash: 'x' });
    expect(conn.errorCodes()).toContain('version_mismatch');
    hub.receive(conn, JSON.stringify({ type: 'hello', protocol: 1, name: 'X', engineVersion: '1.0.0', contentHash: 'deadbeef' }));
    expect(conn.errorCodes()).toContain('content_mismatch');
  });

  it('joins by code, case-insensitively; unknown codes are refused', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    const guest = connect(hub, 'Bob');
    const code = open(host);
    guest.send({ type: 'join_room', code: 'ZZZZ' });
    expect(guest.conn.errorCodes()).toContain('room_not_found');
    guest.send({ type: 'join_room', code: code.toLowerCase() });
    const room = guest.conn.room();
    expect(room?.code).toBe(code);
    expect(room?.members.map((m) => m.name)).toEqual(['Ann', 'Bob']);
    expect(room?.hostId).toBe(host.id());
    // The host took the first human seat automatically; the guest has none yet.
    expect(room?.seats[0].occupantId).toBe(host.id());
    expect(room?.seats[1].status).toBe('open');
    expect(room?.seats[2].status).toBe('bot');
    // Seed and selection are the host's.
    expect(room?.config.seed).toBe('');
    expect(room?.selection).toBeNull();
    expect(host.conn.room()?.config.seed).toBe('net-test');
  });

  it('claims seats: no stealing, no bot seats, moving releases the old seat', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    const guest = connect(hub, 'Bob');
    const code = open(host);
    guest.send({ type: 'join_room', code });
    guest.send({ type: 'claim_seat', seat: 0 });
    expect(guest.conn.errorCodes()).toContain('seat_taken');
    guest.send({ type: 'claim_seat', seat: 2 });
    expect(guest.conn.errorCodes()).toContain('bad_seat');
    guest.send({ type: 'claim_seat', seat: 1 });
    expect(guest.conn.room()?.seats[1].occupantId).toBe(guest.id());
    guest.send({ type: 'release_seat' });
    expect(guest.conn.room()?.seats[1].status).toBe('open');
    host.send({ type: 'claim_seat', seat: 1 });
    const room = host.conn.room();
    expect(room?.seats[0].status).toBe('open');
    expect(room?.seats[1].occupantId).toBe(host.id());
  });

  it('clears every Ready flag on any settings change, and only the host may change them', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    const guest = connect(hub, 'Bob');
    const code = open(host);
    guest.send({ type: 'join_room', code });
    guest.send({ type: 'set_ready', ready: true });
    expect(guest.conn.errorCodes()).toContain('bad_seat');
    guest.send({ type: 'claim_seat', seat: 1 });
    host.send({ type: 'set_ready', ready: true });
    guest.send({ type: 'set_ready', ready: true });
    expect(host.conn.room()?.canStart).toBe(true);
    expect(host.conn.room()?.seats.filter((s) => s.ready).length).toBe(3);

    const { config, selection } = onlineConfig('vigil', SEATS_2H_1B, { difficulty: 'midnight' });
    guest.send({ type: 'update_config', config, selection });
    expect(guest.conn.errorCodes()).toContain('not_host');
    const before = host.conn.room()?.configVersion ?? 0;
    host.send({ type: 'update_config', config: { ...config, difficulty: 'midnight' }, selection });
    const room = host.conn.room();
    expect(room?.configVersion).toBe(before + 1);
    expect(room?.config.difficulty).toBe('midnight');
    expect(room?.seats[0].ready).toBe(false);
    expect(room?.seats[1].ready).toBe(false);
    expect(room?.seats[1].occupantId).toBe(guest.id());
    expect(room?.canStart).toBe(false);
    expect(guest.conn.last('notice')?.text).toMatch(/changed the settings/);
  });

  it('refuses settings the server does not accept', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    const { config, selection } = onlineConfig('vigil', SEATS_2H_1B);
    host.send({ type: 'create_room', config: { ...config, nights: 'many' }, selection } as Record<string, unknown>);
    expect(host.conn.errorCodes()).toContain('bad_config');
    host.send({ type: 'create_room', config: { ...config, seats: [] }, selection });
    expect(host.conn.errorCodes().filter((c) => c === 'bad_config')).toHaveLength(2);
    host.send({ type: 'create_room', config, selection: { nope: true } } as Record<string, unknown>);
    expect(host.conn.errorCodes().filter((c) => c === 'bad_config')).toHaveLength(3);
    expect(hub.roomCount).toBe(0);
  });

  it('starts only when every claimed human seat is Ready; an open human seat becomes a Warden', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    const code = open(host);
    const guest = connect(hub, 'Bob');
    guest.send({ type: 'join_room', code });
    host.send({ type: 'start_game' });
    expect(host.conn.errorCodes()).toContain('not_ready');
    expect(host.conn.room()?.startBlocker).toBe('Waiting for Ann to be Ready.');
    host.send({ type: 'set_ready', ready: true });
    guest.send({ type: 'start_game' });
    expect(guest.conn.errorCodes()).toContain('not_host');
    host.send({ type: 'start_game' });
    const msg = game(host);
    expect(host.conn.room()?.phase).toBe('playing');
    expect(msg.view.players.map((p) => [p.name, p.kind])).toEqual([
      ['Ann', 'human'],
      ['Warden of Tallow', 'bot_warden'],
      ['Warden', 'bot_warden'],
    ]);
    expect(msg.you).toEqual([0]);
    // The watcher gets the game too, controlling nothing.
    expect(game(guest).you).toEqual([]);
  });

  it('migrates the host to the earliest-connected player', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    const code = open(host);
    const second = connect(hub, 'Bob');
    second.send({ type: 'join_room', code });
    vi.advanceTimersByTime(1000);
    const third = connect(hub, 'Cid');
    third.send({ type: 'join_room', code });
    host.send({ type: 'leave' });
    expect(host.conn.room()).toBeNull();
    expect(third.conn.room()?.hostId).toBe(second.id());
    expect(third.conn.room()?.members.map((m) => m.name)).toEqual(['Bob', 'Cid']);
    // A host who stays disconnected for 30 s hands the room on too.
    hub.disconnect(second.conn);
    vi.advanceTimersByTime(29_000);
    hub.tick();
    expect(third.conn.room()?.hostId).toBe(second.id());
    vi.advanceTimersByTime(2000);
    hub.tick();
    expect(third.conn.room()?.hostId).toBe(third.id());
  });

  it('shows "reconnecting" during the grace, then frees the lobby seat', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    const code = open(host);
    const guest = connect(hub, 'Bob');
    guest.send({ type: 'join_room', code });
    guest.send({ type: 'claim_seat', seat: 1 });
    hub.disconnect(guest.conn);
    const seat = host.conn.room()?.seats[1];
    expect(seat?.status).toBe('reconnecting');
    expect(seat?.graceEndsAt).toBe(Date.now() + 120_000);
    expect(host.conn.room()?.startBlocker).toBe('Waiting for Bob to reconnect.');
    // Coming back with the token within the grace keeps everything.
    const back = connect(hub, 'Bob', guest.token());
    expect(back.id()).toBe(guest.id());
    expect(back.conn.room()?.seats[1].status).toBe('human');
    hub.disconnect(back.conn);
    vi.advanceTimersByTime(121_000);
    hub.tick();
    const room = host.conn.room();
    expect(room?.seats[1].status).toBe('open');
    expect(room?.members.map((m) => m.name)).toEqual(['Ann']);
  });

  it('expires after 30 minutes without activity', () => {
    const hub = makeHub();
    const host = connect(hub, 'Ann');
    open(host);
    vi.advanceTimersByTime(29 * 60_000);
    hub.tick();
    expect(hub.roomCount).toBe(1);
    host.send({ type: 'set_ready', ready: true });
    vi.advanceTimersByTime(29 * 60_000);
    hub.tick();
    expect(hub.roomCount).toBe(1);
    vi.advanceTimersByTime(2 * 60_000);
    hub.tick();
    expect(hub.roomCount).toBe(0);
    expect(host.conn.errorCodes()).toContain('room_expired');
    expect(host.conn.last('room')?.room).toBeNull();
  });

  it('survives garbage and floods without throwing', () => {
    const hub = makeHub({ rateLimit: 5 });
    const client = connect(hub, 'Ann');
    for (const raw of ['', 'x', '{}', '{"type":"action","action":{"type":"advance"}}', JSON.stringify({ type: 'claim_seat', seat: 1 })]) client.raw(raw);
    expect(client.conn.errorCodes()).toEqual(expect.arrayContaining(['bad_message', 'not_in_room']));
    for (let i = 0; i < 40; i++) client.send({ type: 'ping', id: i });
    expect(client.conn.errorCodes()).toContain('rate_limited');
  });
});

describe('rooms: a running game', () => {
  it('rejects actions for seats the sender does not control and lets anyone seated wake an AI ally', () => {
    const { host, guest } = startTwo();
    guest.send({ type: 'action', action: { type: 'ready', seat: 0 } });
    expect(guest.conn.last('reject')).toMatchObject({ reason: 'NOT_YOUR_TURN' });
    guest.send({ type: 'action', action: { type: 'advance' } });
    expect(guest.conn.errorCodes()).toContain('bad_message');
    host.send({ type: 'action', action: { type: 'ready', seat: 0 } });
    expect(view(guest).players[0].ready).toBe(true);
  });

  it('a disconnected player gets the grace, then a Warden, then their seat back at its next turn', () => {
    const { hub, host, guest } = startTwo('last_flame');
    hub.disconnect(guest.conn);
    expect(host.conn.room()?.seats[1].status).toBe('reconnecting');
    // Grace (120 s) runs out: the Warden stands in and the engine sees a bot seat.
    vi.advanceTimersByTime(121_000);
    hub.tick();
    const seat = host.conn.room()?.seats[1];
    expect(seat?.status).toBe('bot');
    expect(seat?.occupantId).toBe(guest.id());
    expect(view(host).players[1].kind).toBe('bot_warden');
    expect(game(host).seats[1]).toEqual({ seat: 1, controllerId: null, bot: 'bot_warden' });
    // Back with the token: queued to reclaim at the seat's next turn.
    const back = connect(hub, 'Bob', guest.token());
    expect(back.conn.room()?.seats[1].pendingId).toBe(guest.id());
    expect(game(back).you).toEqual([]);
    expect(back.conn.last('notice')?.text).toMatch(/next turn/);
    playUntil([{ c: host, seat: 0 }], () => (back.conn.last('game')?.you ?? []).includes(1));
    expect(game(back).you).toEqual([1]);
    expect(view(back).players[1].kind).toBe('human');
    const v = view(back);
    expect(v.phase === 'players' ? v.activeSeat : 1).toBe(1);
  });

  it('a late joiner takes over a bot seat at its next seat turn', () => {
    const { hub, host, guest, code } = startTwo('last_flame');
    const late = connect(hub, 'Cid');
    late.send({ type: 'join_room', code });
    expect(late.conn.room()?.phase).toBe('playing');
    expect(game(late).you).toEqual([]);
    late.send({ type: 'claim_seat', seat: 0 });
    expect(late.conn.errorCodes()).toContain('seat_taken');
    late.send({ type: 'claim_seat', seat: 2 });
    expect(late.conn.room()?.seats[2].pendingId).toBe(late.id());
    playUntil(
      [
        { c: host, seat: 0 },
        { c: guest, seat: 1 },
      ],
      () => (late.conn.last('game')?.you ?? []).includes(2),
    );
    expect(game(late).you).toEqual([2]);
    expect(view(host).players[2].kind).toBe('human');
    expect(host.conn.room()?.seats[2].occupantId).toBe(late.id());
  });

  it('ends a Last Flame turn when the turn timer runs out', () => {
    const { host, guest } = startTwo('last_flame', { turn_timer: 'fast' });
    // Both get to the players phase.
    playUntil(
      [
        { c: host, seat: 0 },
        { c: guest, seat: 1 },
      ],
      () => view(host).phase === 'players' && view(host).activeSeat !== null && view(host).activeSeat !== 2,
    );
    const s = view(host);
    const active = s.activeSeat ?? -1;
    const timer = host.conn.last('timer');
    expect(timer).toMatchObject({ kind: 'turn', seat: active });
    expect((timer?.deadline ?? 0) - Date.now()).toBeGreaterThan(44_000);
    vi.advanceTimersByTime(48_000);
    const after = view(host);
    expect(after.players[active].turnEnded || after.activeSeat !== active).toBe(true);
    expect(host.conn.all('notice').some((n) => n.text.startsWith('Time ran out'))).toBe(true);
  });

  it('with the timer off, 180 s without input lets a Warden stand in until the next turn', () => {
    const { host, guest } = startTwo('vigil', { turn_timer: 'off' });
    host.send({ type: 'action', action: { type: 'ready', seat: 0 } });
    expect(guest.conn.last('timer')).toMatchObject({ kind: 'idle' });
    vi.advanceTimersByTime(182_000);
    const room = host.conn.room();
    expect(room?.seats[1].status).toBe('bot');
    expect(room?.seats[1].pendingId).toBe(guest.id());
    expect(view(host).players[1].ready).toBe(true);
  });

  it('persists the log and resumes the game after a restart', () => {
    const store = memoryStore();
    const { hub, host, guest, code } = startTwo('vigil', {}, store);
    playUntil(
      [
        { c: host, seat: 0 },
        { c: guest, seat: 1 },
      ],
      () => view(host).phase === 'players',
    );
    const before = view(host);
    vi.advanceTimersByTime(500);
    hub.stop();
    const record = store.records.get(code);
    expect(record?.log.length).toBeGreaterThan(0);
    expect(record?.salt).toMatch(/^[0-9a-f]{24}$/);

    const restarted = makeHub({ store });
    expect(restarted.restore()).toBe(1);
    const back = connect(restarted, 'Ann', host.token());
    expect(back.id()).toBe(host.id());
    expect(back.conn.room()?.code).toBe(code);
    const resumed = view(back);
    expect(resumed.phase).toBe(before.phase);
    expect(resumed.round).toBe(before.round);
    expect(Object.keys(resumed.pieces).sort()).toEqual(Object.keys(before.pieces).sort());
    expect(activeSeats(resumed)).toEqual(activeSeats(before));
    expect(back.conn.room()?.seats[1].status).toBe('reconnecting');
  });

  it('reveals the seed and salt only at game over', () => {
    const { host, guest } = startTwo('vigil');
    expect(view(host).seed).toBe('');
    expect(game(host).reveal).toBeUndefined();
    host.send({ type: 'action', action: { type: 'concede', seat: 0 } });
    guest.send({ type: 'action', action: { type: 'concede', seat: 1 } });
    vi.advanceTimersByTime(100);
    const over = game(guest);
    expect(over.view.result).not.toBeNull();
    expect(over.reveal?.seed).toBe('net-test');
    expect(over.reveal?.salt).toMatch(/^[0-9a-f]{24}$/);
    expect(over.view.seed).toBe(`net-test\u0000${over.reveal?.salt}`);
    expect(host.conn.room()?.game?.over).toBe(true);
    // The host takes everyone back to the lobby with the same seats.
    guest.send({ type: 'return_to_lobby' });
    expect(guest.conn.errorCodes()).toContain('not_host');
    host.send({ type: 'return_to_lobby' });
    const room = guest.conn.room();
    expect(room?.phase).toBe('lobby');
    expect(room?.seats[1].occupantId).toBe(guest.id());
    expect(room?.seats[1].ready).toBe(false);
  });
});

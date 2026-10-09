/**
 * Rooms (GDD §11.6, §15.1.4): a 4-letter code, members, seats, Ready flags and the host; then
 * the running game with seat control (players, bot stand-ins, late joiners) on top of the
 * authoritative game and its driver.
 *
 * Seat control in a game:
 * - A seat is held by a player (`ownerId`) or by nobody (a bot seat). `control` says who plays
 *   it right now: the player, or a bot (`standIn`: the configured level, or bot_warden for a
 *   player's seat).
 * - Disconnect: a "reconnecting" badge during `reconnect_grace` (capped at 120 s while it is
 *   that seat's turn), then bot_warden takes the seat. The player reclaims it at the start of the
 *   seat's next seat turn.
 * - Late join: claiming a bot seat queues the player (`pendingId`); they take it over at the
 *   start of that seat's next seat turn (a bot mid-turn finishes first).
 */
import { randomBytes } from 'node:crypto';
import { activeSeats } from '../src/engine';
import type { ConfigSelection } from '../src/config/presets';
import { defaultSeatName, validateConfig } from '../src/config';
import type { Action, BotLevel, ContentRegistry, GameConfig, GameEvent, SeatKind } from '../src/engine/types';
import type { ErrorCode, RoomMember, RoomSeat, RoomSnapshot, SeatAssignment, ServerMessage } from '../src/net/protocol';
import { MAX_ROOM_MEMBERS } from '../src/net/protocol';
import { GameDriver, realClock, type ActionOrigin, type Clock, type DriverOptions, type TimerInfo } from './driver';
import { AuthoritativeGame, eventsFor, WATCHER_SEAT } from './game';
import { roomLogger, type Logger } from './log';
import type { RoomRecord, RoomStore } from './persist';
import { ROOM_RECORD_VERSION } from './persist';
import { seatsForStart } from './roomConfig';

/** One WebSocket, as the rooms see it. */
export interface Conn {
  send(message: ServerMessage): void;
}

export interface Identity {
  id: string;
  token: string;
  name: string;
}

export interface RoomError {
  code: ErrorCode;
  message: string;
}

export interface RoomDeps {
  content: ContentRegistry;
  clock: Clock;
  log: Logger;
  store: RoomStore;
  driver?: Omit<DriverOptions, 'clock'>;
  /** Minutes without activity before a room closes (content rules.roomCode.idleMinutes). */
  idleMinutes: number;
  /** A host who stays disconnected this long hands the room to the earliest-connected player. */
  hostMigrateMs: number;
  salt?: () => string;
}

/** The grace is capped at 120 s while it is the seat's turn (GDD §11.6). */
export const ACTIVE_TURN_GRACE_CAP_MS = 120_000;
export const DEFAULT_HOST_MIGRATE_MS = 30_000;

interface Member {
  id: string;
  token: string;
  name: string;
  /** Order for host migration ("earliest-connected human"). */
  joinedAt: number;
  conn: Conn | null;
  disconnectedAt: number | null;
  /** Lobby: claimed seat. Game: the seat this player holds (also while a bot stands in). */
  seat: number | null;
  ready: boolean;
}

interface Slot {
  seat: number;
  /** Lobby: configured kind. Game: the kind the seat started with (open seats start as bot_warden). */
  kind: SeatKind;
  hero: string | null;
  /** Shown while a bot plays the seat. */
  botName: string;
  ownerId: string | null;
  /** Game: a player waiting to take the seat at its next seat turn. */
  pendingId: string | null;
  control: 'human' | 'bot';
  standIn: BotLevel;
}

const ok = null;
const err = (code: ErrorCode, message: string): RoomError => ({ code, message });

function botLevelOf(kind: SeatKind): BotLevel {
  return kind === 'human' ? 'bot_warden' : kind;
}

function houseName(seat: number): string {
  return ['Beeswax', 'Tallow', 'Bayberry', 'Rushlight'][seat] ?? `Seat ${seat + 1}`;
}

export class Room {
  readonly code: string;
  readonly createdAt: number;
  hostId: string;
  phase: 'lobby' | 'playing' = 'lobby';
  config: GameConfig;
  selection: ConfigSelection;
  configVersion = 1;
  reconnectGrace: number;
  lastActivity: number;

  private readonly deps: RoomDeps;
  private readonly log: Logger;
  private readonly members = new Map<string, Member>();
  private slots: Slot[] = [];
  private game: AuthoritativeGame | null = null;
  private driver: GameDriver | null = null;
  private gameConfig: GameConfig | null = null;
  private gameStartedAt = 0;
  private seq = 0;
  private overAnnounced = false;
  private timer: TimerInfo | null = null;
  private closed = false;
  private lastTimerNotice = 0;

  constructor(code: string, host: Identity, config: GameConfig, selection: ConfigSelection, reconnectGrace: number, deps: RoomDeps) {
    this.code = code;
    this.deps = deps;
    this.log = roomLogger(deps.log, code);
    this.createdAt = deps.clock.now();
    this.lastActivity = this.createdAt;
    this.hostId = host.id;
    this.config = config;
    this.selection = selection;
    this.reconnectGrace = reconnectGrace;
    this.slots = this.slotsFor(config, []);
  }

  // ===========================================================================================
  // Reading
  // ===========================================================================================

  get memberCount(): number {
    return this.members.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (m.conn) n++;
    return n;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  has(id: string): boolean {
    return this.members.has(id);
  }

  memberIds(): string[] {
    return [...this.members.keys()];
  }

  /** The running game (tests and tools). */
  get currentGame(): AuthoritativeGame | null {
    return this.game;
  }

  private now(): number {
    return this.deps.clock.now();
  }

  private touch(): void {
    this.lastActivity = this.now();
  }

  // ===========================================================================================
  // Membership
  // ===========================================================================================

  /** Add a player (host on creation, or someone with the code). They start without a seat. */
  join(identity: Identity, conn: Conn): RoomError | null {
    if (this.members.has(identity.id)) {
      this.attach(identity.id, conn);
      return ok;
    }
    if (this.members.size >= MAX_ROOM_MEMBERS) return err('room_full', 'That room is full.');
    const member: Member = { id: identity.id, token: identity.token, name: identity.name, joinedAt: this.now(), conn, disconnectedAt: null, seat: null, ready: false };
    this.members.set(identity.id, member);
    this.touch();
    this.log.info(`${member.name} joined${this.phase === 'playing' ? ' (game under way)' : ''}`);
    if (this.phase === 'lobby' && identity.id === this.hostId) {
      const seat = this.slots.find((s) => s.kind === 'human' && !s.ownerId);
      if (seat) this.seatMember(member, seat.seat);
    }
    this.broadcastRoom();
    if (this.phase === 'playing') this.sendGameTo(member, null, []);
    this.sendTimerTo(member);
    return ok;
  }

  /** A known member's socket came back. */
  attach(id: string, conn: Conn): void {
    const member = this.members.get(id);
    if (!member) return;
    const wasAway = member.conn === null;
    member.conn = conn;
    member.disconnectedAt = null;
    this.touch();
    if (wasAway) this.log.info(`${member.name} reconnected`);
    if (this.phase === 'playing') {
      const held = member.seat !== null ? this.slots[member.seat] : undefined;
      if (held && held.ownerId === member.id && held.control === 'bot' && !held.pendingId) {
        held.pendingId = member.id;
        conn.send({ type: 'notice', tone: 'info', text: 'A Warden kept your candle lit. You take your seat back at the start of its next turn.' });
      }
      if (this.driver?.isPaused) this.driver.resume();
    }
    this.broadcastRoom();
    if (this.phase === 'playing') this.sendGameTo(member, null, []);
    this.sendTimerTo(member);
  }

  /** The member's socket closed (they may come back with their token). */
  detach(id: string): void {
    const member = this.members.get(id);
    if (!member || !member.conn) return;
    member.conn = null;
    member.disconnectedAt = this.now();
    if (this.phase === 'lobby') member.ready = false;
    this.log.info(`${member.name} disconnected`);
    if (this.phase === 'playing' && this.connectedCount === 0) this.driver?.pause();
    this.broadcastRoom();
  }

  /** The member leaves for good. Returns true when the room is now empty (and closed). */
  leave(id: string): boolean {
    const member = this.members.get(id);
    if (!member) return this.members.size === 0;
    this.touch();
    if (this.phase === 'playing') {
      for (const slot of this.slots) {
        if (slot.pendingId === id) slot.pendingId = null;
        if (slot.ownerId === id) {
          slot.ownerId = null;
          slot.control = 'bot';
        }
      }
    }
    this.members.delete(id);
    this.log.info(`${member.name} left`);
    if (this.members.size === 0) {
      this.close('empty');
      return true;
    }
    if (this.hostId === id) this.migrateHost(true);
    if (this.phase === 'playing') this.controlChanged();
    this.broadcastRoom();
    return false;
  }

  setName(id: string, name: string): void {
    const member = this.members.get(id);
    if (!member || !name || member.name === name) return;
    member.name = name;
    this.broadcastRoom();
  }

  private migrateHost(force: boolean): boolean {
    const current = this.members.get(this.hostId);
    if (!force && current?.conn) return false;
    const next = [...this.members.values()].filter((m) => m.conn && m.id !== this.hostId).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!next) return false;
    this.hostId = next.id;
    this.log.info(`${next.name} is now the host`);
    this.notice(`${next.name} is now the host.`);
    return true;
  }

  // ===========================================================================================
  // Lobby
  // ===========================================================================================

  private slotsFor(config: GameConfig, previous: readonly Slot[]): Slot[] {
    return config.seats.map((seat, i): Slot => {
      const before = previous[i];
      const keep = seat.kind === 'human' && before?.kind === 'human' && before.ownerId !== null && this.members.has(before.ownerId);
      return {
        seat: i,
        kind: seat.kind,
        hero: seat.hero,
        botName: seat.kind === 'human' ? defaultSeatName('bot_warden', i, this.deps.content) : seat.name,
        ownerId: keep ? before.ownerId : null,
        pendingId: null,
        control: keep ? 'human' : 'bot',
        standIn: botLevelOf(seat.kind),
      };
    });
  }

  private seatMember(member: Member, seat: number): void {
    if (member.seat !== null && this.slots[member.seat]?.ownerId === member.id) {
      this.slots[member.seat].ownerId = null;
      this.slots[member.seat].control = 'bot';
    }
    member.seat = seat;
    member.ready = false;
    this.slots[seat].ownerId = member.id;
    this.slots[seat].control = 'human';
  }

  claimSeat(id: string, seat: number): RoomError | null {
    const member = this.members.get(id);
    if (!member) return err('not_in_room', 'You are not in this room.');
    const slot = this.slots[seat];
    if (!slot) return err('bad_seat', 'There is no such seat.');
    this.touch();
    if (this.phase === 'lobby') {
      if (slot.kind !== 'human') return err('bad_seat', 'That seat is a bot. The host can make it a player seat in the settings.');
      if (slot.ownerId === id) return ok;
      if (slot.ownerId) return err('seat_taken', 'Someone else holds that seat.');
      this.seatMember(member, seat);
      this.broadcastRoom();
      return ok;
    }
    // Late join: take over a bot seat at its next seat turn.
    if (member.seat !== null) return err('bad_seat', 'You already hold a seat.');
    if (slot.ownerId || slot.control !== 'bot') return err('seat_taken', 'Someone else holds that seat.');
    if (slot.pendingId && slot.pendingId !== id) return err('seat_taken', 'Someone is already waiting for that seat.');
    if (this.game?.state.players[seat]?.eliminated) return err('bad_seat', 'That candle is out of the game.');
    for (const other of this.slots) if (other.pendingId === id) other.pendingId = null;
    slot.pendingId = id;
    member.conn?.send({ type: 'notice', tone: 'info', text: `You take over House ${houseName(seat)} at the start of its next seat turn.` });
    this.log.info(`${member.name} waits to take seat ${seat + 1}`);
    this.broadcastRoom();
    this.sendGameTo(member, null, []);
    return ok;
  }

  releaseSeat(id: string): RoomError | null {
    const member = this.members.get(id);
    if (!member) return err('not_in_room', 'You are not in this room.');
    this.touch();
    for (const slot of this.slots) if (slot.pendingId === id) slot.pendingId = null;
    if (member.seat !== null) {
      const slot = this.slots[member.seat];
      if (slot?.ownerId === id) {
        slot.ownerId = null;
        slot.control = 'bot';
      }
      member.seat = null;
      member.ready = false;
    }
    if (this.phase === 'playing') this.controlChanged();
    this.broadcastRoom();
    return ok;
  }

  setReady(id: string, ready: boolean): RoomError | null {
    const member = this.members.get(id);
    if (!member) return err('not_in_room', 'You are not in this room.');
    if (this.phase !== 'lobby') return err('wrong_phase', 'The game has already started.');
    if (member.seat === null) return err('bad_seat', 'Take a seat first.');
    this.touch();
    if (member.ready === ready) return ok;
    member.ready = ready;
    this.broadcastRoom();
    return ok;
  }

  /** Host only. Any settings change clears every Ready flag (GDD §11.6). */
  updateConfig(id: string, config: GameConfig, selection: ConfigSelection, reconnectGrace: number | null): RoomError | null {
    if (id !== this.hostId) return err('not_host', 'Only the host can change the settings.');
    if (this.phase !== 'lobby') return err('wrong_phase', 'The game has already started.');
    this.touch();
    this.config = config;
    this.selection = selection;
    if (reconnectGrace !== null) this.reconnectGrace = reconnectGrace;
    this.configVersion += 1;
    this.slots = this.slotsFor(config, this.slots);
    for (const member of this.members.values()) {
      member.ready = false;
      if (member.seat !== null && this.slots[member.seat]?.ownerId !== member.id) member.seat = null;
    }
    this.log.info(`settings changed (${config.mode}, ${config.length}, ${config.difficulty}, ${config.seats.length} seats)`);
    for (const member of this.members.values()) {
      if (member.id !== id) member.conn?.send({ type: 'notice', tone: 'info', text: 'The host changed the settings. Ready again when you are.' });
    }
    this.broadcastRoom();
    return ok;
  }

  /** Why the host cannot start yet (null: they can). */
  startBlocker(): string | null {
    if (this.phase !== 'lobby') return 'The game is under way.';
    const held = this.slots.filter((s) => s.ownerId !== null);
    if (held.length === 0) return 'Take a seat first.';
    const owners = held.map((s) => this.members.get(s.ownerId ?? '')).filter((m): m is Member => m !== undefined);
    const away = owners.filter((m) => !m.conn);
    if (away.length > 0) return `Waiting for ${away.map((m) => m.name).join(', ')} to reconnect.`;
    const waiting = owners.filter((m) => !m.ready);
    if (waiting.length > 0) return `Waiting for ${waiting.map((m) => m.name).join(', ')} to be Ready.`;
    return null;
  }

  start(id: string): RoomError | null {
    if (id !== this.hostId) return err('not_host', 'Only the host can start the game.');
    if (this.phase !== 'lobby') return err('wrong_phase', 'The game has already started.');
    const blocker = this.startBlocker();
    if (blocker) return err('not_ready', blocker);
    const names = this.slots.map((s) => (s.ownerId ? (this.members.get(s.ownerId)?.name ?? null) : null));
    const seats = seatsForStart(this.config, names, this.deps.content);
    const config: GameConfig = { ...this.config, seats };
    const validation = validateConfig(config, { online: true, content: this.deps.content, flags: config });
    if (!validation.ok) return err('bad_config', validation.issues.map((i) => i.message).join(' '));
    const salt = this.deps.salt?.() ?? randomBytes(12).toString('hex');
    let game: AuthoritativeGame;
    try {
      game = new AuthoritativeGame(config, salt, () => this.now());
    } catch (error) {
      this.log.error(`createGame failed: ${String(error)}`);
      return err('bad_config', 'The server could not set up this game.');
    }
    this.touch();
    this.slots = seats.map((seat, i): Slot => {
      const before = this.slots[i];
      return {
        seat: i,
        kind: seat.kind,
        hero: seat.hero,
        botName: seat.kind === 'human' ? before.botName : seat.name,
        ownerId: before.ownerId,
        pendingId: null,
        control: before.ownerId ? 'human' : 'bot',
        standIn: botLevelOf(seat.kind),
      };
    });
    for (const member of this.members.values()) member.ready = false;
    this.beginGame(game, config, this.now());
    this.log.info(`game started: ${config.mode}, ${config.length}, ${config.difficulty}, seats ${seats.map((s) => (s.kind === 'human' ? s.name : s.kind)).join(' / ')}, seed "${config.seed}"`);
    return ok;
  }

  private beginGame(game: AuthoritativeGame, config: GameConfig, startedAt: number): void {
    this.game = game;
    this.gameConfig = config;
    this.gameStartedAt = startedAt;
    this.phase = 'playing';
    this.overAnnounced = game.over;
    this.syncKinds();
    this.driver = new GameDriver(game, this.driverHost(), { ...this.deps.driver, clock: this.deps.clock });
    this.broadcastRoom();
    this.broadcastGame(null, []);
    this.driver.start();
    if (this.connectedCount === 0) this.driver.pause();
    this.persist();
  }

  /** Host only, after game over: back to the lobby with the same seats. */
  returnToLobby(id: string): RoomError | null {
    if (id !== this.hostId) return err('not_host', 'Only the host can do that.');
    if (this.phase !== 'playing') return ok;
    if (this.game && !this.game.over) return err('wrong_phase', 'The game is still running.');
    this.endGame();
    this.notice('Back in the lobby. Ready up for another game.');
    this.broadcastRoom();
    return ok;
  }

  private endGame(): void {
    this.driver?.stop();
    this.driver = null;
    this.game = null;
    this.gameConfig = null;
    this.timer = null;
    this.phase = 'lobby';
    const owners = this.slots.map((s) => s.ownerId);
    this.slots = this.slotsFor(this.config, []);
    this.slots.forEach((slot, i) => {
      const owner = owners[i];
      if (slot.kind === 'human' && owner && this.members.has(owner)) {
        slot.ownerId = owner;
        slot.control = 'human';
      }
    });
    for (const member of this.members.values()) {
      member.ready = false;
      member.seat = this.slots.find((s) => s.ownerId === member.id)?.seat ?? null;
    }
    this.deps.store.remove(this.code);
  }

  // ===========================================================================================
  // Game
  // ===========================================================================================

  /** A player's action: they must control the seat (Vigil: anyone seated may let an ally act). */
  action(id: string, action: Action): RoomError | null {
    const member = this.members.get(id);
    if (!member) return err('not_in_room', 'You are not in this room.');
    if (this.phase !== 'playing' || !this.game || !this.driver) return err('wrong_phase', 'No game is running.');
    if (action.type === 'advance') return err('bad_message', 'Clients cannot advance the game.');
    this.touch();
    const slot = this.slots[action.seat];
    const controls = slot !== undefined && slot.ownerId === id && slot.control === 'human';
    const letAllyAct =
      action.type === 'claim_turn' && slot !== undefined && slot.control === 'bot' && this.game.state.config.mode === 'vigil' && this.controlsAny(id);
    if (!controls && !letAllyAct) {
      member.conn?.send({ type: 'reject', action, reason: 'NOT_YOUR_TURN' });
      return ok;
    }
    this.driver.noteInput(action.seat);
    const result = this.driver.submit(action);
    if (!result.ok) member.conn?.send({ type: 'reject', action, reason: result.reason, ...(result.params ? { params: result.params } : {}) });
    return ok;
  }

  private controlsAny(id: string): boolean {
    return this.slots.some((s) => s.ownerId === id && s.control === 'human');
  }

  private driverHost() {
    return {
      botLevel: (seat: number): BotLevel | null => {
        const slot = this.slots[seat];
        return !slot || slot.control === 'bot' ? (slot?.standIn ?? 'bot_warden') : null;
      },
      applied: (action: Action, events: GameEvent[], origin: ActionOrigin) => this.onApplied(action, events, origin),
      timerChanged: (timer: TimerInfo | null) => {
        this.timer = timer;
        for (const member of this.members.values()) this.sendTimerTo(member);
      },
      idle: (seats: number[]) => this.onIdle(seats),
      log: (line: string) => this.log.info(line),
    };
  }

  private onApplied(action: Action, events: GameEvent[], origin: ActionOrigin): void {
    const tookOver = this.takeOvers(events);
    this.syncKinds();
    this.broadcastGame(action, events);
    if (tookOver) this.broadcastRoom();
    const game = this.game;
    if (game?.over && !this.overAnnounced) {
      this.overAnnounced = true;
      const result = game.state.result;
      const outcome = result ? (result.mode === 'vigil' ? result.outcome : 'Last Flame decided') : 'over';
      this.log.info(`game over: ${outcome} after ${game.log.length} log entries; salt ${game.salt}`);
      this.broadcastRoom();
    } else if (game && !game.over && this.overAnnounced) {
      this.overAnnounced = false;
      this.broadcastRoom();
    }
    if (origin === 'timer' && this.now() - this.lastTimerNotice > 2000) {
      this.lastTimerNotice = this.now();
      this.notice(action.type === 'end_turn' || action.type === 'claim_turn' ? 'Time ran out: the turn ends.' : 'Time ran out: the default choice was taken.', 'warning');
    }
    this.persist();
  }

  /** Waiting players take their seat at the start of its next seat turn. */
  private takeOvers(events: readonly GameEvent[]): boolean {
    const state = this.game?.state;
    if (!state) return false;
    let changed = false;
    for (const slot of this.slots) {
      if (!slot.pendingId) continue;
      const member = this.members.get(slot.pendingId);
      if (!member) {
        slot.pendingId = null;
        continue;
      }
      if (!member.conn) continue;
      const started = events.some((e) => e.type === 'turn_started' && e.seat === slot.seat);
      const out = state.players[slot.seat]?.eliminated === true;
      if (!started && !out) continue;
      slot.pendingId = null;
      slot.ownerId = member.id;
      slot.control = 'human';
      member.seat = slot.seat;
      changed = true;
      this.log.info(`${member.name} takes seat ${slot.seat + 1}`);
      this.notice(`${member.name} takes over House ${houseName(slot.seat)}.`);
    }
    return changed;
  }

  /** Mirror who plays each seat into the engine (logged by the game). */
  private syncKinds(): boolean {
    const game = this.game;
    if (!game) return false;
    let changed = false;
    for (const slot of this.slots) {
      const kind: SeatKind = slot.control === 'human' ? 'human' : slot.standIn;
      if (game.setSeatKind(slot.seat, kind)) changed = true;
    }
    return changed;
  }

  /** Control changed outside an action: resync every client and let the driver re-plan. */
  private controlChanged(): void {
    if (this.phase !== 'playing' || !this.game) return;
    this.syncKinds();
    this.broadcastGame(null, []);
    this.driver?.poke();
    this.persist();
  }

  private onIdle(seats: number[]): void {
    for (const seat of seats) {
      const slot = this.slots[seat];
      if (!slot || slot.control !== 'human' || !slot.ownerId) continue;
      const member = this.members.get(slot.ownerId);
      slot.control = 'bot';
      slot.standIn = 'bot_warden';
      if (member?.conn) slot.pendingId = member.id;
      this.log.info(`seat ${seat + 1} idle: a Warden stands in`);
      this.notice(`${member?.name ?? 'A player'} has been idle; a Warden plays House ${houseName(seat)} until their next turn.`, 'warning');
    }
    this.controlChanged();
    this.broadcastRoom();
  }

  private isSeatActive(seat: number): boolean {
    const state = this.game?.state;
    if (!state) return false;
    return state.activeSeat === seat || activeSeats(state).includes(seat);
  }

  private graceEndsAt(member: Member): number | null {
    if (member.disconnectedAt === null) return null;
    const grace = this.reconnectGrace * 1000;
    const capped = this.phase === 'playing' && member.seat !== null && this.isSeatActive(member.seat) ? Math.min(grace, ACTIVE_TURN_GRACE_CAP_MS) : grace;
    return member.disconnectedAt + capped;
  }

  // ===========================================================================================
  // Clock
  // ===========================================================================================

  /**
   * Once a second: reconnect graces, host migration, idle expiry. Returns the ids of members
   * removed (lobby grace ran out) and whether the room expired.
   */
  tick(now: number): { removed: string[]; expired: boolean } {
    const removed: string[] = [];
    if (this.closed) return { removed, expired: true };
    let changed = false;
    for (const member of [...this.members.values()]) {
      const ends = this.graceEndsAt(member);
      if (ends === null || now < ends) continue;
      if (this.phase === 'lobby') {
        if (member.seat !== null && this.slots[member.seat]?.ownerId === member.id) {
          this.slots[member.seat].ownerId = null;
          this.slots[member.seat].control = 'bot';
        }
        this.members.delete(member.id);
        removed.push(member.id);
        this.log.info(`${member.name} did not come back; removed from the lobby`);
        changed = true;
        continue;
      }
      const slot = member.seat !== null ? this.slots[member.seat] : undefined;
      if (slot && slot.ownerId === member.id && slot.control === 'human') {
        slot.control = 'bot';
        slot.standIn = 'bot_warden';
        this.log.info(`${member.name}'s grace ran out; a Warden takes seat ${slot.seat + 1}`);
        this.notice(`${member.name} has not come back; a Warden keeps House ${houseName(slot.seat)} lit.`, 'warning');
        this.controlChanged();
        changed = true;
      }
    }
    if (this.members.size === 0) {
      this.close('empty');
      return { removed, expired: true };
    }
    const host = this.members.get(this.hostId);
    if (!host) changed = this.migrateHost(true) || changed;
    else if (!host.conn && host.disconnectedAt !== null && now - host.disconnectedAt >= this.deps.hostMigrateMs) changed = this.migrateHost(false) || changed;
    if (changed) this.broadcastRoom();
    if (now - this.lastActivity >= this.deps.idleMinutes * 60_000) {
      this.log.info(`expired after ${this.deps.idleMinutes} minutes idle`);
      for (const member of this.members.values()) {
        member.conn?.send({ type: 'error', code: 'room_expired', message: 'The room closed after 30 minutes without activity.' });
        member.conn?.send({ type: 'room', room: null });
      }
      this.close('expired');
      return { removed: [...removed, ...this.members.keys()], expired: true };
    }
    return { removed, expired: false };
  }

  /** Stop everything. A server shutdown keeps the saved game so a restart can resume it. */
  close(why: 'empty' | 'expired' | 'shutdown'): void {
    if (this.closed) return;
    this.closed = true;
    this.driver?.stop();
    this.driver = null;
    if (why !== 'shutdown') this.deps.store.remove(this.code);
    if (why !== 'expired') this.log.info(`closed (${why})`);
  }

  // ===========================================================================================
  // Messages
  // ===========================================================================================

  private notice(text: string, tone: 'info' | 'warning' = 'info'): void {
    for (const member of this.members.values()) member.conn?.send({ type: 'notice', text, tone });
  }

  snapshotFor(id: string): RoomSnapshot {
    const playing = this.phase === 'playing';
    const isHost = id === this.hostId;
    const over = this.game?.over ?? false;
    const seats = this.slots.map((slot): RoomSeat => {
      const owner = slot.ownerId ? this.members.get(slot.ownerId) : undefined;
      let status: RoomSeat['status'];
      if (!playing) status = slot.kind !== 'human' ? 'bot' : !owner ? 'open' : owner.conn ? 'human' : 'reconnecting';
      else status = slot.control === 'bot' ? 'bot' : owner?.conn ? 'human' : 'reconnecting';
      const kind: SeatKind = playing ? (slot.control === 'human' ? 'human' : slot.standIn) : slot.kind;
      const name = owner ? owner.name : !playing && slot.kind === 'human' ? 'Open seat' : slot.botName;
      return {
        seat: slot.seat,
        kind,
        hero: slot.hero,
        name,
        occupantId: owner ? owner.id : null,
        pendingId: slot.pendingId,
        connected: owner ? owner.conn !== null : false,
        ready: playing || slot.kind !== 'human' ? true : Boolean(owner?.ready),
        status,
        graceEndsAt: status === 'reconnecting' && owner ? this.graceEndsAt(owner) : null,
      };
    });
    const members = [...this.members.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m): RoomMember => ({ id: m.id, name: m.name, connected: m.conn !== null, seat: m.seat, host: m.id === this.hostId }));
    const config = playing && this.gameConfig ? this.gameConfig : this.config;
    const blocker = this.startBlocker();
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      seats,
      members,
      config: isHost || over ? config : { ...config, seed: '' },
      selection: isHost ? this.selection : null,
      configVersion: this.configVersion,
      reconnectGrace: this.reconnectGrace,
      canStart: !playing && blocker === null,
      startBlocker: playing ? null : blocker,
      game: playing ? { startedAt: this.gameStartedAt, over } : null,
      expiresAt: this.lastActivity + this.deps.idleMinutes * 60_000,
    };
  }

  broadcastRoom(): void {
    if (this.closed) return;
    for (const member of this.members.values()) member.conn?.send({ type: 'room', room: this.snapshotFor(member.id) });
  }

  private assignments(): SeatAssignment[] {
    return this.slots.map((slot) => ({
      seat: slot.seat,
      controllerId: slot.control === 'human' ? slot.ownerId : null,
      bot: slot.control === 'bot' ? slot.standIn : null,
    }));
  }

  /** The seat whose view a member gets: theirs, the one they wait for, or a watcher's. */
  private viewSeatOf(member: Member): number {
    if (member.seat !== null && this.slots[member.seat]?.ownerId === member.id) return member.seat;
    const pending = this.slots.find((s) => s.pendingId === member.id);
    return pending ? pending.seat : WATCHER_SEAT;
  }

  private broadcastGame(action: Action | null, events: readonly GameEvent[]): void {
    const game = this.game;
    if (!game || this.closed) return;
    this.seq += 1;
    const views = new Map<number, string>();
    const seats = this.assignments();
    const serverTime = this.now();
    const reveal = game.over ? { seed: game.config.seed, salt: game.salt } : undefined;
    for (const member of this.members.values()) {
      if (!member.conn) continue;
      const seat = this.viewSeatOf(member);
      let view = views.get(seat);
      if (view === undefined) {
        view = JSON.stringify(game.viewFor(seat));
        views.set(seat, view);
      }
      member.conn.send({
        type: 'game',
        seq: this.seq,
        seats,
        you: this.slots.filter((s) => s.ownerId === member.id && s.control === 'human').map((s) => s.seat),
        // Parsed copies keep messages independent; the JSON cost is the same as sending.
        view: JSON.parse(view) as typeof game.state,
        events: eventsFor(events, seat, game.config.mode),
        action,
        serverTime,
        ...(reveal ? { reveal } : {}),
      });
    }
  }

  private sendGameTo(member: Member, action: Action | null, events: readonly GameEvent[]): void {
    const game = this.game;
    if (!game || !member.conn) return;
    const seat = this.viewSeatOf(member);
    member.conn.send({
      type: 'game',
      seq: this.seq,
      seats: this.assignments(),
      you: this.slots.filter((s) => s.ownerId === member.id && s.control === 'human').map((s) => s.seat),
      view: game.viewFor(seat),
      events: eventsFor(events, seat, game.config.mode),
      action,
      serverTime: this.now(),
      ...(game.over ? { reveal: { seed: game.config.seed, salt: game.salt } } : {}),
    });
  }

  private sendTimerTo(member: Member): void {
    if (!member.conn || this.phase !== 'playing' || !this.game) return;
    const t = this.timer;
    member.conn.send({ type: 'timer', seat: t?.seat ?? null, phase: t?.phase ?? this.game.state.phase, kind: t?.kind ?? 'turn', deadline: t?.deadline ?? null, serverTime: this.now() });
  }

  // ===========================================================================================
  // Persistence
  // ===========================================================================================

  private persist(): void {
    if (this.phase !== 'playing' || !this.game || !this.gameConfig || this.closed) return;
    this.deps.store.save(this.record());
  }

  record(): RoomRecord {
    const game = this.game;
    const config = this.gameConfig;
    if (!game || !config) throw new Error('record() needs a running game');
    return {
      v: ROOM_RECORD_VERSION,
      code: this.code,
      createdAt: this.createdAt,
      savedAt: this.now(),
      hostId: this.hostId,
      lobbyConfig: this.config,
      config,
      selection: this.selection,
      reconnectGrace: this.reconnectGrace,
      salt: game.salt,
      gameStartedAt: this.gameStartedAt,
      members: [...this.members.values()].map((m) => ({ id: m.id, token: m.token, name: m.name, joinedAt: m.joinedAt, seat: m.seat })),
      seats: this.slots.map((s) => ({ seat: s.seat, kind: s.kind, hero: s.hero, botName: s.botName, ownerId: s.ownerId, control: s.control, standIn: s.standIn })),
      log: [...game.log],
    };
  }

  /** Rebuild a room from its record after a restart: everyone starts disconnected. */
  static restore(record: RoomRecord, deps: RoomDeps): { room: Room; dropped: number } {
    const members = record.members;
    const hostIdentity = members.find((m) => m.id === record.hostId) ?? members[0];
    const room = new Room(record.code, hostIdentity ?? { id: record.hostId, token: '', name: 'Host' }, record.lobbyConfig, record.selection, record.reconnectGrace, deps);
    const now = deps.clock.now();
    for (const m of members) {
      room.members.set(m.id, { id: m.id, token: m.token, name: m.name, joinedAt: m.joinedAt, conn: null, disconnectedAt: now, seat: m.seat, ready: false });
    }
    room.slots = record.seats.map((s) => ({
      seat: s.seat,
      kind: s.kind,
      hero: s.hero,
      botName: s.botName,
      ownerId: s.ownerId && room.members.has(s.ownerId) ? s.ownerId : null,
      pendingId: null,
      control: s.ownerId && room.members.has(s.ownerId) ? s.control : 'bot',
      standIn: botLevelOf(s.standIn),
    }));
    const { game, dropped } = AuthoritativeGame.replay(record.config, record.salt, record.log, () => deps.clock.now());
    room.beginGame(game, record.config, record.gameStartedAt);
    return { room, dropped };
  }

  /** Identities to re-register after a restart. */
  identities(): Identity[] {
    return [...this.members.values()].map((m) => ({ id: m.id, token: m.token, name: m.name }));
  }
}

export { realClock };

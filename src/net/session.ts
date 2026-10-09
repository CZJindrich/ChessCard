/**
 * OnlineSession: everything one browser tab knows about its online play, as an observable
 * snapshot (connection status, the room, the latest game view, the decision timer) plus the
 * commands the lobby and the game send. One session per app; the lobby UI and the game's
 * NetTransport both read it.
 */
import type { ConfigSelection } from '../config/presets';
import type { KeyValueStorage } from '../config/storage';
import { contentHash, getContent } from '../engine/content';
import { ENGINE_VERSION } from '../engine/types';
import type { Action, GameConfig, GameState, PhaseId } from '../engine/types';
import { NetClient, normalizeServerUrl, type NetStatus, type TimerApi, type WebSocketFactory } from './client';
import {
  sanitizeName,
  type ErrorCode,
  type HostOptionsPatch,
  type RoomSnapshot,
  type SeatAssignment,
  type SeedReveal,
  type ServerMessageOf,
  type TimerKind,
} from './protocol';

export interface OnlineGame {
  seq: number;
  view: GameState;
  /** Seats this tab controls right now. */
  you: number[];
  seats: SeatAssignment[];
  reveal: SeedReveal | null;
}

export interface OnlineTimer {
  seat: number | null;
  phase: PhaseId;
  kind: TimerKind;
  /** Server ms. */
  deadline: number;
  /** The same moment on this machine's clock. */
  localDeadline: number;
}

export interface SessionState {
  status: NetStatus;
  serverUrl: string;
  /** True when the address was typed in (Advanced), not this page's host. */
  customServer: boolean;
  clientId: string | null;
  name: string;
  room: RoomSnapshot | null;
  game: OnlineGame | null;
  timer: OnlineTimer | null;
  rtt: number | null;
  /** What the player asked for and is waiting on ("Opening a room…"). */
  pending: 'create' | 'join' | null;
  /** The error that stopped the connection (another tab, version, mods). */
  fatal: { code: ErrorCode; message: string } | null;
}

export interface SessionOptions {
  storage?: KeyValueStorage | null;
  socket?: WebSocketFactory;
  timers?: TimerApi;
  /** Default endpoint (normally this page's /ws). */
  url?: string;
  now?: () => number;
  backoff?: { baseMs: number; maxMs: number };
}

export const NAME_STORAGE_KEY = 'chesscard.online.name';
export const SERVER_STORAGE_KEY = 'chesscard.online.server';

type Listener<T> = (value: T) => void;

class Signal<T> {
  private readonly listeners = new Set<Listener<T>>();
  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }
}

function readKey(storage: KeyValueStorage | null | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeKey(storage: KeyValueStorage | null | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // ignore
  }
}

export class OnlineSession {
  readonly client: NetClient;
  private state: SessionState;
  private readonly storage: KeyValueStorage | null;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private readonly defaultUrl: string;
  /** Game updates in order (NetTransport). */
  readonly games = new Signal<ServerMessageOf<'game'>>();
  readonly rejects = new Signal<ServerMessageOf<'reject'>>();
  readonly notices = new Signal<ServerMessageOf<'notice'>>();
  readonly errors = new Signal<ServerMessageOf<'error'>>();

  constructor(options: SessionOptions = {}) {
    this.storage = options.storage ?? null;
    this.now = options.now ?? (() => Date.now());
    const saved = readKey(this.storage, SERVER_STORAGE_KEY);
    const custom = saved ? normalizeServerUrl(saved) : null;
    const name = sanitizeName(readKey(this.storage, NAME_STORAGE_KEY) ?? '');
    this.client = new NetClient({
      url: custom ?? options.url,
      storage: this.storage,
      socket: options.socket,
      timers: options.timers,
      now: this.now,
      backoff: options.backoff,
      identity: () => ({ name: this.state.name || 'Lanternwarden', engineVersion: ENGINE_VERSION, contentHash: contentHash(getContent()) }),
    });
    this.defaultUrl = options.url ?? this.client.serverUrl;
    this.state = {
      status: 'idle',
      serverUrl: this.client.serverUrl,
      customServer: custom !== null,
      clientId: null,
      name,
      room: null,
      game: null,
      timer: null,
      rtt: null,
      pending: null,
      fatal: null,
    };
    this.client.onStatus((status) => this.patch({ status, fatal: this.client.fatal, rtt: this.client.rtt }));
    this.client.on('welcome', (m) => this.patch({ clientId: m.clientId, name: m.name, fatal: null }));
    this.client.on('room', (m) => this.onRoom(m.room));
    this.client.on('game', (m) => this.onGame(m));
    this.client.on('reject', (m) => this.rejects.emit(m));
    this.client.on('notice', (m) => this.notices.emit(m));
    this.client.on('timer', (m) => this.onTimer(m));
    this.client.on('pong', () => this.patch({ rtt: this.client.rtt }));
    this.client.on('error', (m) => {
      if (m.code === 'room_not_found' || m.code === 'room_full' || m.code === 'bad_config' || m.code === 'server_full') this.patch({ pending: null });
      if (this.client.fatal) this.patch({ fatal: this.client.fatal, pending: null });
      this.errors.emit(m);
    });
  }

  // ===========================================================================================
  // Store
  // ===========================================================================================

  get = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private patch(next: Partial<SessionState>): void {
    let changed = false;
    for (const key of Object.keys(next) as Array<keyof SessionState>) {
      if (!Object.is(this.state[key], next[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  /** Server time now. */
  serverNow(): number {
    return this.client.serverNow();
  }

  /** The latest game view (NetTransport's initial state). */
  latestView(): GameState | null {
    return this.state.game?.view ?? null;
  }

  // ===========================================================================================
  // Inbound
  // ===========================================================================================

  private onRoom(room: RoomSnapshot | null): void {
    const pending = room ? null : this.state.pending;
    // Leaving the room (or a lobby after game over) forgets the game.
    const game = room && room.phase === 'playing' ? this.state.game : null;
    this.patch({ room, pending, game, timer: game ? this.state.timer : null });
  }

  private onGame(message: ServerMessageOf<'game'>): void {
    const current = this.state.game;
    const resync = message.action === null && message.events.length === 0;
    if (current && message.seq <= current.seq && !resync) return;
    this.patch({ game: { seq: message.seq, view: message.view, you: message.you, seats: message.seats, reveal: message.reveal ?? null } });
    this.games.emit(message);
  }

  private onTimer(message: ServerMessageOf<'timer'>): void {
    if (message.deadline === null) {
      this.patch({ timer: null });
      return;
    }
    const offset = message.serverTime - this.now();
    const best = this.client.rtt !== null ? this.client.clockOffset : offset;
    this.patch({ timer: { seat: message.seat, phase: message.phase, kind: message.kind, deadline: message.deadline, localDeadline: message.deadline - best } });
  }

  // ===========================================================================================
  // Commands
  // ===========================================================================================

  setName(raw: string): string {
    const name = sanitizeName(raw);
    writeKey(this.storage, NAME_STORAGE_KEY, name);
    this.patch({ name });
    if (name && this.client.ready) this.client.send({ type: 'set_name', name });
    return name;
  }

  /** Use another server ("host:port"); empty text goes back to this page's server. */
  setServer(input: string): boolean {
    const text = input.trim();
    const url = text ? normalizeServerUrl(text) : this.defaultUrl;
    if (!url) return false;
    writeKey(this.storage, SERVER_STORAGE_KEY, text ? url : '');
    this.client.setUrl(url);
    this.patch({ serverUrl: url, customServer: text !== '', fatal: null });
    return true;
  }

  connect(): void {
    this.patch({ fatal: null });
    this.client.connect();
  }

  createRoom(config: GameConfig, selection: ConfigSelection, hostOptions?: HostOptionsPatch): void {
    this.patch({ pending: 'create', fatal: null });
    this.client.send({ type: 'create_room', config, selection, ...(hostOptions ? { hostOptions } : {}) });
  }

  joinRoom(code: string): void {
    this.patch({ pending: 'join', fatal: null });
    this.client.send({ type: 'join_room', code });
  }

  claimSeat(seat: number): void {
    this.client.send({ type: 'claim_seat', seat });
  }

  releaseSeat(): void {
    this.client.send({ type: 'release_seat' });
  }

  setReady(ready: boolean): void {
    this.client.send({ type: 'set_ready', ready });
  }

  updateConfig(config: GameConfig, selection: ConfigSelection, hostOptions?: HostOptionsPatch): void {
    this.client.send({ type: 'update_config', config, selection, ...(hostOptions ? { hostOptions } : {}) });
  }

  startGame(): void {
    this.client.send({ type: 'start_game' });
  }

  returnToLobby(): void {
    this.client.send({ type: 'return_to_lobby' });
  }

  /** Send a seat action; false when there is no connection to send it on. */
  sendAction(action: Action): boolean {
    if (this.state.status === 'closed' || this.state.status === 'idle') return false;
    this.client.send({ type: 'action', action });
    return true;
  }

  /** Leave the room and close the connection. */
  leave(): void {
    if (this.client.ready) this.client.send({ type: 'leave' });
    this.patch({ room: null, game: null, timer: null, pending: null });
    this.client.close();
  }

  /** Is this tab the room's host? */
  isHost(): boolean {
    const { room, clientId } = this.state;
    return room !== null && clientId !== null && room.hostId === clientId;
  }

  /** The seat this tab holds in the room (or waits to take over), or null. */
  mySeat(): number | null {
    const { room, clientId } = this.state;
    if (!room || !clientId) return null;
    const held = room.seats.find((s) => s.occupantId === clientId) ?? room.seats.find((s) => s.pendingId === clientId);
    return held ? held.seat : null;
  }
}

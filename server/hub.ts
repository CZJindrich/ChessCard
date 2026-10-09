/**
 * The server's message router: sessions (token → identity), the room registry and the
 * dispatch of every client message. Transport-agnostic (`Conn`), so unit tests drive it with
 * fake connections and the WebSocket layer in app.ts stays thin.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { contentHash, ENGINE_VERSION, getContent } from '../src/engine';
import type { ContentRegistry } from '../src/engine/types';
import { sanitizeHostOptions } from '../src/config';
import {
  errorText,
  isRoomCode,
  normalizeRoomCodeInput,
  parseClientMessage,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  sanitizeName,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '../src/net/protocol';
import { realClock, type Clock, type DriverOptions } from './driver';
import { consoleLogger, type Logger } from './log';
import { nullRoomStore, type RoomStore } from './persist';
import { sanitizeRoomConfig, sanitizeSelection } from './roomConfig';
import { DEFAULT_HOST_MIGRATE_MS, Room, type Conn, type Identity, type RoomError } from './rooms';

export interface HubOptions {
  clock?: Clock;
  log?: Logger;
  store?: RoomStore;
  content?: ContentRegistry;
  driver?: Omit<DriverOptions, 'clock'>;
  /** Defaults to content rules.roomCode.idleMinutes (30). */
  idleMinutes?: number;
  hostMigrateMs?: number;
  maxRooms?: number;
  /** Messages per second a connection may send (burst twice that). */
  rateLimit?: number;
  /** Secret salts (tests pass a fixed one). */
  salt?: () => string;
  /** Room codes (tests pass a sequence). */
  roomCode?: () => string;
}

interface Session extends Identity {
  conn: HubConn | null;
  roomCode: string | null;
  lastSeen: number;
}

/** A connection as the hub sees it. */
export interface HubConn extends Conn {
  close(code?: number, reason?: string): void;
}

interface ConnState {
  session: Session | null;
  tokens: number;
  refilledAt: number;
  strikes: number;
}

const DEFAULT_NAME = 'Lanternwarden';
/** Sessions not in a room and not connected are forgotten after this long. */
const SESSION_TTL_MS = 60 * 60 * 1000;

export class Hub {
  private readonly clock: Clock;
  private readonly log: Logger;
  private readonly store: RoomStore;
  private readonly content: ContentRegistry;
  private readonly hash: string;
  private readonly options: HubOptions;
  private readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<string, Session>();
  private readonly conns = new Map<HubConn, ConnState>();
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(options: HubOptions = {}) {
    this.options = options;
    this.clock = options.clock ?? realClock;
    this.log = options.log ?? consoleLogger;
    this.store = options.store ?? nullRoomStore;
    this.content = options.content ?? getContent();
    this.hash = contentHash(this.content);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  room(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Rebuild persisted rooms (server restart). */
  restore(): number {
    let restored = 0;
    for (const record of this.store.loadAll()) {
      try {
        const { room, dropped } = Room.restore(record, this.roomDeps());
        this.rooms.set(room.code, room);
        for (const identity of room.identities()) {
          this.sessions.set(identity.token, { ...identity, conn: null, roomCode: room.code, lastSeen: this.clock.now() });
        }
        this.log.info(`${room.code} restored (${record.log.length} log entries${dropped ? `, ${dropped} could not be replayed` : ''})`);
        restored++;
      } catch (error) {
        this.log.warn(`${record.code} could not be restored: ${String(error)}`);
        this.store.remove(record.code);
      }
    }
    return restored;
  }

  /** Start the once-a-second clock (graces, host migration, expiry). */
  start(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), 1000);
    this.ticker.unref?.();
  }

  stop(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    for (const room of this.rooms.values()) room.close('shutdown');
    this.rooms.clear();
  }

  private roomDeps() {
    return {
      content: this.content,
      clock: this.clock,
      log: this.log,
      store: this.store,
      driver: this.options.driver,
      idleMinutes: this.options.idleMinutes ?? this.content.rules.roomCode.idleMinutes,
      hostMigrateMs: this.options.hostMigrateMs ?? DEFAULT_HOST_MIGRATE_MS,
      salt: this.options.salt,
    };
  }

  tick(): void {
    const now = this.clock.now();
    for (const room of [...this.rooms.values()]) {
      const { removed, expired } = room.tick(now);
      for (const id of removed) this.forgetRoomOf(id, room.code);
      if (expired || room.isClosed) this.dropRoom(room);
    }
    for (const [token, session] of this.sessions) {
      if (!session.conn && !session.roomCode && now - session.lastSeen > SESSION_TTL_MS) this.sessions.delete(token);
    }
  }

  private dropRoom(room: Room): void {
    room.close('expired');
    this.rooms.delete(room.code);
    for (const session of this.sessions.values()) if (session.roomCode === room.code) session.roomCode = null;
  }

  private forgetRoomOf(id: string, code: string): void {
    for (const session of this.sessions.values()) if (session.id === id && session.roomCode === code) session.roomCode = null;
  }

  // ===========================================================================================
  // Connections
  // ===========================================================================================

  connect(conn: HubConn): void {
    this.conns.set(conn, { session: null, tokens: this.burst(), refilledAt: this.clock.now(), strikes: 0 });
  }

  disconnect(conn: HubConn): void {
    const state = this.conns.get(conn);
    this.conns.delete(conn);
    const session = state?.session;
    if (!session || session.conn !== conn) return;
    session.conn = null;
    session.lastSeen = this.clock.now();
    if (session.roomCode) this.rooms.get(session.roomCode)?.detach(session.id);
  }

  private burst(): number {
    return (this.options.rateLimit ?? 20) * 2;
  }

  private allow(state: ConnState): boolean {
    const now = this.clock.now();
    const rate = this.options.rateLimit ?? 20;
    state.tokens = Math.min(this.burst(), state.tokens + ((now - state.refilledAt) / 1000) * rate);
    state.refilledAt = now;
    if (state.tokens < 1) return false;
    state.tokens -= 1;
    return true;
  }

  private send(conn: Conn, message: ServerMessage): void {
    conn.send(message);
  }

  private error(conn: Conn, code: ErrorCode, message?: string): void {
    this.send(conn, { type: 'error', code, message: message ?? errorText(code) });
  }

  /** One inbound text frame. Never throws. */
  receive(conn: HubConn, raw: string): void {
    const state = this.conns.get(conn);
    if (!state) return;
    if (!this.allow(state)) {
      state.strikes += 1;
      if (state.strikes === 1 || state.strikes % 50 === 0) this.error(conn, 'rate_limited');
      if (state.strikes > 500) conn.close(1008, 'rate limited');
      return;
    }
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.error(conn, parsed.code, parsed.message);
      return;
    }
    try {
      this.dispatch(conn, state, parsed.message);
    } catch (error) {
      this.log.error(`handling ${parsed.message.type} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      this.error(conn, 'internal', 'The server hit a problem with that request.');
    }
  }

  private dispatch(conn: HubConn, state: ConnState, message: ClientMessage): void {
    if (message.type === 'ping') {
      this.send(conn, { type: 'pong', ...(message.id !== undefined ? { id: message.id } : {}), serverTime: this.clock.now() });
      return;
    }
    if (message.type === 'hello') {
      this.hello(conn, state, message);
      return;
    }
    const session = state.session;
    if (!session) {
      this.error(conn, 'hello_required', 'Say hello first.');
      return;
    }
    session.lastSeen = this.clock.now();
    const room = session.roomCode ? this.rooms.get(session.roomCode) : undefined;
    const report = (result: RoomError | null): void => {
      if (result) this.error(conn, result.code, result.message);
    };
    switch (message.type) {
      case 'create_room':
        this.createRoom(conn, session, message);
        return;
      case 'join_room':
        this.joinRoom(conn, session, message.code);
        return;
      case 'leave':
        this.leaveRoom(conn, session);
        return;
      case 'set_name': {
        const name = sanitizeName(message.name);
        if (!name) return;
        session.name = name;
        room?.setName(session.id, name);
        return;
      }
      default:
        break;
    }
    if (!room) {
      this.error(conn, 'not_in_room', 'You are not in a room.');
      return;
    }
    switch (message.type) {
      case 'claim_seat':
        report(room.claimSeat(session.id, message.seat));
        return;
      case 'release_seat':
        report(room.releaseSeat(session.id));
        return;
      case 'set_ready':
        report(room.setReady(session.id, message.ready));
        return;
      case 'update_config': {
        if (session.id !== room.hostId) {
          this.error(conn, 'not_host');
          return;
        }
        const config = sanitizeRoomConfig(message.config, this.content, new Date(this.clock.now()));
        const selection = sanitizeSelection(message.selection);
        if (!config.ok || !selection) {
          this.error(conn, 'bad_config', config.ok ? 'The Setup selection is malformed.' : config.message);
          return;
        }
        const grace = message.hostOptions?.reconnect_grace;
        report(room.updateConfig(session.id, config.config, selection, grace === undefined ? null : sanitizeHostOptions({ reconnect_grace: grace }).reconnect_grace));
        return;
      }
      case 'start_game':
        report(room.start(session.id));
        return;
      case 'return_to_lobby':
        report(room.returnToLobby(session.id));
        return;
      case 'action':
        report(room.action(session.id, message.action));
        return;
      default:
        return;
    }
  }

  private hello(conn: HubConn, state: ConnState, message: Extract<ClientMessage, { type: 'hello' }>): void {
    if (message.protocol !== PROTOCOL_VERSION || message.engineVersion !== ENGINE_VERSION) {
      this.error(conn, 'version_mismatch', `This server speaks protocol ${PROTOCOL_VERSION} with engine ${ENGINE_VERSION}. Reload the page to update.`);
      return;
    }
    if (message.contentHash !== this.hash) {
      this.error(conn, 'content_mismatch');
      return;
    }
    const name = sanitizeName(message.name) || DEFAULT_NAME;
    let session = message.token ? this.sessions.get(message.token) : undefined;
    if (session && session.conn && session.conn !== conn) {
      // The newest connection wins (a reload, or a second tab sharing the token).
      const old = session.conn;
      this.error(old, 'replaced');
      const oldState = this.conns.get(old);
      if (oldState) oldState.session = null;
      old.close(4000, 'replaced');
    }
    if (!session) {
      const token = randomBytes(18).toString('base64url');
      session = { id: `c${randomBytes(5).toString('hex')}`, token, name, conn: null, roomCode: null, lastSeen: this.clock.now() };
      this.sessions.set(token, session);
    }
    if (state.session && state.session !== session && state.session.conn === conn) this.disconnect(conn);
    session.name = name;
    session.conn = conn;
    session.lastSeen = this.clock.now();
    state.session = session;
    if (!this.conns.has(conn)) this.conns.set(conn, state);
    this.send(conn, { type: 'welcome', protocol: PROTOCOL_VERSION, token: session.token, clientId: session.id, name, serverTime: this.clock.now() });
    const room = session.roomCode ? this.rooms.get(session.roomCode) : undefined;
    if (room && room.has(session.id)) {
      room.setName(session.id, name);
      room.attach(session.id, conn);
    } else {
      session.roomCode = null;
      this.send(conn, { type: 'room', room: null });
    }
  }

  private newCode(): string | null {
    if (this.options.roomCode) {
      const code = this.options.roomCode();
      return this.rooms.has(code) ? null : code;
    }
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  private createRoom(conn: HubConn, session: Session, message: Extract<ClientMessage, { type: 'create_room' }>): void {
    if (this.rooms.size >= (this.options.maxRooms ?? 500)) {
      this.error(conn, 'server_full');
      return;
    }
    const config = sanitizeRoomConfig(message.config, this.content, new Date(this.clock.now()));
    const selection = sanitizeSelection(message.selection);
    if (!config.ok || !selection) {
      this.error(conn, 'bad_config', config.ok ? 'The Setup selection is malformed.' : config.message);
      return;
    }
    const code = this.newCode();
    if (!code) {
      this.error(conn, 'server_full', 'No room code is free right now.');
      return;
    }
    if (session.roomCode) this.leaveRoom(conn, session, false);
    const grace = sanitizeHostOptions(message.hostOptions ?? null).reconnect_grace;
    const room = new Room(code, session, config.config, selection, grace, this.roomDeps());
    this.rooms.set(code, room);
    session.roomCode = code;
    this.log.info(`${code} opened by ${session.name} (${config.config.mode}, ${config.config.length}, ${config.config.difficulty}, ${config.config.seats.length} seats)`);
    const error = room.join(session, conn);
    if (error) this.error(conn, error.code, error.message);
  }

  private joinRoom(conn: HubConn, session: Session, raw: string): void {
    const code = normalizeRoomCodeInput(raw);
    const room = isRoomCode(code) ? this.rooms.get(code) : undefined;
    if (!room || room.isClosed) {
      this.error(conn, 'room_not_found');
      return;
    }
    if (session.roomCode && session.roomCode !== code) this.leaveRoom(conn, session, false);
    const error = room.join(session, conn);
    if (error) {
      this.error(conn, error.code, error.message);
      return;
    }
    session.roomCode = code;
  }

  private leaveRoom(conn: HubConn, session: Session, tell = true): void {
    const code = session.roomCode;
    session.roomCode = null;
    const room = code ? this.rooms.get(code) : undefined;
    if (room && room.leave(session.id)) this.dropRoom(room);
    if (tell) this.send(conn, { type: 'room', room: null });
  }
}

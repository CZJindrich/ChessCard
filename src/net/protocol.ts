/**
 * The online wire protocol (ARCHITECTURE §7, GDD §11.6 and B.4), shared by the browser client
 * (src/net) and the Node server (server/). Pure TypeScript with no DOM types: it compiles under
 * tsconfig.server.json too.
 *
 * Every message is one JSON object with a snake_case `type`. Both sides validate what they
 * receive with `parseClientMessage` / `parseServerMessage`; anything unknown, malformed or too
 * large is refused with an error and never throws.
 */
import type { ConfigSelection } from '../config/presets';
import type {
  Action,
  BotLevel,
  CardTargetChoice,
  GameConfig,
  GameEvent,
  GameState,
  PhaseId,
  Pos,
  ReasonCode,
  ReasonParams,
  SeatKind,
} from '../engine/types';

/** Bumped on any incompatible change to the messages below. */
export const PROTOCOL_VERSION = 1;
/** The WebSocket endpoint path (the HTTP server serves the built client everywhere else). */
export const WS_PATH = '/ws';
export const DEFAULT_SERVER_PORT = 8787;
/** Inbound limit for client messages (a full config plus selection is about 3 KB). */
export const MAX_CLIENT_MESSAGE_BYTES = 32 * 1024;
/** Inbound limit for server messages (a full game view is 20-60 KB). */
export const MAX_SERVER_MESSAGE_BYTES = 4 * 1024 * 1024;
export const MAX_NAME_LENGTH = 24;
export const MAX_TOKEN_LENGTH = 64;
/** People in one room: up to 4 seats plus watchers. */
export const MAX_ROOM_MEMBERS = 8;
/** Room codes (GDD §11.6): 4 letters, no vowels, so no words. Mirrors content rules.roomCode. */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;

// =============================================================================================
// Client → server
// =============================================================================================

export interface HostOptionsPatch {
  /** Seconds a disconnected player keeps their seat (30-600; capped at 120 during their turn). */
  reconnect_grace?: number;
}

export type ClientMessage =
  | { type: 'hello'; protocol: number; token?: string; name: string; engineVersion: string; contentHash: string }
  | { type: 'create_room'; config: GameConfig; selection: ConfigSelection; hostOptions?: HostOptionsPatch }
  | { type: 'join_room'; code: string }
  | { type: 'claim_seat'; seat: number }
  | { type: 'release_seat' }
  | { type: 'set_ready'; ready: boolean }
  /** Host only, lobby only. Clears every Ready flag. */
  | { type: 'update_config'; config: GameConfig; selection: ConfigSelection; hostOptions?: HostOptionsPatch }
  /** Host only: every claimed human seat must be Ready. */
  | { type: 'start_game' }
  /** Host only, after game over: back to the lobby with the same seats. */
  | { type: 'return_to_lobby' }
  | { type: 'set_name'; name: string }
  | { type: 'action'; action: Action }
  | { type: 'leave' }
  | { type: 'ping'; id?: number };

export type ClientMessageType = ClientMessage['type'];

// =============================================================================================
// Server → client
// =============================================================================================

/**
 * A seat in the room. In the lobby `kind` is the configured kind; in a game it is who plays the
 * seat right now (a disconnected player's seat shows `bot_warden` once the grace has run out).
 */
export type SeatStatus =
  /** Lobby: a human seat nobody has claimed (it becomes a Warden bot if the game starts). */
  | 'open'
  /** A player holds the seat and is connected. */
  | 'human'
  /** The holder lost their connection; their grace is running. */
  | 'reconnecting'
  /** A bot plays it (configured bot, or a stand-in for an absent player). */
  | 'bot';

export interface RoomSeat {
  seat: number;
  /** Lobby: configured kind. Game: the controller now ('human' or the bot level). */
  kind: SeatKind;
  hero: string | null;
  /** Display name: the player's name, or the bot's. */
  name: string;
  /** clientId of the player who holds the seat (also while a bot stands in for them). */
  occupantId: string | null;
  /** Game: a player waiting to take the seat over at the start of its next seat turn. */
  pendingId: string | null;
  connected: boolean;
  ready: boolean;
  status: SeatStatus;
  /** Server time (ms) the reconnect grace ends, while `status` is 'reconnecting'. */
  graceEndsAt: number | null;
}

export interface RoomMember {
  id: string;
  name: string;
  connected: boolean;
  seat: number | null;
  host: boolean;
}

export type RoomPhase = 'lobby' | 'playing';

export interface RoomGameInfo {
  startedAt: number;
  over: boolean;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  phase: RoomPhase;
  seats: RoomSeat[];
  members: RoomMember[];
  /** The room's config. The seed is blank for everyone but the host until game over. */
  config: GameConfig;
  /** The host's Setup selection (null for everyone else). */
  selection: ConfigSelection | null;
  /** Increases on every settings change. */
  configVersion: number;
  reconnectGrace: number;
  /** Lobby: whether the host may start now, and why not. */
  canStart: boolean;
  startBlocker: string | null;
  game: RoomGameInfo | null;
  /** Server time (ms) the room expires if nothing happens. */
  expiresAt: number;
}

/** Who plays each seat of a running game. */
export interface SeatAssignment {
  seat: number;
  /** clientId of the player in control, or null while a bot plays the seat. */
  controllerId: string | null;
  bot: BotLevel | null;
}

/** Revealed at game over (GDD B.3): the engine seed was `seed + "\u0000" + salt`. */
export interface SeedReveal {
  seed: string;
  salt: string;
}

export type TimerKind = 'turn' | 'phase' | 'deploy' | 'toll' | 'carry_over' | 'chandlery' | 'haunt' | 'idle' | 'vote';

export type ErrorCode =
  | 'bad_message'
  | 'too_large'
  | 'unknown_type'
  | 'hello_required'
  | 'version_mismatch'
  | 'content_mismatch'
  | 'not_in_room'
  | 'room_not_found'
  | 'room_full'
  | 'not_host'
  | 'bad_config'
  | 'bad_seat'
  | 'seat_taken'
  | 'not_ready'
  | 'wrong_phase'
  | 'rate_limited'
  | 'replaced'
  | 'room_expired'
  | 'server_full'
  | 'internal';

export type ServerMessage =
  | { type: 'welcome'; protocol: number; token: string; clientId: string; name: string; serverTime: number }
  /** The room as this client may see it; null once the client is no longer in a room. */
  | { type: 'room'; room: RoomSnapshot | null }
  | {
      type: 'game';
      /** Increases by one per message; a resync (events [] and action null) may skip ahead. */
      seq: number;
      seats: SeatAssignment[];
      /** Seats this client controls right now. */
      you: number[];
      /** `viewFor(state, yourSeat)` (hidden hands, deck orders and the seed removed). */
      view: GameState;
      /** Events to animate, filtered for this client (Last Flame: rivals' draws are counts only). */
      events: GameEvent[];
      /** The action that produced them; null for a resync or a control change. */
      action: Action | null;
      serverTime: number;
      reveal?: SeedReveal;
    }
  | { type: 'reject'; action: Action; reason: ReasonCode; params?: ReasonParams }
  /** A decision timer (GDD §11.4); `deadline` null clears it. Times are server ms. */
  | { type: 'timer'; seat: number | null; phase: PhaseId; kind: TimerKind; deadline: number | null; serverTime: number }
  | { type: 'notice'; text: string; tone: 'info' | 'warning' }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'pong'; id?: number; serverTime: number };

export type ServerMessageType = ServerMessage['type'];
export type ServerMessageOf<K extends ServerMessageType> = Extract<ServerMessage, { type: K }>;
export type ClientMessageOf<K extends ClientMessageType> = Extract<ClientMessage, { type: K }>;

export type ParseResult<T> = { ok: true; message: T } | { ok: false; code: ErrorCode; message: string };

// =============================================================================================
// Small validators
// =============================================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Ids from the engine ("p12", "c7") and content ids ("strike_a_cinder"). */
const ID_RE = /^[A-Za-z0-9_:-]{1,48}$/;

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

function isPos(value: unknown): value is Pos {
  return isRecord(value) && isInt(value.x, 0, 31) && isInt(value.y, 0, 31);
}

function isDir(value: unknown): value is Pos {
  return isRecord(value) && isInt(value.x, -8, 8) && isInt(value.y, -8, 8);
}

function isSeat(value: unknown): value is number {
  return isInt(value, 0, 3);
}

function isOptionalBool(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isIdList(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every(isId);
}

function isTargetChoice(value: unknown): value is CardTargetChoice {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'piece':
      return isId(value.pieceId);
    case 'tile':
      return isPos(value.pos);
    case 'direction':
      return isDir(value.dir);
    default:
      return false;
  }
}

function isTargets(value: unknown): value is CardTargetChoice[] {
  return Array.isArray(value) && value.length <= 12 && value.every(isTargetChoice);
}

/** Display names: trimmed, control characters removed, at most 24 characters. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const visible = Array.from(raw.normalize('NFC')).filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    // C0/C1 controls, zero-width and bidi-override characters.
    return !(code < 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e) || code === 0xfeff);
  });
  return Array.from(visible.join('').trim()).slice(0, MAX_NAME_LENGTH).join('').trim();
}

/** Upper-case and keep only alphabet letters (typing "kw-tr" gives "KWTR"). */
export function normalizeRoomCodeInput(raw: string): string {
  return [...raw.toUpperCase()].filter((ch) => ROOM_CODE_ALPHABET.includes(ch)).join('').slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && value.length === ROOM_CODE_LENGTH && [...value].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}

// =============================================================================================
// Actions a client may send (everything a seat can do; never `advance` or setup actions)
// =============================================================================================

type ActionCheck = (a: Record<string, unknown>) => boolean;

const PLAYER_ACTION_CHECKS: Readonly<Record<string, ActionCheck>> = {
  move: (a) => isId(a.pieceId) && isPos(a.to),
  strike: (a) => isId(a.pieceId) && isPos(a.target),
  relight: (a) => isId(a.pieceId) && isId(a.wickId),
  light_shrine: (a) => isId(a.pieceId) && isPos(a.shrine),
  play_card: (a) => isId(a.cardUid) && isTargets(a.targets) && (a.mode === undefined || isInt(a.mode, 0, 9)),
  use_power: (a) => isTargets(a.targets),
  free_action: (a) =>
    (a.kind === 'melt' || a.kind === 'ring_bell') && (a.pieceId === undefined || isId(a.pieceId)) && (a.target === undefined || isPos(a.target)),
  end_turn: () => true,
  undo: () => true,
  claim_turn: () => true,
  concede: (a) => isOptionalBool(a.vote),
  deploy: (a) => isId(a.pieceId) && isPos(a.to),
  ready: () => true,
  choose_toll: (a) => isId(a.tollId),
  carry_over: (a) => isIdList(a.keep, 12),
  haunt: (a) => a.at === null || isPos(a.at),
  retry_night: (a) => isOptionalBool(a.vote),
  draft_pick: (a) => isId(a.cardId),
  skip_pick: () => true,
  boon_pick: (a) =>
    (a.boon === null || isId(a.boon)) &&
    isRecord(a.args) &&
    (a.args.heirloomId === undefined || isId(a.args.heirloomId)) &&
    (a.args.cardUid === undefined || isId(a.args.cardUid)) &&
    (a.args.cardUids === undefined || isIdList(a.args.cardUids, 4)),
};

/** Action types a client may send. */
export const CLIENT_ACTION_TYPES: readonly string[] = Object.keys(PLAYER_ACTION_CHECKS);

/**
 * A structurally valid seat action, or null. Only the fields the engine reads are kept, so a
 * client cannot smuggle extra data into the action log. The rules check is the engine's job.
 */
export function sanitizeClientAction(raw: unknown): Action | null {
  if (!isRecord(raw) || typeof raw.type !== 'string' || !isSeat(raw.seat)) return null;
  const check = Object.prototype.hasOwnProperty.call(PLAYER_ACTION_CHECKS, raw.type) ? PLAYER_ACTION_CHECKS[raw.type] : undefined;
  if (!check || !check(raw)) return null;
  const seat = raw.seat;
  const pos = (p: unknown): Pos => {
    const v = p as Pos;
    return { x: v.x, y: v.y };
  };
  const targets = (t: unknown): CardTargetChoice[] =>
    (t as CardTargetChoice[]).map((c) =>
      c.kind === 'piece' ? { kind: 'piece', pieceId: c.pieceId } : c.kind === 'tile' ? { kind: 'tile', pos: pos(c.pos) } : { kind: 'direction', dir: pos(c.dir) },
    );
  switch (raw.type) {
    case 'move':
      return { type: 'move', seat, pieceId: raw.pieceId as string, to: pos(raw.to) };
    case 'strike':
      return { type: 'strike', seat, pieceId: raw.pieceId as string, target: pos(raw.target) };
    case 'relight':
      return { type: 'relight', seat, pieceId: raw.pieceId as string, wickId: raw.wickId as string };
    case 'light_shrine':
      return { type: 'light_shrine', seat, pieceId: raw.pieceId as string, shrine: pos(raw.shrine) };
    case 'play_card':
      return raw.mode === undefined
        ? { type: 'play_card', seat, cardUid: raw.cardUid as string, targets: targets(raw.targets) }
        : { type: 'play_card', seat, cardUid: raw.cardUid as string, targets: targets(raw.targets), mode: raw.mode as number };
    case 'use_power':
      return { type: 'use_power', seat, targets: targets(raw.targets) };
    case 'free_action': {
      const action: Action = { type: 'free_action', seat, kind: raw.kind as 'melt' | 'ring_bell' };
      if (raw.pieceId !== undefined) action.pieceId = raw.pieceId as string;
      if (raw.target !== undefined) action.target = pos(raw.target);
      return action;
    }
    case 'end_turn':
    case 'undo':
    case 'claim_turn':
    case 'ready':
    case 'skip_pick':
      return { type: raw.type, seat };
    case 'concede':
    case 'retry_night':
      return raw.vote === undefined ? { type: raw.type, seat } : { type: raw.type, seat, vote: raw.vote as boolean };
    case 'deploy':
      return { type: 'deploy', seat, pieceId: raw.pieceId as string, to: pos(raw.to) };
    case 'choose_toll':
      return { type: 'choose_toll', seat, tollId: raw.tollId as string };
    case 'carry_over':
      return { type: 'carry_over', seat, keep: [...(raw.keep as string[])] };
    case 'haunt':
      return { type: 'haunt', seat, at: raw.at === null ? null : pos(raw.at) };
    case 'draft_pick':
      return { type: 'draft_pick', seat, cardId: raw.cardId as string };
    case 'boon_pick': {
      const args = raw.args as Record<string, unknown>;
      const clean: { heirloomId?: string; cardUid?: string; cardUids?: string[] } = {};
      if (typeof args.heirloomId === 'string') clean.heirloomId = args.heirloomId;
      if (typeof args.cardUid === 'string') clean.cardUid = args.cardUid;
      if (Array.isArray(args.cardUids)) clean.cardUids = [...(args.cardUids as string[])];
      return { type: 'boon_pick', seat, boon: raw.boon as Extract<Action, { type: 'boon_pick' }>['boon'], args: clean };
    }
    default:
      return null;
  }
}

// =============================================================================================
// Parsing
// =============================================================================================

function byteLength(text: string): number {
  // UTF-8 length without TextEncoder/Buffer (works in both runtimes): at most 3 bytes per UTF-16 unit.
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? 2 : 3;
  }
  return bytes;
}

function parseJson(raw: unknown, limit: number): ParseResult<Record<string, unknown>> {
  if (typeof raw !== 'string') return { ok: false, code: 'bad_message', message: 'Messages must be JSON text.' };
  if (raw.length > limit || byteLength(raw) > limit) return { ok: false, code: 'too_large', message: `Message over ${limit} bytes.` };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'bad_message', message: 'Message is not valid JSON.' };
  }
  if (!isRecord(value) || typeof value.type !== 'string') return { ok: false, code: 'bad_message', message: 'Message needs a "type".' };
  return { ok: true, message: value };
}

const bad = (message: string): ParseResult<never> => ({ ok: false, code: 'bad_message', message });

/** Checks a client message (the server's inbound side). Never throws. */
export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  const parsed = parseJson(raw, MAX_CLIENT_MESSAGE_BYTES);
  if (!parsed.ok) return parsed;
  const m = parsed.message;
  const hostOptions = (value: unknown): HostOptionsPatch | undefined | null => {
    if (value === undefined) return undefined;
    if (!isRecord(value)) return null;
    if (value.reconnect_grace !== undefined && !isInt(value.reconnect_grace, 0, 100000)) return null;
    return value.reconnect_grace === undefined ? {} : { reconnect_grace: value.reconnect_grace as number };
  };
  switch (m.type) {
    case 'hello': {
      if (!isInt(m.protocol, 0, 1_000_000)) return bad('hello needs a protocol version.');
      if (m.token !== undefined && (typeof m.token !== 'string' || m.token.length > MAX_TOKEN_LENGTH)) return bad('Bad session token.');
      if (typeof m.name !== 'string' || m.name.length > 200) return bad('hello needs a name.');
      if (typeof m.engineVersion !== 'string' || m.engineVersion.length > 32) return bad('hello needs an engine version.');
      if (typeof m.contentHash !== 'string' || m.contentHash.length > 32) return bad('hello needs a content hash.');
      const hello: ClientMessage = { type: 'hello', protocol: m.protocol, name: m.name, engineVersion: m.engineVersion, contentHash: m.contentHash };
      if (typeof m.token === 'string' && m.token) hello.token = m.token;
      return { ok: true, message: hello };
    }
    case 'create_room':
    case 'update_config': {
      if (!isRecord(m.config) || !isRecord(m.selection)) return bad(`${m.type} needs a config and a selection.`);
      const options = hostOptions(m.hostOptions);
      if (options === null) return bad('Bad host options.');
      const message = {
        type: m.type,
        config: m.config as unknown as GameConfig,
        selection: m.selection as unknown as ConfigSelection,
        ...(options ? { hostOptions: options } : {}),
      } as ClientMessage;
      return { ok: true, message };
    }
    case 'join_room':
      return typeof m.code === 'string' && m.code.length <= 16 ? { ok: true, message: { type: 'join_room', code: m.code } } : bad('join_room needs a code.');
    case 'claim_seat':
      return isSeat(m.seat) ? { ok: true, message: { type: 'claim_seat', seat: m.seat } } : bad('claim_seat needs a seat 0-3.');
    case 'set_ready':
      return typeof m.ready === 'boolean' ? { ok: true, message: { type: 'set_ready', ready: m.ready } } : bad('set_ready needs ready: boolean.');
    case 'set_name':
      return typeof m.name === 'string' && m.name.length <= 200 ? { ok: true, message: { type: 'set_name', name: m.name } } : bad('set_name needs a name.');
    case 'action': {
      const action = sanitizeClientAction(m.action);
      return action ? { ok: true, message: { type: 'action', action } } : bad('Malformed or forbidden action.');
    }
    case 'ping':
      return m.id === undefined || isInt(m.id, 0, Number.MAX_SAFE_INTEGER) ? { ok: true, message: m.id === undefined ? { type: 'ping' } : { type: 'ping', id: m.id } } : bad('Bad ping id.');
    case 'release_seat':
    case 'start_game':
    case 'return_to_lobby':
    case 'leave':
      return { ok: true, message: { type: m.type } };
    default:
      return { ok: false, code: 'unknown_type', message: `Unknown message type "${String(m.type).slice(0, 32)}".` };
  }
}

const SERVER_TYPES: ReadonlySet<string> = new Set<ServerMessageType>(['welcome', 'room', 'game', 'reject', 'timer', 'notice', 'error', 'pong']);

function isGameStateLike(value: unknown): value is GameState {
  return isRecord(value) && Array.isArray(value.players) && isRecord(value.pieces) && isRecord(value.board) && typeof value.phase === 'string' && isRecord(value.config);
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return (
    isRecord(value) &&
    isRoomCode(value.code) &&
    typeof value.hostId === 'string' &&
    (value.phase === 'lobby' || value.phase === 'playing') &&
    Array.isArray(value.seats) &&
    value.seats.every((s) => isRecord(s) && isSeat(s.seat) && typeof s.name === 'string' && typeof s.status === 'string') &&
    Array.isArray(value.members) &&
    isRecord(value.config)
  );
}

/** Checks a server message (the client's inbound side). Never throws. */
export function parseServerMessage(raw: unknown): ParseResult<ServerMessage> {
  const parsed = parseJson(raw, MAX_SERVER_MESSAGE_BYTES);
  if (!parsed.ok) return parsed;
  const m = parsed.message;
  if (!SERVER_TYPES.has(m.type as string)) return { ok: false, code: 'unknown_type', message: `Unknown server message "${String(m.type).slice(0, 32)}".` };
  const ok = { ok: true, message: m as unknown as ServerMessage } as const;
  switch (m.type) {
    case 'welcome':
      return typeof m.token === 'string' && typeof m.clientId === 'string' && typeof m.serverTime === 'number' ? ok : bad('Malformed welcome.');
    case 'room':
      return m.room === null || isRoomSnapshot(m.room) ? ok : bad('Malformed room.');
    case 'game':
      return isInt(m.seq, 0, Number.MAX_SAFE_INTEGER) &&
        isGameStateLike(m.view) &&
        Array.isArray(m.events) &&
        Array.isArray(m.you) &&
        m.you.every(isSeat) &&
        Array.isArray(m.seats) &&
        typeof m.serverTime === 'number'
        ? ok
        : bad('Malformed game update.');
    case 'reject':
      return isRecord(m.action) && typeof m.reason === 'string' ? ok : bad('Malformed reject.');
    case 'timer':
      return (m.seat === null || isSeat(m.seat)) && typeof m.phase === 'string' && (m.deadline === null || typeof m.deadline === 'number') ? ok : bad('Malformed timer.');
    case 'notice':
      return typeof m.text === 'string' ? ok : bad('Malformed notice.');
    case 'error':
      return typeof m.code === 'string' && typeof m.message === 'string' ? ok : bad('Malformed error.');
    case 'pong':
      return typeof m.serverTime === 'number' ? ok : bad('Malformed pong.');
    default:
      return bad('Unknown server message.');
  }
}

/** Human-readable text for an error code (toasts). */
export function errorText(code: ErrorCode, fallback = ''): string {
  switch (code) {
    case 'room_not_found':
      return 'No room with that code. Check the letters, or it may have expired.';
    case 'room_full':
      return 'That room is full.';
    case 'version_mismatch':
      return 'This game and the server run different versions. Reload the page.';
    case 'content_mismatch':
      return 'The server plays the base content. Unload mods (Codex) to play online.';
    case 'not_host':
      return 'Only the host can do that.';
    case 'seat_taken':
      return 'Someone else holds that seat.';
    case 'replaced':
      return 'This session was opened in another tab or window.';
    case 'room_expired':
      return 'The room closed after 30 minutes without activity.';
    case 'rate_limited':
      return 'Too many messages; slow down a little.';
    case 'server_full':
      return 'The server is full right now.';
    default:
      return fallback || 'Something went wrong online.';
  }
}

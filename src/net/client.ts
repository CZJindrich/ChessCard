/**
 * NetClient: one WebSocket to the game server with hello/token handling, automatic reconnect
 * with backoff, a send queue (messages wait until the server has welcomed us), keep-alive pings
 * and a typed listener API. No React; the session (session.ts) and transport build on it.
 */
import type { KeyValueStorage } from '../config/storage';
import {
  DEFAULT_SERVER_PORT,
  parseServerMessage,
  PROTOCOL_VERSION,
  WS_PATH,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
  type ServerMessageOf,
  type ServerMessageType,
} from './protocol';

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** The part of the browser WebSocket API the client uses (Node 22's global WebSocket fits too). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface NetIdentity {
  name: string;
  engineVersion: string;
  contentHash: string;
}

export interface NetClientOptions {
  /** ws:// or wss:// URL of the endpoint (default: this page's host, path /ws). */
  url?: string;
  /** Read on every (re)connect: the hello's name, engine version and content hash. */
  identity: () => NetIdentity;
  /** Where the session token lives across reloads (localStorage in the browser). */
  storage?: KeyValueStorage | null;
  socket?: WebSocketFactory;
  timers?: TimerApi;
  now?: () => number;
  /** Reconnect backoff (ms). */
  backoff?: { baseMs: number; maxMs: number };
  /** Keep-alive ping interval (ms); the socket is recycled after 2.5 intervals of silence. */
  pingMs?: number;
}

export const TOKEN_STORAGE_KEY = 'chesscard.online.token';
/** Errors after which reconnecting cannot help. */
const FATAL: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['replaced', 'version_mismatch', 'content_mismatch']);
const QUEUE_LIMIT = 32;
/** Queued actions older than this are dropped on reconnect (the state has moved on). */
const STALE_ACTION_MS = 5000;
const OPEN = 1;

/** The endpoint for this page: same host, ws(s) by the page's protocol. */
export function defaultServerUrl(): string {
  const loc = (globalThis as { location?: { protocol: string; host: string } }).location;
  if (!loc || !loc.host) return `ws://localhost:${DEFAULT_SERVER_PORT}${WS_PATH}`;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${WS_PATH}`;
}

/**
 * A server address as typed ("192.168.1.20:8787", "http://host:8787", "wss://host/ws") as a
 * WebSocket URL, or null when it cannot be one.
 */
export function normalizeServerUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let candidate = text;
  if (/^https?:\/\//i.test(candidate)) candidate = candidate.replace(/^http/i, 'ws');
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) && !/^wss?:\/\//i.test(candidate)) return null;
  else if (!/^wss?:\/\//i.test(candidate)) candidate = `ws://${candidate}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if ((url.protocol !== 'ws:' && url.protocol !== 'wss:') || !url.hostname) return null;
  if (url.pathname === '' || url.pathname === '/') url.pathname = WS_PATH;
  url.hash = '';
  return url.toString();
}

function readToken(storage: KeyValueStorage | null | undefined): string | null {
  try {
    const token = storage?.getItem(TOKEN_STORAGE_KEY) ?? null;
    return token && token.length <= 64 ? token : null;
  } catch {
    return null;
  }
}

function writeToken(storage: KeyValueStorage | null | undefined, token: string): void {
  try {
    storage?.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Private mode: the session lasts as long as the tab.
  }
}

const defaultTimers: TimerApi = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

function defaultSocket(url: string): WebSocketLike {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
  if (!Ctor) throw new Error('WebSocket is not available here');
  return new Ctor(url);
}

type AnyListener = (message: ServerMessage) => void;

interface Queued {
  message: ClientMessage;
  at: number;
}

export class NetClient {
  private readonly options: NetClientOptions;
  private readonly timers: TimerApi;
  private readonly now: () => number;
  private url: string;
  private socket: WebSocketLike | null = null;
  private statusValue: NetStatus = 'idle';
  private welcomed = false;
  private wanted = false;
  private attempt = 0;
  private reconnectHandle: unknown = null;
  private pingHandle: unknown = null;
  private lastHeard = 0;
  private pingId = 0;
  private readonly pingsSent = new Map<number, number>();
  private queue: Queued[] = [];
  private readonly listeners = new Map<ServerMessageType, Set<AnyListener>>();
  private readonly statusListeners = new Set<(status: NetStatus) => void>();
  private token: string | null;
  /** Set by the welcome. */
  clientId: string | null = null;
  /** Round-trip time of the last ping (ms). */
  rtt: number | null = null;
  /** serverTime - local time (ms), from welcome and pongs. */
  clockOffset = 0;
  /** The error that stopped reconnecting (replaced, version or content mismatch). */
  fatal: { code: ErrorCode; message: string } | null = null;

  constructor(options: NetClientOptions) {
    this.options = options;
    this.timers = options.timers ?? defaultTimers;
    this.now = options.now ?? (() => Date.now());
    this.url = options.url ?? defaultServerUrl();
    this.token = readToken(options.storage);
  }

  get status(): NetStatus {
    return this.statusValue;
  }

  get serverUrl(): string {
    return this.url;
  }

  /** True once the server has welcomed this connection. */
  get ready(): boolean {
    return this.welcomed && this.statusValue === 'open';
  }

  /** Server time now, from the measured clock offset. */
  serverNow(): number {
    return this.now() + this.clockOffset;
  }

  on<K extends ServerMessageType>(type: K, listener: (message: ServerMessageOf<K>) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const wrapped = listener as AnyListener;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  onStatus(listener: (status: NetStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Point at another server (reconnects when connected). */
  setUrl(url: string): void {
    if (url === this.url) return;
    this.url = url;
    this.fatal = null;
    if (this.wanted) {
      this.dropSocket();
      this.open();
    }
  }

  connect(): void {
    this.wanted = true;
    this.fatal = null;
    if (this.socket || this.reconnectHandle !== null) return;
    this.open();
  }

  /** Close for good (no reconnect). Queued messages are dropped. */
  close(): void {
    this.wanted = false;
    this.queue = [];
    if (this.reconnectHandle !== null) this.timers.clearTimeout(this.reconnectHandle);
    this.reconnectHandle = null;
    this.dropSocket();
    this.setStatus('closed');
  }

  /** Send now when welcomed, else queue it for the next connection. Opens the connection if needed. */
  send(message: ClientMessage): void {
    if (this.ready && this.socket && this.socket.readyState === OPEN) {
      this.write(message);
      return;
    }
    this.queue.push({ message, at: this.now() });
    if (this.queue.length > QUEUE_LIMIT) this.queue.splice(0, this.queue.length - QUEUE_LIMIT);
    if (!this.wanted) this.connect();
  }

  private write(message: ClientMessage): void {
    try {
      this.socket?.send(JSON.stringify(message));
    } catch {
      // The close handler reconnects.
    }
  }

  private setStatus(status: NetStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }

  private emit(message: ServerMessage): void {
    const set = this.listeners.get(message.type);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(message);
      } catch (error) {
        console.error('[net] listener failed', error);
      }
    }
  }

  private open(): void {
    this.reconnectHandle = null;
    this.welcomed = false;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let socket: WebSocketLike;
    try {
      socket = (this.options.socket ?? defaultSocket)(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.lastHeard = this.now();
      const id = this.options.identity();
      const hello: ClientMessage = { type: 'hello', protocol: PROTOCOL_VERSION, name: id.name, engineVersion: id.engineVersion, contentHash: id.contentHash };
      if (this.token) hello.token = this.token;
      this.write(hello);
      this.startPings();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.lastHeard = this.now();
      const data = typeof event.data === 'string' ? event.data : String(event.data);
      const parsed = parseServerMessage(data);
      if (!parsed.ok) {
        console.warn(`[net] ignored a server message: ${parsed.message}`);
        return;
      }
      this.handle(parsed.message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.welcomed = false;
      this.stopPings();
      if (this.wanted && !this.fatal) this.scheduleReconnect();
      else this.setStatus('closed');
    };
    socket.onerror = () => {
      // A close event follows.
    };
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.welcomed = true;
        this.attempt = 0;
        this.clientId = message.clientId;
        this.token = message.token;
        writeToken(this.options.storage, message.token);
        this.clockOffset = message.serverTime - this.now();
        this.setStatus('open');
        this.emit(message);
        this.flush();
        this.sendPing();
        return;
      case 'pong': {
        const sent = message.id !== undefined ? this.pingsSent.get(message.id) : undefined;
        if (sent !== undefined && message.id !== undefined) {
          this.pingsSent.delete(message.id);
          this.rtt = this.now() - sent;
          this.clockOffset = message.serverTime + this.rtt / 2 - this.now();
        }
        this.emit(message);
        return;
      }
      case 'error':
        if (FATAL.has(message.code)) {
          this.fatal = { code: message.code, message: message.message };
          this.wanted = false;
        }
        this.emit(message);
        return;
      default:
        this.emit(message);
    }
  }

  private flush(): void {
    const now = this.now();
    const queued = this.queue.filter((q) => !(q.message.type === 'action' && now - q.at > STALE_ACTION_MS));
    this.queue = [];
    for (const q of queued) this.write(q.message);
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    const { baseMs, maxMs } = this.options.backoff ?? { baseMs: 500, maxMs: 8000 };
    const delay = Math.min(maxMs, baseMs * 2 ** Math.min(this.attempt, 8));
    const jittered = Math.round(delay * (0.8 + Math.random() * 0.4));
    this.attempt += 1;
    if (this.reconnectHandle !== null) this.timers.clearTimeout(this.reconnectHandle);
    this.reconnectHandle = this.timers.setTimeout(() => this.open(), jittered);
  }

  private dropSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.welcomed = false;
    this.stopPings();
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close(1000, 'bye');
    } catch {
      // Already closed.
    }
  }

  private startPings(): void {
    this.stopPings();
    const every = this.options.pingMs ?? 20_000;
    const beat = (): void => {
      this.pingHandle = this.timers.setTimeout(beat, every);
      if (!this.socket) return;
      if (this.now() - this.lastHeard > every * 2.5) {
        // Silent for too long: recycle the socket (the close handler reconnects).
        const stale = this.socket;
        this.socket = null;
        this.welcomed = false;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onclose = null;
        try {
          stale.close(4001, 'timeout');
        } catch {
          // ignore
        }
        this.stopPings();
        if (this.wanted) this.scheduleReconnect();
        return;
      }
      this.sendPing();
    };
    this.pingHandle = this.timers.setTimeout(beat, every);
  }

  /** A ping measures the round trip and the server clock offset. */
  private sendPing(): void {
    this.pingId += 1;
    this.pingsSent.set(this.pingId, this.now());
    if (this.pingsSent.size > 8) this.pingsSent.delete(this.pingsSent.keys().next().value as number);
    this.write({ type: 'ping', id: this.pingId });
  }

  private stopPings(): void {
    if (this.pingHandle !== null) this.timers.clearTimeout(this.pingHandle);
    this.pingHandle = null;
  }
}

/**
 * How the controller reaches the rules: a `GameTransport`. `LocalTransport` runs the engine in
 * this tab (solo, hot-seat, demo); an online `NetTransport` (src/net) sends actions to the
 * server and receives `viewFor` states with their events. The controller never cares which.
 */
import { applyAction } from '../engine';
import type { Action, GameEvent, GameState, ReasonCode, ReasonParams } from '../engine/types';

export type SendResult = { ok: true } | { ok: false; reason: ReasonCode; params?: ReasonParams };

export interface TransportUpdate {
  /** The new authoritative state (online: this seat's `viewFor`). */
  state: GameState;
  /** Events to animate, in order. */
  events: GameEvent[];
  /** The action that produced the update; null for a resync or a server-paced step. */
  action: Action | null;
}

export interface TransportRejection {
  action: Action;
  reason: ReasonCode;
  params?: ReasonParams;
}

export interface GameTransport {
  /**
   * Local transports run automated phases (`advance`) and bot seats on this client; online the
   * server paces both, so the controller only plays back what arrives.
   */
  readonly runsAutomation: boolean;
  /** Seats whose human decisions this client makes (hot-seat: every local human seat). */
  controlledSeats(state: GameState): number[];
  getState(): GameState;
  /**
   * Local: applies at once and reports the validation result. Online: `{ ok: true }` means
   * "sent"; a server refusal arrives through `onReject`.
   */
  send(action: Action): SendResult;
  onUpdate(listener: (update: TransportUpdate) => void): () => void;
  onReject(listener: (rejection: TransportRejection) => void): () => void;
  dispose(): void;
}

type Listener<T> = (value: T) => void;

/** A tiny listener set shared by transports. */
export class Emitter<T> {
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

  clear(): void {
    this.listeners.clear();
  }
}

export interface LocalTransportOptions {
  /** Seats the local player(s) control; defaults to every human seat (hot-seat). */
  controlledSeats?: readonly number[];
}

/** The engine in this tab: `send` is `applyAction`, updates are synchronous. */
export class LocalTransport implements GameTransport {
  readonly runsAutomation = true;
  private state: GameState;
  private readonly seats: readonly number[] | null;
  private readonly updates = new Emitter<TransportUpdate>();
  private readonly rejections = new Emitter<TransportRejection>();

  constructor(initial: GameState, opts: LocalTransportOptions = {}) {
    this.state = initial;
    this.seats = opts.controlledSeats ?? null;
  }

  controlledSeats(state: GameState): number[] {
    if (this.seats) return [...this.seats];
    return state.players.filter((p) => p.kind === 'human' && !p.remote).map((p) => p.seat);
  }

  getState(): GameState {
    return this.state;
  }

  send(action: Action): SendResult {
    const result = applyAction(this.state, action);
    if (!result.ok) return { ok: false, reason: result.reason, params: result.params };
    this.state = result.state;
    this.updates.emit({ state: result.state, events: result.events, action });
    return { ok: true };
  }

  /** Replace the whole state (a loaded save, a Retry snapshot, a crafted test position). */
  load(state: GameState): void {
    this.state = state;
    this.updates.emit({ state, events: [], action: null });
  }

  onUpdate(listener: (update: TransportUpdate) => void): () => void {
    return this.updates.on(listener);
  }

  onReject(listener: (rejection: TransportRejection) => void): () => void {
    return this.rejections.on(listener);
  }

  dispose(): void {
    this.updates.clear();
    this.rejections.clear();
  }
}

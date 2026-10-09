/**
 * The authoritative game of one room (GDD Appendix B.4): the engine state, the action log that
 * rebuilds it, and what each seat may see of it.
 *
 * - Seed secrecy (B.3): the engine seed is `seed + "\u0000" + salt`. Views carry no seed until
 *   game over, when the salt is revealed.
 * - Seat control: who plays a seat (a client or a bot) is mirrored into the engine's
 *   `players[seat].kind`, so the engine's AI-ally ordering, auto-ready and votes follow it. Every
 *   change is a `control` entry in the log, so a replay rebuilds exactly the same state.
 */
import { applyAction, viewFor } from '../src/engine';
import type { Action, ApplyResult, GameConfig, GameEvent, GameState, ReasonCode, ReasonParams, SeatKind } from '../src/engine/types';
import { createGame } from '../src/engine';
import { baseDuration } from '../src/game/timing';

/** One entry of the persisted action log. `t` is ms since the game was created. */
export type LogEntry =
  | { k: 'a'; t: number; a: Action }
  /** Seat control changed (a bot stood in, a player took the seat back). */
  | { k: 'c'; t: number; seat: number; kind: SeatKind };

export type ApplyOutcome = { ok: true; events: GameEvent[] } | { ok: false; reason: ReasonCode; params?: ReasonParams };

/** The engine seed for a public seed and a secret salt (B.3). */
export function saltedSeed(seed: string, salt: string): string {
  return `${seed}\u0000${salt}`;
}

/** Engine automation is capped at 6 s of playback per automated phase (B.4). */
export const MAX_PLAYBACK_MS = 6000;

/** The 1× playback time of a batch of events (the server's pacing budget), capped at 6 s. */
export function playbackBudget(events: readonly GameEvent[]): number {
  let total = 0;
  for (const event of events) total += baseDuration(event);
  return Math.min(MAX_PLAYBACK_MS, total);
}

/** Seat −1 sees what a watcher may: no hands in Last Flame. */
export const WATCHER_SEAT = -1;

export class AuthoritativeGame {
  readonly config: GameConfig;
  readonly salt: string;
  private current: GameState;
  private readonly entries: LogEntry[] = [];
  private readonly clock: () => number;
  private readonly createdAt: number;

  /** `config.seed` is the public seed; the engine sees it salted. */
  constructor(config: GameConfig, salt: string, clock: () => number = Date.now) {
    this.config = config;
    this.salt = salt;
    this.clock = clock;
    this.createdAt = clock();
    this.current = createGame({ ...config, seed: saltedSeed(config.seed, salt) });
  }

  /**
   * Rebuild a game from its log (server restart). Entries that no longer apply (an engine change)
   * stop the replay; the state up to there is kept and `dropped` counts the rest.
   */
  static replay(config: GameConfig, salt: string, log: readonly LogEntry[], clock: () => number = Date.now): { game: AuthoritativeGame; dropped: number } {
    const game = new AuthoritativeGame(config, salt, clock);
    for (let i = 0; i < log.length; i++) {
      const entry = log[i];
      const before = game.entries.length;
      if (entry.k === 'a') {
        if (!game.apply(entry.a).ok) return { game, dropped: log.length - i };
      } else {
        game.setSeatKind(entry.seat, entry.kind);
      }
      // Keep the original timestamps.
      if (game.entries.length > before) game.entries[game.entries.length - 1].t = entry.t;
    }
    return { game, dropped: 0 };
  }

  get state(): GameState {
    return this.current;
  }

  get log(): readonly LogEntry[] {
    return this.entries;
  }

  get over(): boolean {
    return this.current.result !== null;
  }

  private stamp(): number {
    return Math.max(0, this.clock() - this.createdAt);
  }

  /** Validate and apply; on success the action joins the log. Never throws. */
  apply(action: Action): ApplyOutcome {
    let result: ApplyResult;
    try {
      result = applyAction(this.current, action);
    } catch (error) {
      // An engine bug must not take the room (or the server) down: refuse the action instead.
      console.error(`[ww] engine threw on ${action.type}:`, error);
      return { ok: false, reason: 'INVALID_ACTION' };
    }
    if (!result.ok) return { ok: false, reason: result.reason, params: result.params };
    this.current = result.state;
    this.entries.push({ k: 'a', t: this.stamp(), a: action });
    return { ok: true, events: result.events };
  }

  /** Mirror seat control into the engine (logged). False when nothing changed. */
  setSeatKind(seat: number, kind: SeatKind): boolean {
    const player = this.current.players[seat];
    if (!player || player.kind === kind) return false;
    const players = this.current.players.map((p) => (p.seat === seat ? { ...p, kind } : p));
    this.current = { ...this.current, players };
    this.entries.push({ k: 'c', t: this.stamp(), seat, kind });
    return true;
  }

  /**
   * What `seat` may see (WATCHER_SEAT for people without a seat): `viewFor` plus the seed
   * removed until game over. The engine's `config` object is shared between states, so it is
   * replaced, never mutated.
   */
  viewFor(seat: number): GameState {
    const view = viewFor(this.current, seat);
    const seed = this.over ? saltedSeed(this.config.seed, this.salt) : '';
    view.seed = seed;
    view.config = { ...view.config, seed: this.over ? this.config.seed : '' };
    return view;
  }
}

/**
 * Events as `seat` may see them (B.4): in Last Flame rivals' drawn cards become a count and the
 * Chandlery offers of other seats are dropped. Vigil hands are shared information.
 */
export function eventsFor(events: readonly GameEvent[], seat: number, mode: GameConfig['mode']): GameEvent[] {
  if (mode !== 'last_flame') return events.slice();
  return events.map((event): GameEvent => {
    switch (event.type) {
      case 'cards_drawn':
        return event.seat === seat ? event : { ...event, cards: [] };
      case 'chandlery_opened':
        return { ...event, offers: event.offers.filter((offer) => offer.seat === seat) };
      default:
        return event;
    }
  });
}

/**
 * Runs a room's game on the server (GDD §11.3-11.4, Appendix B.4): it paces the automated
 * phases, plays the bot seats one action at a time, and keeps the decision timers.
 *
 * Pacing: every applied action extends `busyUntil` by its 1× playback budget (capped at 6 s), so
 * the next automated step or bot action waits until clients have animated what came before.
 * Human actions are never delayed. Timers start once that playback is over, plus 1.5 s latency.
 *
 * Bots are planned in-process with `planBotTurn` / `botChoice`; each action is its own timer
 * callback, so the event loop stays free for other rooms between bot actions.
 */
import { activeSeats, botChoice, getContent, pendingAutomation, planBotTurn, voteStatus } from '../src/engine';
import type { Action, BotLevel, GameEvent, GameState, PhaseId } from '../src/engine/types';
import { BOT_ACTION_GAP_MS, PHASE_GAP_MS } from '../src/game/timing';
import type { TimerKind } from '../src/net/protocol';
import { playbackBudget, type ApplyOutcome, type AuthoritativeGame } from './game';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Who sent an applied action: a client, a bot seat, server automation, or a timer default. */
export type ActionOrigin = 'human' | 'bot' | 'auto' | 'timer';

export interface TimerInfo {
  seat: number | null;
  phase: PhaseId;
  kind: TimerKind;
  /** Server ms. */
  deadline: number;
}

export interface DriverHost {
  /** The bot level playing `seat` now, or null when a client controls it. */
  botLevel(seat: number): BotLevel | null;
  /** After every applied action (the game state already holds the result). */
  applied(action: Action, events: GameEvent[], origin: ActionOrigin): void;
  timerChanged(timer: TimerInfo | null): void;
  /** Timer off: these human seats sat 180 s without input, so the disconnect rule applies. */
  idle(seats: number[]): void;
  log(line: string): void;
}

export interface DriverOptions {
  clock?: Clock;
  /** Scales playback budgets and gaps: 1 = the 1× animation time, 0 = no pacing (tests). */
  paceScale?: number;
  /** Scales decision timers (tests shorten them). */
  timerScale?: number;
}

type Step = { kind: 'advance' } | { kind: 'turn'; seat: number } | { kind: 'choice'; seat: number } | { kind: 'claim'; seat: number };

interface Decision {
  key: string;
  /** night:round:phase; a timer default only acts within it. */
  scope: string;
  info: TimerInfo;
  seconds: number;
  handle: unknown;
}

interface VoteTimer {
  key: string;
  handle: unknown;
}

const MAX_PLAN_ACTIONS = 200;
const MAX_FORCED_ACTIONS = 32;

function scopeOf(s: GameState): string {
  return `${s.night}:${s.round}:${s.phase}`;
}

export class GameDriver {
  private readonly game: AuthoritativeGame;
  private readonly host: DriverHost;
  private readonly clock: Clock;
  private readonly paceScale: number;
  private readonly timerScale: number;

  private busyUntil = 0;
  private stepHandle: unknown = null;
  private decision: Decision | null = null;
  private vote: VoteTimer | null = null;
  private plan: { seat: number; actions: Action[]; stamp: number } | null = null;
  /** Log length at which an automated step failed: no retry until the state changes. */
  private stuckStamp = -1;
  private paused = false;
  private stopped = true;

  constructor(game: AuthoritativeGame, host: DriverHost, opts: DriverOptions = {}) {
    this.game = game;
    this.host = host;
    this.clock = opts.clock ?? realClock;
    this.paceScale = Math.max(0, opts.paceScale ?? 1);
    this.timerScale = Math.max(0, opts.timerScale ?? 1);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** The current decision timer, for clients that (re)join mid-decision. */
  get timer(): TimerInfo | null {
    return this.decision?.info ?? null;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.busyUntil = this.clock.now();
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    this.clearAll();
  }

  /** Nobody is connected: freeze bots, automation and timers. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearAll();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.busyUntil = Math.max(this.busyUntil, this.clock.now());
    this.schedule();
  }

  /** Seat control changed outside an action: re-evaluate what runs next. */
  poke(): void {
    this.schedule();
  }

  /** A client acted for `seat`; with the turn timer off this restarts its 180 s idle clock. */
  noteInput(seat: number): void {
    const d = this.decision;
    if (!d || d.info.kind !== 'idle' || this.paused || this.stopped) return;
    const seats = this.humanDecisionSeats(this.game.state);
    if (!seats.includes(seat)) return;
    this.arm({ ...d, info: { ...d.info, deadline: this.clock.now() + d.seconds * 1000 * this.timerScale } });
  }

  /** A client's action (after the room checked that the sender controls the seat). */
  submit(action: Action): ApplyOutcome {
    return this.applyNow(action, 'human');
  }

  // ===========================================================================================

  private clearAll(): void {
    if (this.stepHandle !== null) this.clock.clearTimeout(this.stepHandle);
    this.stepHandle = null;
    if (this.vote) this.clock.clearTimeout(this.vote.handle);
    this.vote = null;
    if (this.decision) {
      this.clock.clearTimeout(this.decision.handle);
      this.decision = null;
      this.host.timerChanged(null);
    }
    this.plan = null;
  }

  private isBot(seat: number): boolean {
    return this.host.botLevel(seat) !== null;
  }

  private applyNow(action: Action, origin: ActionOrigin): ApplyOutcome {
    const result = this.game.apply(action);
    if (!result.ok) return result;
    const now = this.clock.now();
    this.busyUntil = Math.max(now, this.busyUntil) + playbackBudget(result.events) * this.paceScale;
    this.host.applied(action, result.events, origin);
    this.schedule();
    return result;
  }

  private schedule(): void {
    if (this.stopped || this.paused) return;
    this.syncVoteTimer();
    this.syncDecision();
    if (this.stepHandle !== null) this.clock.clearTimeout(this.stepHandle);
    this.stepHandle = null;
    const step = this.nextStep();
    if (!step) return;
    const now = this.clock.now();
    const gap = (step.kind === 'advance' ? PHASE_GAP_MS : BOT_ACTION_GAP_MS) * this.paceScale;
    const at = Math.max(now, this.busyUntil) + gap;
    this.stepHandle = this.clock.setTimeout(() => {
      this.stepHandle = null;
      this.runStep();
    }, Math.max(0, Math.round(at - now)));
  }

  private nextStep(): Step | null {
    const s = this.game.state;
    if (s.result || this.stuckStamp === this.game.log.length) return null;
    if (pendingAutomation(s)) return { kind: 'advance' };
    if (s.phase === 'players') {
      if (s.activeSeat !== null) return this.isBot(s.activeSeat) ? { kind: 'turn', seat: s.activeSeat } : null;
      // Vigil with nobody acting: AI allies go once every human has ended (the engine starts
      // them itself after an end_turn); if only bots are left, one of them claims.
      const pending = s.players.filter((p) => !p.turnEnded && !p.eliminated);
      if (s.config.mode === 'vigil' && pending.length > 0 && pending.every((p) => this.isBot(p.seat))) return { kind: 'claim', seat: pending[0].seat };
      return null;
    }
    const seat = activeSeats(s).find((q) => this.isBot(q));
    if (seat !== undefined) return { kind: 'choice', seat };
    const haunter = s.players.find((p) => p.haunt.pending && this.isBot(p.seat));
    return haunter ? { kind: 'choice', seat: haunter.seat } : null;
  }

  private runStep(): void {
    if (this.stopped || this.paused) return;
    const step = this.nextStep();
    if (!step) return;
    const s = this.game.state;
    let action: Action | null;
    switch (step.kind) {
      case 'advance':
        action = { type: 'advance' };
        break;
      case 'claim':
        action = { type: 'claim_turn', seat: step.seat };
        break;
      case 'choice':
        action = this.botDecision(s, step.seat);
        break;
      case 'turn':
        action = this.nextPlanned(s, step.seat);
        break;
    }
    if (!action) {
      this.stuck(`no decision for ${step.kind === 'advance' ? 'automation' : `seat ${step.seat + 1}`} in ${s.phase}`);
      return;
    }
    const result = this.applyNow(action, step.kind === 'advance' ? 'auto' : 'bot');
    if (result.ok) return;
    if (step.kind === 'turn') {
      // A planned action that is no longer legal ends the bot's turn (like the client's driver).
      this.plan = null;
      const ended = this.applyNow({ type: 'end_turn', seat: step.seat }, 'bot');
      if (!ended.ok) this.stuck(`bot seat ${step.seat + 1} cannot end its turn (${ended.reason})`);
      return;
    }
    this.stuck(`${action.type} refused (${result.reason})`);
  }

  private stuck(why: string): void {
    this.stuckStamp = this.game.log.length;
    this.host.log(`automation paused: ${why}`);
  }

  private levelOf(seat: number): BotLevel {
    return this.host.botLevel(seat) ?? 'bot_warden';
  }

  private nextPlanned(s: GameState, seat: number): Action {
    const stamp = this.game.log.length;
    if (!this.plan || this.plan.seat !== seat || this.plan.stamp !== stamp) {
      let actions: Action[] = [];
      try {
        actions = planBotTurn(s, seat, this.levelOf(seat)).slice(0, MAX_PLAN_ACTIONS);
      } catch (error) {
        this.host.log(`planBotTurn threw for seat ${seat + 1}: ${String(error)}`);
      }
      this.plan = { seat, actions, stamp };
    }
    const next = this.plan.actions.shift() ?? { type: 'end_turn', seat };
    // Applying it adds one log entry; the plan stays valid unless something else happens.
    this.plan.stamp = stamp + 1;
    return next;
  }

  /** A non-turn decision (ready, Toll, carry-over, draft, Boon, haunt) for a bot seat or a timeout. */
  private botDecision(s: GameState, seat: number): Action | null {
    try {
      const choice = botChoice(s, seat);
      if (choice) return choice;
    } catch (error) {
      this.host.log(`botChoice threw for seat ${seat + 1}: ${String(error)}`);
    }
    const player = s.players[seat];
    if (player?.haunt.pending) return { type: 'haunt', seat, at: null };
    if (s.phase === 'night_setup' && player && !player.ready) return { type: 'ready', seat };
    return null;
  }

  // ===========================================================================================
  // Decision timers (§11.4)
  // ===========================================================================================

  /** Human seats that owe a decision right now. */
  private humanDecisionSeats(s: GameState): number[] {
    if (s.result) return [];
    const human = (seat: number): boolean => !this.isBot(seat);
    if (s.phase === 'players') {
      if (s.config.mode === 'vigil') return s.players.filter((p) => !p.turnEnded && !p.eliminated && human(p.seat)).map((p) => p.seat);
      return s.activeSeat !== null && human(s.activeSeat) ? [s.activeSeat] : [];
    }
    const seats = activeSeats(s).filter(human);
    for (const p of s.players) if (p.haunt.pending && human(p.seat) && !seats.includes(p.seat)) seats.push(p.seat);
    return seats;
  }

  /** Seats the idle rule applies to: whoever could act now (not a Vigil seat waiting for another). */
  private idleSeats(s: GameState): number[] {
    const seats = this.humanDecisionSeats(s);
    if (s.phase === 'players' && s.activeSeat !== null) return seats.includes(s.activeSeat) ? [s.activeSeat] : [];
    return seats;
  }

  private decisionFor(s: GameState): Omit<Decision, 'handle' | 'info'> & { kind: TimerKind; seat: number | null } | null {
    const seats = this.humanDecisionSeats(s);
    if (seats.length === 0) return null;
    const timers = getContent().rules.timers;
    const scope = scopeOf(s);
    const single = seats.length === 1 ? seats[0] : null;
    const setting = s.config.turn_timer;
    if (setting === 'off') {
      return { key: `idle:${scope}:${s.activeSeat}:${seats.join(',')}`, scope, kind: 'idle', seat: single, seconds: timers.idleDisconnect };
    }
    const turn = timers.turn[setting];
    switch (s.phase) {
      case 'players':
        if (s.config.mode === 'vigil') {
          const living = s.players.filter((p) => !p.eliminated).length;
          return { key: `phase:${scope}`, scope, kind: 'phase', seat: null, seconds: turn * living };
        }
        return { key: `turn:${scope}:${s.activeSeat}`, scope, kind: 'turn', seat: s.activeSeat, seconds: turn };
      case 'night_setup':
        return { key: `deploy:${scope}`, scope, kind: 'deploy', seat: single, seconds: timers.deploy };
      case 'toll':
        return { key: `toll:${scope}`, scope, kind: 'toll', seat: single, seconds: timers.toll };
      case 'dawn':
        return { key: `carry:${scope}`, scope, kind: 'carry_over', seat: single, seconds: timers.carryOver };
      case 'chandlery':
        return { key: `chandlery:${scope}`, scope, kind: 'chandlery', seat: single, seconds: timers.chandlery };
      default:
        return { key: `haunt:${scope}:${seats.join(',')}`, scope, kind: 'haunt', seat: single, seconds: timers.haunt };
    }
  }

  private syncDecision(): void {
    const s = this.game.state;
    const next = this.decisionFor(s);
    if (!next) {
      if (this.decision) {
        this.clock.clearTimeout(this.decision.handle);
        this.decision = null;
        this.host.timerChanged(null);
      }
      return;
    }
    if (this.decision?.key === next.key) return;
    if (this.decision) this.clock.clearTimeout(this.decision.handle);
    const latency = getContent().rules.timers.latencyGrace * 1000;
    const start = Math.max(this.clock.now(), this.busyUntil) + latency * this.timerScale;
    const info: TimerInfo = { seat: next.seat, phase: s.phase, kind: next.kind, deadline: Math.round(start + next.seconds * 1000 * this.timerScale) };
    this.arm({ key: next.key, scope: next.scope, seconds: next.seconds, info, handle: null });
  }

  private arm(decision: Decision): void {
    if (this.decision) this.clock.clearTimeout(this.decision.handle);
    const delay = Math.max(0, decision.info.deadline - this.clock.now());
    const armed: Decision = { ...decision, handle: null };
    armed.handle = this.clock.setTimeout(() => this.expire(armed), delay);
    this.decision = armed;
    this.host.timerChanged(armed.info);
  }

  private expire(decision: Decision): void {
    if (this.decision !== decision || this.stopped || this.paused) return;
    this.decision = null;
    this.host.timerChanged(null);
    const s = this.game.state;
    if (decision.info.kind === 'idle') {
      const seats = this.idleSeats(s);
      this.host.log(`no input for ${decision.seconds} s from seat(s) ${seats.map((q) => q + 1).join(', ')}`);
      if (seats.length > 0) this.host.idle(seats);
      this.schedule();
      return;
    }
    this.host.log(`${decision.info.kind} timer ran out`);
    for (let i = 0; i < MAX_FORCED_ACTIONS; i++) {
      const action = this.timeoutDefault(this.game.state, decision);
      if (!action || !this.applyNow(action, 'timer').ok) break;
    }
    this.schedule();
  }

  /**
   * The default for an expired decision (§11.4): end the turn (Vigil: every seat still to act),
   * keep deploy tiles (Ready), take the Blessing, keep default units, the Apprentice's draft
   * pick, skip the haunt.
   */
  private timeoutDefault(s: GameState, decision: Decision): Action | null {
    if (s.result || scopeOf(s) !== decision.scope) return null;
    if (s.phase === 'players') {
      if (s.config.mode === 'vigil') {
        if (s.activeSeat !== null) return { type: 'end_turn', seat: s.activeSeat };
        const pending = s.players.find((p) => !p.turnEnded && !p.eliminated);
        return pending ? { type: 'claim_turn', seat: pending.seat } : null;
      }
      return s.activeSeat !== null && s.activeSeat === decision.info.seat && !this.isBot(s.activeSeat) ? { type: 'end_turn', seat: s.activeSeat } : null;
    }
    const seat = this.humanDecisionSeats(s)[0];
    if (seat === undefined) return null;
    const player = s.players[seat];
    if (player.haunt.pending) return { type: 'haunt', seat, at: null };
    if (s.phase === 'night_setup') return player.ready ? null : { type: 'ready', seat };
    return this.botDecision(s, seat);
  }

  /** Retry / Concede votes end after 30 s with a "no" (votes.ts). */
  private syncVoteTimer(): void {
    const s = this.game.state;
    const vigil = s.vigil;
    const kind = vigil && vigil.retryVotes.length > 0 ? 'retry' : vigil && vigil.concedeVotes.length > 0 ? 'concede' : null;
    if (!kind) {
      if (this.vote) this.clock.clearTimeout(this.vote.handle);
      this.vote = null;
      return;
    }
    const status = voteStatus(s, kind);
    const key = `${kind}:${status.votes.join(',')}`;
    if (this.vote?.key === key) return;
    if (this.vote) this.clock.clearTimeout(this.vote.handle);
    const seconds = getContent().rules.timers.retryVote;
    const vote: VoteTimer = { key, handle: null };
    vote.handle = this.clock.setTimeout(() => {
      if (this.vote !== vote) return;
      this.vote = null;
      const now = this.game.state;
      const live = voteStatus(now, kind);
      const seat = live.needed.find((q) => !live.votes.includes(q)) ?? live.needed[0];
      if (live.votes.length === 0 || seat === undefined) return;
      this.host.log(`${kind} vote timed out`);
      this.applyNow(kind === 'retry' ? { type: 'retry_night', seat, vote: false } : { type: 'concede', seat, vote: false }, 'timer');
    }, seconds * 1000 * this.timerScale);
    this.vote = vote;
  }
}

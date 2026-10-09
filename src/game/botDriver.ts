/**
 * Drives the bot seats of a local game (GDD §11.3, §12.5–12.6). For a bot's seat turn it asks
 * the `BotRunner` for the whole plan, then replays it one action at a time, each after the
 * previous one has animated, so bots read like a human playing. Non-turn decisions (ready,
 * Toll, carry-over, draft, Boon) come from `botChoice`. Answers that arrive after the state has
 * moved on are dropped and asked again.
 */
import { activeSeats, validateAction } from '../engine';
import type { Action, GameState } from '../engine/types';
import type { BotRunner } from './bots';
import { BOT_ACTION_GAP_MS, paceScale, type PlaybackSettings } from './timing';
import type { SendResult } from './transport';

/** What the driver needs from the controller. */
export interface BotHost {
  latest(): GameState;
  /** Increases on every state update (stale-answer check). */
  stamp(): number;
  send(action: Action): SendResult;
  /** Run `then` after `ms` (now when 0) and pump the controller afterwards. */
  wait(ms: number, then: () => void): void;
  pump(): void;
  settings(): PlaybackSettings;
}

interface BotPlan {
  seat: number;
  actions: Action[];
}

export function isBotSeat(state: GameState, seat: number): boolean {
  const player = state.players[seat];
  return player !== undefined && player.kind !== 'human';
}

export class BotDriver {
  /** The bot seat whose turn is being planned (its plaque shows the thinking wisp). */
  thinkingSeat: number | null = null;
  private plan: BotPlan | null = null;
  private pending = false;
  /** A choice came back empty or illegal at this stamp: don't ask again until the state changes. */
  private stuckStamp = -1;
  private stopped = false;
  private readonly host: BotHost;
  private readonly runner: BotRunner;

  constructor(host: BotHost, runner: BotRunner) {
    this.host = host;
    this.runner = runner;
  }

  /** Call when playback is idle and no automated phase is due. */
  drive(): void {
    const s = this.host.latest();
    if (s.result || this.stopped) return;
    if (s.phase === 'players') {
      if (s.activeSeat !== null && isBotSeat(s, s.activeSeat)) this.driveTurn(s.activeSeat);
      return;
    }
    const seat = activeSeats(s).find((q) => isBotSeat(s, q));
    if (seat !== undefined) this.requestChoice(seat);
  }

  hint(state: GameState, seat: number): Promise<Action | null> {
    return this.runner.hint(state, seat);
  }

  dispose(): void {
    this.stopped = true;
    this.runner.dispose();
  }

  private driveTurn(seat: number): void {
    if (this.plan?.seat === seat) {
      const gap = Math.round(BOT_ACTION_GAP_MS * paceScale('player', this.host.settings()));
      this.host.wait(gap, () => this.sendNext(seat));
      return;
    }
    const s = this.host.latest();
    const level = s.players[seat].kind;
    if (this.pending || level === 'human') return;
    const stamp = this.host.stamp();
    this.pending = true;
    this.thinkingSeat = seat;
    this.runner
      .planTurn(s, seat, level)
      .then((actions) => this.onPlan(stamp, { seat, actions: actions.slice() }))
      .catch((error: unknown) => {
        console.error('bot planning failed', error);
        this.onPlan(this.host.stamp(), { seat, actions: [{ type: 'end_turn', seat }] });
      });
  }

  private onPlan(stamp: number, plan: BotPlan): void {
    if (this.stopped) return;
    this.pending = false;
    this.thinkingSeat = null;
    if (stamp === this.host.stamp()) this.plan = plan;
    this.host.pump();
  }

  /** Play the plan's next action; anything illegal by now ends the turn instead. */
  private sendNext(seat: number): void {
    const plan = this.plan;
    const s = this.host.latest();
    if (!plan || plan.seat !== seat || s.activeSeat !== seat) {
      this.plan = null;
      return;
    }
    const endTurn: Action = { type: 'end_turn', seat };
    const next = plan.actions.shift();
    const action = next && validateAction(s, next).ok ? next : endTurn;
    if (action.type === 'end_turn') this.plan = null;
    if (this.host.send(action).ok || action.type === 'end_turn') return;
    this.plan = null;
    this.host.send(endTurn);
  }

  private requestChoice(seat: number): void {
    const stamp = this.host.stamp();
    if (this.pending || this.stuckStamp === stamp) return;
    this.pending = true;
    this.runner
      .choice(this.host.latest(), seat)
      .then((action) => {
        if (this.stopped) return;
        this.pending = false;
        if (stamp !== this.host.stamp()) {
          this.host.pump();
          return;
        }
        if (action && validateAction(this.host.latest(), action).ok && this.host.send(action).ok) return;
        this.stuckStamp = stamp;
        console.error(`bot seat ${seat} has no legal choice in ${this.host.latest().phase}`);
      })
      .catch((error: unknown) => {
        this.pending = false;
        this.stuckStamp = stamp;
        console.error('bot choice failed', error);
      });
  }
}

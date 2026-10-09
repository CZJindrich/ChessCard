/**
 * What the game screen shows about an online game (GDD §11.4, §11.6): who controls each seat
 * (this tab, another player, a bot or a stand-in), reconnecting badges with the time left, and
 * the decision timer. Pure functions over the online session's snapshot (src/net).
 */
import type { GameState } from '../../engine/types';
import type { OnlineTimer, SessionState, TimerKind } from '../../net';
import { clock } from '../screens/lobby/lobbyModel';

export type OnlineSeatRole = 'you' | 'player' | 'reconnecting' | 'stand_in' | 'bot';

export interface OnlineSeatInfo {
  seat: number;
  role: OnlineSeatRole;
  /** Short tag for the plaque ("You", "Online", "Reconnecting 1:42", "Stand-in"). */
  tag: string;
  /** Longer line for tooltips and screen readers. */
  detail: string;
}

/** Each seat's controller as this tab sees it, or an empty map outside a room. */
export function onlineSeats(session: SessionState, serverNow: number): Map<number, OnlineSeatInfo> {
  const out = new Map<number, OnlineSeatInfo>();
  const room = session.room;
  if (!room) return out;
  const you = session.game?.you ?? [];
  for (const seat of room.seats) {
    const holder = seat.occupantId ? room.members.find((m) => m.id === seat.occupantId) : undefined;
    if (you.includes(seat.seat)) {
      out.set(seat.seat, { seat: seat.seat, role: 'you', tag: 'You', detail: 'You play this seat' });
    } else if (seat.status === 'reconnecting') {
      const left = seat.graceEndsAt !== null ? clock(seat.graceEndsAt - serverNow) : null;
      out.set(seat.seat, {
        seat: seat.seat,
        role: 'reconnecting',
        tag: left ? `Reconnecting ${left}` : 'Reconnecting',
        detail: `${seat.name} lost the connection${left ? `; a Warden takes over in ${left}` : ''}`,
      });
    } else if (seat.status === 'bot' && holder) {
      out.set(seat.seat, { seat: seat.seat, role: 'stand_in', tag: 'Stand-in', detail: `A Warden stands in for ${holder.name} until they return` });
    } else if (seat.status === 'bot') {
      out.set(seat.seat, { seat: seat.seat, role: 'bot', tag: 'Bot', detail: 'A bot plays this seat' });
    } else {
      out.set(seat.seat, { seat: seat.seat, role: 'player', tag: 'Online', detail: `${seat.name} plays this seat from another device` });
    }
  }
  return out;
}

const TIMER_WORDS: Readonly<Record<TimerKind, string>> = {
  turn: 'Turn',
  phase: 'Turns',
  deploy: 'Deploy',
  toll: 'Toll',
  carry_over: 'Carry-over',
  chandlery: 'Chandlery',
  haunt: 'Haunt',
  idle: 'Idle',
  vote: 'Vote',
};

export interface TimerView {
  /** Remaining time, ms (never negative). */
  remaining: number;
  /** 0–1 of the wick left (1 when the start is unknown). */
  fraction: number;
  /** "Turn", "Chandlery", ... */
  label: string;
  /** "0:42". */
  text: string;
  /** The decision is this tab's to make (its seat, or a phase timer this tab takes part in). */
  mine: boolean;
  /** Whose timer it is when it is not this tab's ("Bob"), or null. */
  owner: string | null;
  /** The last 10 seconds (the wick sputters, a tick plays each second). */
  urgent: boolean;
}

export const URGENT_MS = 10_000;

/** The decision timer as the wick shows it at local time `now`; `startedAt` is when it was first seen. */
export function timerView(timer: OnlineTimer, now: number, startedAt: number, controlled: readonly number[], state: GameState): TimerView {
  const remaining = Math.max(0, timer.localDeadline - now);
  const total = Math.max(1, timer.localDeadline - startedAt);
  const mine = timer.seat === null ? controlled.length > 0 : controlled.includes(timer.seat);
  const owner = timer.seat !== null && !mine ? (state.players[timer.seat]?.name ?? null) : null;
  return {
    remaining,
    fraction: Math.min(1, remaining / total),
    label: TIMER_WORDS[timer.kind] ?? 'Timer',
    text: clock(remaining),
    mine,
    owner,
    urgent: remaining > 0 && remaining <= URGENT_MS,
  };
}

/** A stable key per armed timer (a new deadline is a new timer). */
export function timerKey(timer: OnlineTimer): string {
  return `${timer.kind}:${timer.seat ?? 'all'}:${timer.deadline}`;
}

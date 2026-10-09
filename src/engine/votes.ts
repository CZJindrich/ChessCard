/**
 * Vigil votes (GDD §13.1.7-13.1.8): Retry this Night and Concede. Solo acts at once; in co-op
 * every human seat must agree (AI allies always agree). A `vote: false` from any human declines
 * and clears the running vote, which is also how the server ends a vote whose 30 s ran out.
 *
 * Retry is available while `retry_night` is on and the run is not a Daily, during the Night
 * (boss intro to Tally) and from the defeat screen; it restores the night_setup snapshot.
 *
 * Last Flame has no votes: a human seat concedes alone and is eliminated at once
 * (modes/lastFlameEnd `concedeLastFlame`).
 */
import { addLog } from './log';
import { concedeLastFlame } from './modes/lastFlameEnd';
import { endVigil, restoreNightSnapshot } from './modes/vigil';
import { emit } from './state';
import type { Ctx } from './state';
import { fail, OK } from './validation';
import type { ActionOf, GameState, PhaseId, Validation, VigilState } from './types';

export type VoteKind = 'retry' | 'concede';

export interface VoteStatus {
  /** Human seats that agreed so far. */
  votes: number[];
  /** Human seats whose agreement is needed (AI allies always agree). */
  needed: number[];
}

const RETRY_PHASES: ReadonlySet<PhaseId> = new Set<PhaseId>(['boss_intro', 'toll', 'omen', 'snuff_move', 'players', 'snuff_strike', 'rise', 'tally']);

function humanSeats(s: GameState): number[] {
  return s.players.filter((p) => p.kind === 'human' && !p.eliminated).map((p) => p.seat);
}

function votesOf(vigil: VigilState, kind: VoteKind): number[] {
  return kind === 'retry' ? vigil.retryVotes : vigil.concedeVotes;
}

export function voteStatus(s: GameState, kind: VoteKind): VoteStatus {
  return { votes: s.vigil ? votesOf(s.vigil, kind).slice() : [], needed: humanSeats(s) };
}

/** Retry is possible right now (the defeat screen included). Works on views too. */
export function retryOpen(s: GameState): Validation {
  if (s.config.mode !== 'vigil' || !s.vigil) return fail('MODE_ONLY', { mode: 'Vigil' });
  if (!s.config.retry_night || s.config.daily) return fail('RETRY_DISABLED');
  if (s.result) return s.result.mode === 'vigil' && s.result.outcome === 'defeat' ? OK : fail('GAME_OVER');
  return RETRY_PHASES.has(s.phase) ? OK : fail('WRONG_PHASE');
}

function validateVote(s: GameState, kind: VoteKind, seat: number, vote: boolean | undefined): Validation {
  const player = s.players[seat];
  if (!player || player.kind !== 'human' || !s.vigil) return fail('INVALID_ACTION');
  const votes = votesOf(s.vigil, kind);
  if (vote === false) return votes.length > 0 ? OK : fail('INVALID_ACTION');
  return votes.includes(seat) ? fail('INVALID_ACTION') : OK;
}

export function validateRetry(s: GameState, a: ActionOf<'retry_night'>): Validation {
  const open = retryOpen(s);
  if (!open.ok) return open;
  return s.nightSnapshot ? validateVote(s, 'retry', a.seat, a.vote) : fail('WRONG_PHASE');
}

/** Last Flame: a human seat still in the game may concede at once (no vote). */
function validateLastFlameConcede(s: GameState, a: ActionOf<'concede'>): Validation {
  const player = s.players[a.seat];
  if (!player || player.kind !== 'human' || a.vote === false) return fail('INVALID_ACTION');
  return player.eliminated ? fail('ELIMINATED') : OK;
}

export function validateConcede(s: GameState, a: ActionOf<'concede'>): Validation {
  if (s.result) return fail('GAME_OVER');
  if (s.config.mode === 'last_flame' && s.lastFlame) return validateLastFlameConcede(s, a);
  if (s.config.mode !== 'vigil' || !s.vigil) return fail('MODE_ONLY', { mode: 'Vigil' });
  return validateVote(s, 'concede', a.seat, a.vote);
}

/** Record a vote; returns true when it became unanimous. */
function castVote(ctx: Ctx, kind: VoteKind, seat: number, vote: boolean | undefined): boolean {
  const vigil = ctx.s.vigil;
  if (!vigil) return false;
  const name = ctx.s.players[seat]?.name ?? 'A player';
  if (vote === false) {
    if (kind === 'retry') vigil.retryVotes = [];
    else vigil.concedeVotes = [];
    emit(ctx, { type: 'vote_changed', vote: kind, seats: [] });
    addLog(ctx, `${name} declines to ${kind === 'retry' ? 'retry the Night' : 'concede'}.`, seat);
    return false;
  }
  const votes = [...votesOf(vigil, kind), seat];
  if (kind === 'retry') vigil.retryVotes = votes;
  else vigil.concedeVotes = votes;
  emit(ctx, { type: 'vote_changed', vote: kind, seats: votes.slice() });
  return humanSeats(ctx.s).every((s) => votes.includes(s));
}

export function applyRetry(ctx: Ctx, a: ActionOf<'retry_night'>): void {
  if (castVote(ctx, 'retry', a.seat, a.vote)) restoreNightSnapshot(ctx);
}

export function applyConcede(ctx: Ctx, a: ActionOf<'concede'>): void {
  if (ctx.s.config.mode === 'last_flame') concedeLastFlame(ctx, a.seat);
  else if (castVote(ctx, 'concede', a.seat, a.vote)) endVigil(ctx, 'conceded', 'The Vigil was abandoned.');
}

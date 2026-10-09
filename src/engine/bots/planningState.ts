/**
 * The state a bot plans on (GDD §12.5): never the real state.
 *
 * - It starts from `viewFor(state, seat)`, so a bot sees exactly what its seat may see: deck
 *   orders are hidden, and in Last Flame rivals' hands, decks and drafts are masked (unknown
 *   rival cards stay unplayable `hidden` cards; their pieces still act and threaten).
 * - The future is sampled deterministically: every RNG stream of the planning state is reseeded
 *   from the seat's `bot:<seat>` stream position (read, never advanced), so the Moth Die, Plume
 *   tiles and draws a lookahead meets are guesses, the same guesses for the same state.
 * - History the planner never reads (log, per-piece stats, undo frames, the Retry snapshot) is
 *   dropped so each simulated action clones less.
 */
import { seatStream, seedFromString, standardStreamNames } from '../rng';
import { viewFor } from '../view';
import type { GameState, RngStreams } from '../types';

/** The seat's bot stream position, or a seed derived from the public game position (views have no RNG). */
export function botSeed(s: GameState, seat: number): number {
  const stream = s.rng[seatStream('bot', seat)];
  if (stream !== undefined) return stream;
  return seedFromString(`${s.seed}\u0000${s.night}:${s.round}:${s.phase}:${seat}`);
}

function sampledStreams(s: GameState, seat: number): RngStreams {
  const seed = botSeed(s, seat);
  const names = Object.keys(s.rng).length > 0 ? Object.keys(s.rng) : standardStreamNames(s.players.length);
  const out: RngStreams = {};
  for (const name of names) out[name] = seedFromString(`${seed}\u0000plan\u0000${name}`);
  return out;
}

export function planningState(s: GameState, seat: number): GameState {
  const plan = viewFor(s, seat);
  plan.rng = sampledStreams(s, seat);
  plan.log = [];
  plan.stats = { ...plan.stats, pieces: {} };
  plan.undo = { frames: [], depth: 0 };
  plan.nightSnapshot = null;
  return plan;
}

/**
 * Undo (GDD §6.10). Every undoable action of the acting seat pushes a frame holding the state
 * before it. `undo` restores the last frame. Frames live only for the current seat turn (cleared
 * at its start and end), so co-op undo never crosses another seat's committed action.
 *
 * Commit points: an action that revealed information or used randomness (card draws, shuffles,
 * Plume creation, any RNG stream advancing) clears every frame, so undo stops there. Undoing a
 * kill restores the state before it, which also takes back the Flourish strike it granted.
 */
import { checkTurn } from './actions';
import { addLog } from './log';
import { clearUndo, cloneState, emit } from './state';
import type { Ctx } from './state';
import { fail, OK } from './validation';
import type { Action, ActionOf, GameEvent, GameState, StateSnapshot, Validation } from './types';

const UNDOABLE: ReadonlySet<Action['type']> = new Set<Action['type']>(['move', 'strike', 'relight', 'light_shrine', 'play_card', 'use_power', 'free_action']);

const COMMIT_EVENTS: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>(['cards_drawn', 'deck_shuffled', 'plume_placed', 'night_started', 'player_eliminated']);

export function isUndoable(action: Action): boolean {
  return UNDOABLE.has(action.type);
}

/** The state minus its history containers (config and log are shared, never mutated). */
export function snapshotOf(s: GameState): StateSnapshot {
  const copy: Partial<GameState> = cloneState(s);
  delete copy.undo;
  delete copy.nightSnapshot;
  return copy as StateSnapshot;
}

function rngAdvanced(before: GameState, after: GameState): boolean {
  const keys = new Set([...Object.keys(before.rng), ...Object.keys(after.rng)]);
  for (const key of keys) if (before.rng[key] !== after.rng[key]) return true;
  return false;
}

/** Whether applying an action from `before` to `after` (with these events) was a commit point. */
export function isCommitPoint(before: GameState, after: GameState, events: readonly GameEvent[]): boolean {
  return events.some((e) => COMMIT_EVENTS.has(e.type)) || rngAdvanced(before, after);
}

/** After an undoable action: push a frame, or clear them all at a commit point. */
export function recordUndo(ctx: Ctx, before: GameState, action: Action, snapshot: StateSnapshot): void {
  const { s } = ctx;
  if (action.type === 'undo' || !('seat' in action)) return;
  if (s.phase !== 'players' || s.activeSeat !== action.seat || isCommitPoint(before, s, ctx.events)) {
    clearUndo(s);
    return;
  }
  const frames = [...s.undo.frames, { seat: action.seat, action, snapshot }];
  s.undo = { frames, depth: frames.length };
}

/** Can `seat` undo now? Works on views too (they keep `undo.depth`). */
export function canUndo(s: GameState, seat: number): boolean {
  return !s.result && s.phase === 'players' && s.activeSeat === seat && s.undo.depth > 0;
}

export function validateUndo(s: GameState, a: ActionOf<'undo'>): Validation {
  const turn = checkTurn(s, a.seat);
  if (!turn.ok) return turn;
  const last = s.undo.frames.at(-1);
  return last && last.seat === a.seat ? OK : fail('NO_UNDO');
}

/**
 * Restore the state before the last undoable action. Ids keep counting up (an undone summon's id
 * is never reused) and things other seats did meanwhile (turn claims, votes) are kept.
 */
export function applyUndo(ctx: Ctx, a: ActionOf<'undo'>): void {
  const current = ctx.s;
  const frame = current.undo.frames.at(-1);
  if (!frame) return;
  const { config: _config, log, ...rest } = frame.snapshot;
  const restored = JSON.parse(JSON.stringify(rest)) as Omit<StateSnapshot, 'config' | 'log'>;
  const frames = current.undo.frames.slice(0, -1);
  ctx.s = {
    ...restored,
    config: current.config,
    log: log.slice(),
    nightSnapshot: current.nightSnapshot,
    undo: { frames, depth: frames.length },
    nextId: current.nextId,
    claimQueue: current.claimQueue.slice(),
  };
  if (ctx.s.vigil && current.vigil) {
    ctx.s.vigil.retryVotes = current.vigil.retryVotes.slice();
    ctx.s.vigil.concedeVotes = current.vigil.concedeVotes.slice();
  }
  emit(ctx, { type: 'undone', seat: a.seat });
  addLog(ctx, `${ctx.s.players[a.seat]?.name ?? 'A player'} takes back a move.`, a.seat);
}

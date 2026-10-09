/**
 * Snuff Strike previews (GDD §6.8 step 7, §15.5): the End Turn preview and danger badges run the
 * SAME resolution code as the real `advance` on a cloned state.
 */
import { refreshBossWatch } from './bosses';
import { getContent } from './content';
import { runSnuffStrikeStep } from './phases';
import { dangerTiles, intentViews, refreshIntentTiles } from './snuff';
import { cloneState, makeCtx } from './state';
import type { ContentRegistry, DangerMap, GameEvent, GameState, IntentView, Pos } from './types';

/**
 * Resolve every locked intent on a clone. In the snuff_strike phase the result equals
 * `applyAction(state, { type: 'advance' })`; during the players phase it shows what ending the
 * phase now would do.
 */
export function previewSnuffStrike(s: GameState, reg: ContentRegistry = getContent()): { state: GameState; events: GameEvent[] } {
  const ctx = makeCtx(cloneState(s), reg);
  runSnuffStrikeStep(ctx);
  refreshBossWatch(ctx);
  refreshIntentTiles(ctx.s);
  return { state: ctx.s, events: ctx.events };
}

/** The intent queue in resolution order, with human-readable text (right rail, §15.4). */
export function intentQueue(s: GameState, reg: ContentRegistry = getContent()): IntentView[] {
  return intentViews(s, reg);
}

/** Tile key ("x,y") → incoming damage from the locked intents. */
export function dangerMap(s: GameState): DangerMap {
  return dangerTiles(s);
}

export interface MoveDanger {
  /** Damage the piece would take from the locked intents (after Ward). */
  damage: number;
  /** Ward would absorb a hit. */
  blockedByWard: boolean;
  /** The piece would fall (or be destroyed). */
  lethal: boolean;
}

/**
 * Danger badge of a move dot (§15.5): run the Snuff Strike preview with the piece standing on
 * `to` (Ward absorption, pushes and friendly fire included). Hot Wax and Chimneys are ignored.
 */
export function previewMoveDanger(s: GameState, pieceId: string, to: Pos, reg: ContentRegistry = getContent()): MoveDanger {
  const moved = cloneState(s);
  const piece = moved.pieces[pieceId];
  if (!piece) return { damage: 0, blockedByWard: false, lethal: false };
  piece.pos = { ...to };
  refreshIntentTiles(moved);
  const { events } = previewSnuffStrike(moved, reg);
  let damage = 0;
  let blockedByWard = false;
  let lethal = false;
  for (const e of events) {
    if (e.type === 'damage' && e.pieceId === pieceId && e.cause === 'intent') {
      damage += e.blockedByWard ? 0 : e.amount;
      blockedByWard ||= e.blockedByWard;
      lethal ||= e.lethal;
    }
  }
  return { damage, blockedByWard, lethal };
}

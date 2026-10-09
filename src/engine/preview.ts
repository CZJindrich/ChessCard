/**
 * Snuff Strike previews (GDD §6.8 step 7, §15.5): the End Turn preview and danger badges run the
 * SAME resolution code as the real `advance` on a cloned state.
 */
import { getContent } from './content';
import { runSnuffStrikeStep } from './phases';
import { dangerTiles, intentViews, refreshIntentTiles } from './snuff';
import { cloneState, makeCtx } from './state';
import type { ContentRegistry, DangerMap, GameEvent, GameState, IntentView } from './types';

/**
 * Resolve every locked intent on a clone. In the snuff_strike phase the result equals
 * `applyAction(state, { type: 'advance' })`; during the players phase it shows what ending the
 * phase now would do.
 */
export function previewSnuffStrike(s: GameState, reg: ContentRegistry = getContent()): { state: GameState; events: GameEvent[] } {
  const ctx = makeCtx(cloneState(s), reg);
  runSnuffStrikeStep(ctx);
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

/**
 * The reducer: `validateAction` and `applyAction` (ARCHITECTURE §3-4). `applyAction` never
 * mutates its input: it clones the state, applies the action through a Ctx and returns the new
 * state with the events to animate, in order. Undoable player actions record an undo frame
 * (undo.ts); `undo` and `retry_night` replace the whole state.
 */
import {
  applyFreeAction,
  applyLightShrine,
  applyMove,
  applyRelight,
  applyStrike,
  validateFreeAction,
  validateLightShrine,
  validateMove,
  validateRelight,
  validateStrike,
} from './actions';
import { refreshBossWatch } from './bosses';
import { applyPlayCard, validatePlayCard } from './cards';
import {
  applyBoonPick,
  applyCarryOver,
  applyChooseToll,
  applyClaimTurn,
  applyDeploy,
  applyDraftPick,
  applyEndTurn,
  applyReady,
  applySkipPick,
  validateBoonPick,
  validateCarryOver,
  validateChooseToll,
  validateClaimTurn,
  validateDeploy,
  validateDraftPick,
  validateEndTurn,
  validateReady,
  validateSkipPick,
} from './choices';
import { getContent } from './content';
import { advance, pendingAutomation } from './phases';
import { applyUsePower, validateUsePower } from './powers';
import { refreshIntentTiles } from './snuff';
import { cloneState, makeCtx } from './state';
import type { Ctx } from './state';
import { applyUndo, isUndoable, recordUndo, snapshotOf, validateUndo } from './undo';
import { fail, OK } from './validation';
import { applyConcede, applyRetry, validateConcede, validateRetry } from './votes';
import type { Action, ApplyResult, ContentRegistry, GameState, Validation } from './types';

/** Is the action legal now? Returns a reason code (§15.6) when not. */
export function validateAction(s: GameState, action: Action, reg: ContentRegistry = getContent()): Validation {
  if (action.type === 'advance') return !s.result && pendingAutomation(s) ? OK : fail(s.result ? 'GAME_OVER' : 'WRONG_PHASE');
  if (!Number.isInteger(action.seat) || !s.players[action.seat]) return fail('INVALID_ACTION');
  // Retry this Night is offered on the defeat screen too.
  if (action.type === 'retry_night') return validateRetry(s, action);
  if (s.result) return fail('GAME_OVER');
  switch (action.type) {
    case 'move':
      return validateMove(s, reg, action);
    case 'strike':
      return validateStrike(s, reg, action);
    case 'relight':
      return validateRelight(s, action);
    case 'light_shrine':
      return validateLightShrine(s, action);
    case 'free_action':
      return validateFreeAction(s, reg, action);
    case 'play_card':
      return validatePlayCard(s, reg, action);
    case 'use_power':
      return validateUsePower(s, reg, action);
    case 'undo':
      return validateUndo(s, action);
    case 'end_turn':
      return validateEndTurn(s, action);
    case 'claim_turn':
      return validateClaimTurn(s, action);
    case 'concede':
      return validateConcede(s, action);
    case 'deploy':
      return validateDeploy(s, action);
    case 'ready':
      return validateReady(s, action);
    case 'choose_toll':
      return validateChooseToll(s, action);
    case 'carry_over':
      return validateCarryOver(s, reg, action);
    case 'draft_pick':
      return validateDraftPick(s, action);
    case 'skip_pick':
      return validateSkipPick(s, action);
    case 'boon_pick':
      return validateBoonPick(s, reg, action);
    case 'haunt':
      return fail('NOT_ENABLED', { feature: 'Haunting' });
    case 'config_set':
    case 'start_game':
      return fail('WRONG_PHASE');
  }
}

function dispatch(ctx: Ctx, action: Action): void {
  switch (action.type) {
    case 'advance':
      return advance(ctx);
    case 'move':
      return applyMove(ctx, action);
    case 'strike':
      return applyStrike(ctx, action);
    case 'relight':
      return applyRelight(ctx, action);
    case 'light_shrine':
      return applyLightShrine(ctx, action);
    case 'free_action':
      return applyFreeAction(ctx, action);
    case 'play_card':
      return applyPlayCard(ctx, action);
    case 'use_power':
      return applyUsePower(ctx, action);
    case 'undo':
      return applyUndo(ctx, action);
    case 'retry_night':
      return applyRetry(ctx, action);
    case 'end_turn':
      return applyEndTurn(ctx, action);
    case 'claim_turn':
      return applyClaimTurn(ctx, action);
    case 'concede':
      return applyConcede(ctx, action);
    case 'deploy':
      return applyDeploy(ctx, action);
    case 'ready':
      return applyReady(ctx, action);
    case 'choose_toll':
      return applyChooseToll(ctx, action);
    case 'carry_over':
      return applyCarryOver(ctx, action);
    case 'draft_pick':
      return applyDraftPick(ctx, action);
    case 'skip_pick':
      return applySkipPick(ctx, action);
    case 'boon_pick':
      return applyBoonPick(ctx, action);
    case 'haunt':
    case 'config_set':
    case 'start_game':
      return;
  }
}

/** Validate, then apply to a clone. The input state is never mutated. */
export function applyAction(s: GameState, action: Action, reg: ContentRegistry = getContent()): ApplyResult {
  const validation = validateAction(s, action, reg);
  if (!validation.ok) return validation;
  const ctx = makeCtx(cloneState(s), reg);
  const snapshot = isUndoable(action) ? snapshotOf(s) : null;
  dispatch(ctx, action);
  refreshBossWatch(ctx);
  if (snapshot) recordUndo(ctx, s, action, snapshot);
  refreshIntentTiles(ctx.s);
  return { ok: true, state: ctx.s, events: ctx.events };
}

/**
 * The reducer: `validateAction` and `applyAction` (ARCHITECTURE §3-4). `applyAction` never
 * mutates its input: it clones the state, applies the action through a Ctx and returns the new
 * state with the events to animate, in order.
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
import { applyPlayCard, validatePlayCard } from './cards';
import {
  applyBoonPick,
  applyCarryOver,
  applyChooseToll,
  applyClaimTurn,
  applyConcede,
  applyDeploy,
  applyDraftPick,
  applyEndTurn,
  applyReady,
  applySkipPick,
  validateBoonPick,
  validateCarryOver,
  validateChooseToll,
  validateClaimTurn,
  validateConcede,
  validateDeploy,
  validateDraftPick,
  validateEndTurn,
  validateReady,
  validateSkipPick,
} from './choices';
import { getContent } from './content';
import { advance, pendingAutomation } from './phases';
import { refreshIntentTiles } from './snuff';
import { cloneState, makeCtx } from './state';
import type { Ctx } from './state';
import { fail, OK } from './validation';
import type { Action, ApplyResult, ContentRegistry, GameState, Validation } from './types';

/** Is the action legal now? Returns a reason code (§15.6) when not. */
export function validateAction(s: GameState, action: Action, reg: ContentRegistry = getContent()): Validation {
  if (s.result) return fail('GAME_OVER');
  if (action.type === 'advance') return pendingAutomation(s) ? OK : fail('WRONG_PHASE');
  if (!Number.isInteger(action.seat) || !s.players[action.seat]) return fail('INVALID_ACTION');
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
    case 'undo':
      return fail('NO_UNDO');
    case 'use_power':
      return fail('NOT_ENABLED', { feature: 'Hero Powers' });
    case 'retry_night':
      return fail(s.config.retry_night && !s.config.daily ? 'NOT_ENABLED' : 'RETRY_DISABLED', { feature: 'Retry' });
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
      advance(ctx);
      return;
    case 'move':
      applyMove(ctx, action);
      return;
    case 'strike':
      applyStrike(ctx, action);
      return;
    case 'relight':
      applyRelight(ctx, action);
      return;
    case 'light_shrine':
      applyLightShrine(ctx, action);
      return;
    case 'free_action':
      applyFreeAction(ctx, action);
      return;
    case 'play_card':
      applyPlayCard(ctx, action);
      return;
    case 'end_turn':
      applyEndTurn(ctx, action);
      return;
    case 'claim_turn':
      applyClaimTurn(ctx, action);
      return;
    case 'concede':
      applyConcede(ctx, action);
      return;
    case 'deploy':
      applyDeploy(ctx, action);
      return;
    case 'ready':
      applyReady(ctx, action);
      return;
    case 'choose_toll':
      applyChooseToll(ctx, action);
      return;
    case 'carry_over':
      applyCarryOver(ctx, action);
      return;
    case 'draft_pick':
      applyDraftPick(ctx, action);
      return;
    case 'skip_pick':
      applySkipPick(ctx, action);
      return;
    case 'boon_pick':
      applyBoonPick(ctx, action);
      return;
    default:
      return;
  }
}

/** Validate, then apply to a clone. The input state is never mutated. */
export function applyAction(s: GameState, action: Action, reg: ContentRegistry = getContent()): ApplyResult {
  const validation = validateAction(s, action, reg);
  if (!validation.ok) return validation;
  const ctx = makeCtx(cloneState(s), reg);
  dispatch(ctx, action);
  refreshIntentTiles(ctx.s);
  return { ok: true, state: ctx.s, events: ctx.events };
}

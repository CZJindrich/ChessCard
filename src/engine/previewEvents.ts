/**
 * Card / Power previews (GDD §15.5 "Card selected"): a play is simulated on a clone and its
 * events are folded into an `EffectPreview` (damage numbers, heals, ghosted summons, swap lines,
 * moves, pushes, statuses, Charms, transformations, relights, deaths and area outlines).
 */
import { areaTiles, clipToBoard, posKey } from './geometry';
import type { EffectTarget } from './effects';
import { heroOf, tileAt } from './state';
import type { EffectOp, EffectPreview, GameEvent, GameState, Pos } from './types';

export function emptyPreview(): EffectPreview {
  return {
    damage: [],
    heal: [],
    plumesPopped: [],
    summon: null,
    swap: null,
    push: [],
    area: [],
    reversedIntentTiles: null,
    moves: [],
    statuses: [],
    charm: null,
    transforms: [],
    relit: [],
    deaths: [],
  };
}

type MovedEvent = Extract<GameEvent, { type: 'piece_moved' }>;

function addMove(preview: EffectPreview, e: MovedEvent, after: GameState | null): void {
  if (e.kind === 'push' || e.kind === 'pull') {
    const end = e.path?.at(-1);
    const endsOnHotWax = end !== undefined && after !== null && tileAt(after, end)?.type === 'hot_wax';
    preview.push.push({ pieceId: e.pieceId, path: e.path ?? [], bump: e.bump ?? null, endsOnHotWax });
    return;
  }
  if (e.kind === 'swap' && preview.swap === null) preview.swap = [{ ...e.from }, { ...e.to }];
  preview.moves?.push({ pieceId: e.pieceId, from: { ...e.from }, to: { ...e.to }, kind: e.kind });
}

/** Fold a simulated play's events (and the state after it, for Hot Wax checks) into a preview. */
export function previewFromEvents(events: readonly GameEvent[], after: GameState | null = null): EffectPreview {
  const preview = emptyPreview();
  for (const e of events) {
    switch (e.type) {
      case 'damage':
        preview.damage.push({ pieceId: e.pieceId, amount: e.amount, lethal: e.lethal, blockedByWard: e.blockedByWard });
        break;
      case 'heal':
        preview.heal.push({ pieceId: e.pieceId, amount: e.amount });
        break;
      case 'plume_popped':
        preview.plumesPopped.push(e.pos);
        break;
      case 'summoned':
        if (e.side === 'wick' && preview.summon === null) preview.summon = { defId: e.defId, pos: e.pos };
        break;
      case 'intent_reversed':
        preview.reversedIntentTiles = e.tiles;
        break;
      case 'piece_moved':
        addMove(preview, e, after);
        break;
      case 'status_changed':
        if (e.active) preview.statuses?.push({ pieceId: e.pieceId, status: e.status });
        break;
      case 'charm_changed':
        if (e.cardId !== null) preview.charm = { pieceId: e.pieceId, cardId: e.cardId };
        break;
      case 'transformed':
        preview.transforms?.push({ pieceId: e.pieceId, toDefId: e.toDefId });
        break;
      case 'hero_relit':
        preview.relit?.push(e.pieceId);
        break;
      case 'piece_died':
      case 'hero_smoldered':
        preview.deaths?.push(e.pieceId);
        break;
      case 'strike':
        if (e.tiles) preview.area.push(...e.tiles);
        break;
      default:
        break;
    }
  }
  return preview;
}

/** Area outlines of a play's `area` effects (Flare's 3×3, Lantern Oath's ring), plus traced lines. */
export function effectArea(s: GameState, seat: number, effects: readonly EffectOp[], targets: readonly EffectTarget[]): Pos[] {
  const hero = heroOf(s, seat);
  const out: Pos[] = [];
  for (const op of effects) {
    if (!op.area || (op.to !== 'area' && op.op !== 'create_tile' && op.op !== 'remove_plume')) continue;
    const at = op.at ?? 'target';
    const centre = at === 'target' ? targets[0] : at === 'target2' ? targets[1] : hero ? { pieceId: hero.id, pos: hero.pos } : undefined;
    if (!centre) continue;
    const size = at === 'hero' || at === 'self' ? (hero?.size ?? 1) : 1;
    out.push(...clipToBoard(areaTiles(op.area, centre.pos, { size }), s.board.w, s.board.h));
  }
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = posKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


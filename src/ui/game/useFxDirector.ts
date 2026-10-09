/**
 * Feeds the FX bus from playback (GDD §16.9): every event that starts playing is turned into
 * particles, bolts, flashes and shakes by `fxForStep`; a played card also flies from the hand
 * (or the bottom of the screen) to its first target, where its wax seal cracks.
 */
import { useEffect } from 'react';
import { CARD_TYPE_COLORS, PALETTE } from '../../art';
import type { CardTargetChoice, ContentRegistry, GameEvent, GameState, Pos } from '../../engine/types';
import type { PlaybackStep } from '../../game';
import { centreOf, fxForStep, type CardFlightSpec, type FxBus, type FxCommand } from '../fx';
import { rectCentre, type BoardLocatorRef } from './boardLocator';
import { useController, useRegistry } from './context';

function choiceTile(state: GameState, choice: CardTargetChoice | undefined): Pos | null {
  if (!choice) return null;
  if (choice.kind === 'piece') {
    const piece = state.pieces[choice.pieceId];
    return piece ? piece.pos : null;
  }
  return choice.kind === 'tile' ? choice.pos : null;
}

function handCardRect(uid: string): CardFlightSpec['from'] {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`.ww-hand-card[data-card-uid="${uid}"] .ww-hand-card__body`);
  const rect = el?.getBoundingClientRect();
  return rect && rect.width > 0 ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null;
}

/** The card flight and seal crack for a played card, in client px. */
function cardFlight(e: Extract<GameEvent, { type: 'card_played' }>, step: PlaybackStep, before: GameState, reg: ContentRegistry, locator: BoardLocatorRef): FxCommand[] {
  const board = locator.current;
  if (!board) return [];
  const tile = choiceTile(before, e.targets[0]);
  const target = tile ? board.tileRect(tile) : board.boardRect();
  if (!target) return [];
  const def = reg.cards.byId[e.cardId];
  const accent = def ? (CARD_TYPE_COLORS[def.type as keyof typeof CARD_TYPE_COLORS] ?? PALETTE.candleGold) : PALETTE.candleGold;
  const piece = e.targets[0]?.kind === 'piece' ? before.pieces[e.targets[0].pieceId] : undefined;
  const at = tile ? centreOf(tile, piece?.size ?? 1) : centreOf({ x: (before.board.w - 1) / 2, y: (before.board.h - 1) / 2 });
  const tempered = before.players[e.seat]?.hand.find((c) => c.uid === e.cardUid)?.tempered ?? false;
  return [
    { kind: 'card', flight: { cardId: e.cardId, tempered, from: handCardRect(e.cardUid), to: rectCentre(target), accent, duration: step.duration } },
    { kind: 'burst', burst: 'wax_chips', at, delay: step.duration },
  ];
}

function powerGlint(e: Extract<GameEvent, { type: 'power_used' }>, before: GameState): FxCommand[] {
  const hero = before.pieces[before.players[e.seat]?.heroPieceId ?? ''];
  const out: FxCommand[] = hero ? [{ kind: 'burst', burst: 'summon', at: centreOf(hero.pos), color: [255, 243, 196] }] : [];
  for (const choice of e.targets) {
    const tile = choiceTile(before, choice);
    if (tile) out.push({ kind: 'burst', burst: 'ward_glint', at: centreOf(tile), delay: 120 });
  }
  return out;
}

export function useFxDirector(bus: FxBus, locator: BoardLocatorRef): void {
  const controller = useController();
  const registry = useRegistry();
  useEffect(
    () =>
      controller.onCue((step) => {
        if (step.duration <= 0) return;
        // The snapshot still shows the board as it was before this event.
        const before = controller.getSnapshot().state;
        const e = step.event;
        if (e.type === 'card_played') bus.emitAll(cardFlight(e, step, before, registry, locator));
        else if (e.type === 'power_used') bus.emitAll(powerGlint(e, before));
        bus.emitAll(fxForStep(step, before, registry));
      }),
    [bus, controller, registry, locator],
  );
}

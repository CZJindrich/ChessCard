/**
 * Everything the board highlights right now (GDD §15.5), derived from the controller
 * snapshot: the selected piece's dots and rings, card / Power targets with the hovered
 * option's preview, deploy tiles, the inspected enemy, hovered intents, the End Turn preview
 * and the hint. Nothing is computed while events play back.
 */
import { useMemo } from 'react';
import { CARD_TYPE_COLORS, PALETTE } from '../../art';
import { intentQueue } from '../../engine';
import type { CardTargetChoice, CardTargetInfo, ContentRegistry, GameState, IntentView, Piece, Pos, TargetOption } from '../../engine/types';
import { deployTargets, moveRangeKeys, optionAt, type ControllerSnapshot, type PieceHighlights } from '../../game';
import { useController, useRegistry } from './context';
import { endTurnPreview, type EndTurnPreview } from './model';

export interface TargetingModel {
  info: CardTargetInfo;
  /** Glow colour: Summon gold, Rite ember, Charm verdigris, Power the class flame. */
  color: string;
  hovered: TargetOption | null;
  picks: Pos[];
}

export interface BoardModel {
  piece: PieceHighlights | null;
  targeting: TargetingModel | null;
  deploy: Pos[];
  /** Legal Haunt Plume tiles while the acting seat is haunting (Last Flame). */
  haunt: Pos[];
  inspect: Piece | null;
  inspectRange: Set<string>;
  intents: IntentView[];
  /** Intents to emphasise (hovered queue entry, inspected enemy). */
  focusIntents: Set<string>;
  preview: EndTurnPreview | null;
}

function cardColor(state: GameState, reg: ContentRegistry, seat: number, uid: string): string {
  const card = state.players[seat]?.hand.find((c) => c.uid === uid);
  const type = card ? reg.cards.byId[card.id]?.type : undefined;
  return type ? (CARD_TYPE_COLORS[type as keyof typeof CARD_TYPE_COLORS] ?? PALETTE.candleGold) : PALETTE.candleGold;
}

function pickPositions(state: GameState, picks: readonly CardTargetChoice[]): Pos[] {
  const out: Pos[] = [];
  for (const pick of picks) {
    if (pick.kind === 'piece') {
      const p = state.pieces[pick.pieceId];
      if (p) out.push(p.pos);
    } else if (pick.kind === 'tile') out.push(pick.pos);
  }
  return out;
}

function pieceAt(state: GameState, pos: Pos | null): Piece | null {
  if (!pos) return null;
  for (const piece of Object.values(state.pieces)) {
    if (pos.x >= piece.pos.x && pos.x < piece.pos.x + piece.size && pos.y >= piece.pos.y && pos.y < piece.pos.y + piece.size) return piece;
  }
  return null;
}

export function useBoardModel(snap: ControllerSnapshot): BoardModel {
  const controller = useController();
  const registry = useRegistry();
  const { latest, selection, uiSeat, animating } = snap;
  const idle = !animating;

  const piece = useMemo(() => {
    if (!idle || uiSeat === null || !selection.pieceId || latest.phase !== 'players') return null;
    return controller.highlightsFor(selection.pieceId);
  }, [controller, idle, uiSeat, selection.pieceId, latest]);

  const targetInfo = useMemo(() => (idle && uiSeat !== null && (selection.card || selection.power) ? controller.targetInfo() : null), [controller, idle, uiSeat, selection.card, selection.power, latest]);

  const targeting = useMemo((): TargetingModel | null => {
    if (!targetInfo || uiSeat === null) return null;
    const color = selection.card ? cardColor(latest, registry, uiSeat, selection.card.uid) : PALETTE.candleGold;
    const hovered = selection.hover ? optionAt(targetInfo, selection.hover, latest) : null;
    const picks = pickPositions(latest, selection.card?.picks ?? selection.power?.picks ?? []);
    return { info: targetInfo, color, hovered, picks };
  }, [targetInfo, uiSeat, selection.card, selection.hover, selection.power, latest, registry]);

  const deploy = useMemo(() => (idle && uiSeat !== null && selection.pieceId && latest.phase === 'night_setup' ? deployTargets(latest, uiSeat, selection.pieceId) : []), [idle, uiSeat, selection.pieceId, latest]);

  const haunt = useMemo(() => (idle && uiSeat !== null && (latest.players[uiSeat]?.haunt.pending ?? false) ? controller.hauntTargets().map((o) => o.pos) : []), [controller, idle, uiSeat, latest]);

  const hoveredPiece = selection.hover && !selection.card && !selection.power ? pieceAt(snap.state, selection.hover) : null;
  const inspectId = selection.inspectId ?? (hoveredPiece && hoveredPiece.side === 'snuff' ? hoveredPiece.id : null);
  const inspect = inspectId ? (snap.state.pieces[inspectId] ?? null) : null;

  const inspectRange = useMemo(() => (inspect && inspect.side === 'snuff' && idle ? moveRangeKeys(latest, inspect.id) : new Set<string>()), [inspect, idle, latest]);

  const intents = useMemo(() => intentQueue(snap.state), [snap.state]);

  const focusIntents = useMemo(() => {
    const out = new Set<string>();
    if (selection.hoverIntentId) out.add(selection.hoverIntentId);
    if (inspect) for (const v of intents) if (v.attackerId === inspect.id) out.add(v.intentId);
    return out;
  }, [selection.hoverIntentId, inspect, intents]);

  const preview = useMemo(() => (idle && selection.previewEndTurn && latest.phase === 'players' ? endTurnPreview(latest, registry) : null), [idle, selection.previewEndTurn, latest, registry]);

  return { piece, targeting, deploy, haunt, inspect, inspectRange, intents, focusIntents, preview };
}

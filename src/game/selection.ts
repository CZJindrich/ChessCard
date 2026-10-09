/**
 * The UI selection model, kept apart from the engine state: what the local player has picked
 * (a piece, or a card / Hero Power with its multi-step target picks), what the pointer is
 * over, overlay toggles, the current hint, and the last reason notice to show.
 */
import type { Action, CardTargetChoice, Pos } from '../engine/types';

export interface CardSelection {
  uid: string;
  /** "Choose one" cards (Kindle Hope): the chosen mode, or null while choosing. */
  mode: number | null;
  /** Target picks made so far, one per step. */
  picks: CardTargetChoice[];
}

export interface PowerSelection {
  picks: CardTargetChoice[];
}

/** Where a reason notice points, so the right control shakes. */
export type NoticeAnchor =
  | { kind: 'card'; uid: string }
  | { kind: 'piece'; id: string }
  | { kind: 'control'; id: 'end_turn' | 'undo' | 'hint' | 'power' | 'claim' | 'ready' | 'haunt' | 'retry' }
  | { kind: 'board' };

export interface UiNotice {
  id: number;
  text: string;
  anchor: NoticeAnchor;
  /** 'error' plays the reason shake; 'info' is a plain hint line. */
  tone: 'error' | 'info';
}

export interface Selection {
  pieceId: string | null;
  card: CardSelection | null;
  power: PowerSelection | null;
  hover: Pos | null;
  /** The hovered tile is the keyboard cursor (arrow keys, §15.7), not the pointer. */
  keyCursor: boolean;
  /** Right-rail queue entry under the pointer. */
  hoverIntentId: string | null;
  /** Enemy (or any piece) pinned for inspection (click / long-press). */
  inspectId: string | null;
  /** The intent overlay (I toggles it). */
  showIntents: boolean;
  /** End Turn hovered: show the Snuff Strike preview. */
  previewEndTurn: boolean;
  /** The Hint's suggested action (H). */
  hint: Action | null;
}

export const EMPTY_SELECTION: Selection = Object.freeze({
  pieceId: null,
  card: null,
  power: null,
  hover: null,
  keyCursor: false,
  hoverIntentId: null,
  inspectId: null,
  showIntents: true,
  previewEndTurn: false,
  hint: null,
});

/** Drop the choices (piece, card, power, hint) but keep pointer state and toggles. */
export function clearChoices(sel: Selection): Selection {
  if (!sel.pieceId && !sel.card && !sel.power && !sel.hint && !sel.inspectId) return sel;
  return { ...sel, pieceId: null, card: null, power: null, hint: null, inspectId: null };
}

export function samePosOrNull(a: Pos | null, b: Pos | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
}

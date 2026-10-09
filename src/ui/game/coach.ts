/**
 * Coach marks for the scripted first turn (GDD §15.2–15.3), driven by the engine's tutorial
 * script (`tutorialScript(heroId)`). Pure: which step is current, whether it is complete or can
 * no longer be done (abort), its text for mouse or touch, and where its arrow points.
 */
import type { TutorialScript, TutorialStep } from '../../engine';
import type { CardTargetInfo, GameState, Piece, Pos } from '../../engine/types';

export type InputKind = 'mouse' | 'touch';

export type CoachAnchor = { kind: 'tile'; pos: Pos } | { kind: 'card'; cardId: string } | { kind: 'end_turn' };

export interface CoachView {
  stepIndex: number;
  markId: number;
  /** Text with **bold** spans. */
  text: string;
  anchor: CoachAnchor;
  /** Marks that close on their own (mark 3: after 3 s or the next click). */
  autoCloseMs: number | null;
  /** Marks 1–4 allow only the guaranteed line's actions (plus Skip). */
  restricts: boolean;
}

/** What the coach needs to know about the UI besides the engine state. */
export interface CoachContext {
  selectedPieceId: string | null;
  selectedCardId: string | null;
  /** Card target info for the selected card (summon tiles), when one is selected. */
  cardInfo: CardTargetInfo | null;
  /** Count of each card id in the opening hand. */
  openingHand: Readonly<Record<string, number>>;
  /** Whether a card in hand can be played right now (marks skip themselves when not). */
  canPlay: (cardId: string) => boolean;
}

function same(a: Pos | null, b: Pos | null): boolean {
  return a !== null && b !== null && a.x === b.x && a.y === b.y;
}

export function heroPiece(s: GameState, seat = 0): Piece | null {
  const id = s.players[seat]?.heroPieceId;
  return id ? (s.pieces[id] ?? null) : null;
}

function snuffAt(s: GameState, pos: Pos): boolean {
  return Object.values(s.pieces).some((p) => p.side === 'snuff' && same(p.pos, pos));
}

function handCount(s: GameState, cardId: string, seat = 0): number {
  return s.players[seat]?.hand.filter((c) => c.id === cardId).length ?? 0;
}

export type StepStatus = 'open' | 'done' | 'aborted';

/** Whether a scripted step is done, still to do, or can no longer be done. */
export function stepStatus(step: TutorialStep, s: GameState, ctx: CoachContext): StepStatus {
  const hero = heroPiece(s);
  if (!hero) return 'aborted';
  switch (step.action) {
    case 'select':
      return ctx.selectedPieceId === hero.id || !same(hero.pos, step.from) ? 'done' : 'open';
    case 'move':
      if (same(hero.pos, step.target)) return 'done';
      return hero.movesLeft <= 0 ? 'aborted' : 'open';
    case 'strike':
      if (step.target && !snuffAt(s, step.target)) return 'done';
      return hero.strikesLeft <= 0 ? 'aborted' : 'open';
    case 'play_card': {
      if (!step.cardId) return 'aborted';
      if (handCount(s, step.cardId) < (ctx.openingHand[step.cardId] ?? 0)) return 'done';
      if (handCount(s, step.cardId) === 0) return 'aborted';
      return ctx.canPlay(step.cardId) ? 'open' : 'aborted';
    }
    case 'info':
      return 'open';
    case 'end_turn':
      return s.phase !== 'players' || (s.players[0]?.turnEnded ?? false) ? 'done' : 'open';
  }
}

const MARK3: Readonly<Record<string, string>> = {
  sconce_paladin: 'A melee kill takes its square, like chess.',
  ember_duelist: 'A melee kill takes its square, like chess.',
  lampwright: 'Ranged strikes stay put.',
  moth_witch: "Velveteen's kills don't move in. They leave a Velvet Moth.",
};

function cardName(cardId: string | null, names: Readonly<Record<string, string>>): string {
  return cardId ? (names[cardId] ?? cardId) : 'the card';
}

/** The words of a step (§15.3), for mouse or touch. */
export function stepText(script: TutorialScript, index: number, input: InputKind, cardNames: Readonly<Record<string, string>>): string {
  const step = script.steps[index];
  const click = input === 'touch' ? 'Tap' : 'Click';
  const hero = script.heroId;
  const firstOfMark2 = script.steps.findIndex((s) => s.markId === 2) === index;
  const intro2 = firstOfMark2 ? 'Each piece may Move once and Strike once, in either order. ' : '';
  switch (step.markId) {
    case 1:
      return `The Snuff want your Vigil Candles. Red tiles show where they will strike after your turn. ${click} your hero.`;
    case 2:
      if (step.action === 'move') return `${intro2}Gold dots are moves. Step to **${posName(step.target)}**.`;
      return `${intro2}Gold rings are foes you can hit. Strike the **Sootling**.`;
    case 3:
      return MARK3[hero] ?? 'A melee kill takes its square, like chess.';
    case 4:
      if (hero === 'lampwright') return step.action === 'move' ? 'Slide to **b2**, then play **Tinder Bolt** up the b-file.' : 'Now play **Tinder Bolt** up the b-file.';
      if (hero === 'ember_duelist') return '**Flourish!** A kill earns another strike. Take the second **Sootling**.';
      return `Cards cost Flame (the flames beside your hand). Play **${cardName(step.cardId, cardNames)}** on the other Sootling.`;
    case 5: {
      const name = cardName(step.cardId, cardNames);
      const how = input === 'touch' ? `tap **${name}** and then a glowing tile` : `drag **${name}** onto a glowing tile, or click the card and then the tile`;
      const extra = hero === 'lampwright' ? ' His Lanterns can shoot right away.' : '';
      return `Summon a piece: ${how}. New pieces act next turn.${extra}`;
    }
    default:
      return input === 'touch' ? 'Tap **End Turn** once to preview, and again to confirm.' : 'Hover **End Turn** to preview what the Snuff will do, then press it (Space).';
  }
}

function posName(pos: Pos | null): string {
  return pos ? `${String.fromCharCode(97 + pos.x)}${pos.y + 1}` : 'the gold dot';
}

/** Where the step's arrow points right now. */
export function stepAnchor(step: TutorialStep, s: GameState, ctx: CoachContext): CoachAnchor {
  const hero = heroPiece(s);
  switch (step.action) {
    case 'select':
    case 'info':
      return { kind: 'tile', pos: hero?.pos ?? step.from ?? { x: 0, y: 0 } };
    case 'move':
    case 'strike':
      return ctx.selectedPieceId === hero?.id && step.target ? { kind: 'tile', pos: step.target } : { kind: 'tile', pos: hero?.pos ?? step.target ?? { x: 0, y: 0 } };
    case 'play_card': {
      if (ctx.selectedCardId !== step.cardId || !step.cardId) return { kind: 'card', cardId: step.cardId ?? '' };
      const tile = step.target ?? ctx.cardInfo?.targets[0]?.pos ?? null;
      return tile ? { kind: 'tile', pos: tile } : { kind: 'card', cardId: step.cardId };
    }
    case 'end_turn':
      return { kind: 'end_turn' };
  }
}

export interface CoachProgress {
  /** Steps closed by the player ("Got it", the info mark's timeout). */
  dismissed: ReadonlySet<number>;
}

/** The current coach mark, or null when the line is finished (or nothing applies). */
export function currentMark(script: TutorialScript, s: GameState, ctx: CoachContext, progress: CoachProgress, input: InputKind, cardNames: Readonly<Record<string, string>>): CoachView | null {
  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    if (progress.dismissed.has(i)) continue;
    const status = stepStatus(step, s, ctx);
    if (status !== 'open') continue;
    return {
      stepIndex: i,
      markId: step.markId,
      text: stepText(script, i, input, cardNames),
      anchor: stepAnchor(step, s, ctx),
      autoCloseMs: step.action === 'info' ? 3000 : null,
      restricts: step.markId <= 4 && step.action !== 'info',
    };
  }
  return null;
}

/** During marks 1–4, may the player click this tile? (The coached tiles and the hero.) */
export function tileAllowed(view: CoachView, script: TutorialScript, s: GameState, pos: Pos): boolean {
  const step = script.steps[view.stepIndex];
  const hero = heroPiece(s);
  if (hero && same(hero.pos, pos)) return true;
  if (view.anchor.kind === 'tile' && same(view.anchor.pos, pos)) return true;
  return step.target !== null && same(step.target, pos);
}

/** During marks 1–4, may the player pick this card? (Only the coached one.) */
export function cardAllowed(view: CoachView, script: TutorialScript, cardId: string): boolean {
  return script.steps[view.stepIndex].cardId === cardId;
}

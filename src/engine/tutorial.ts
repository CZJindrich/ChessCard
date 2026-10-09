/**
 * The first-ever game's scripted Night 1 on `first_vigil` (GDD §15.2, §13.3.4, §13.7).
 *
 * With `config.tutorial` on, the game runs the Quick Play first-game rules whatever the config
 * says: Night 1 `first_vigil`, Night 2 `cathedral_of_tallow`, the Hush Hierophant as the boss, and
 * no Tolls, Moth Die or Boons. On Night 1 the first seat's hero starts on its scripted tile, the two
 * Sootlings stand in place with their intents locked (the scripted placement replaces the round-1
 * Snuff Move), the opening hand is fixed, turn-1 Flame is the scripted amount, and the Plumes
 * follow the map's schedule (setup.ts).
 *
 * `tutorialScript(heroId)` is the guaranteed line as data for the coach marks (§15.3): each step
 * names its coach mark, the action and its tiles; `tutorialAction` turns a step into the engine
 * action for the current state. The coach marks themselves (and `TutorialState.step`) belong to
 * the UI; the engine never forbids other actions.
 */
import { cardTargetInfo } from './cards';
import { getContent } from './content';
import { sq } from './geometry';
import { declareIntent, enemyDefOf, numberIntents } from './snuff';
import { heroOf, pieceAt } from './state';
import type { Ctx } from './state';
import type { Action, CardInstance, CardTargetChoice, ContentRegistry, GameConfig, GameState, Pos, TutorialOpening } from './types';

// =============================================================================================
// The guaranteed lines (§15.2)
// =============================================================================================

export type TutorialActionKind = 'select' | 'move' | 'strike' | 'play_card' | 'info' | 'end_turn';

export interface TutorialStep {
  /** Coach mark (§15.3, 1-6) this step belongs to. */
  markId: number;
  action: TutorialActionKind;
  /** The acting piece: always the hero in the scripted lines (null for cards, info, end_turn). */
  piece: 'hero' | null;
  /** `move`: the tile the hero leaves; `select`: the hero's tile. */
  from: Pos | null;
  /** `move`: destination; `strike` / `play_card`: the target tile (null = any glowing tile). */
  target: Pos | null;
  /** `play_card`: the card id. */
  cardId: string | null;
  /** Summons: any legal tile will do (`target` is null). */
  anyTile: boolean;
  /** `strike`: where the hero lands after the Take, or null (ranged, Velveteen). */
  take: Pos | null;
  /** The line's text from the map content (empty for select / info / end_turn). */
  text: string;
}

export interface TutorialScript {
  heroId: string;
  heroStart: Pos;
  sootlings: Array<{ at: Pos; aim: Pos }>;
  hand: string[];
  flame: number;
  steps: TutorialStep[];
}

type LineStep = Partial<Omit<TutorialStep, 'from' | 'target' | 'take' | 'text'>> & {
  markId: number;
  action: TutorialActionKind;
  from?: string;
  target?: string;
  take?: string;
  /** Index into the content's `line` texts. */
  line?: number;
};

/** The guaranteed line of each hero (§15.2), between the select (mark 1) and End Turn (mark 6) steps. */
const LINES: Readonly<Record<string, readonly LineStep[]>> = {
  sconce_paladin: [
    { markId: 2, action: 'move', from: 'd2', target: 'd3', line: 0 },
    { markId: 2, action: 'strike', target: 'c4', take: 'c4', line: 1 },
    { markId: 3, action: 'info' },
    { markId: 4, action: 'play_card', cardId: 'spark', target: 'f5', line: 2 },
    { markId: 5, action: 'play_card', cardId: 'call_the_squire', anyTile: true, line: 3 },
  ],
  moth_witch: [
    { markId: 2, action: 'strike', target: 'd4', line: 0 },
    { markId: 3, action: 'info' },
    { markId: 4, action: 'play_card', cardId: 'spark', target: 'g4', line: 1 },
    { markId: 5, action: 'play_card', cardId: 'loose_a_moth', anyTile: true, line: 2 },
  ],
  lampwright: [
    { markId: 2, action: 'strike', target: 'd4', line: 0 },
    { markId: 3, action: 'info' },
    { markId: 4, action: 'move', from: 'd2', target: 'b2', line: 1 },
    { markId: 4, action: 'play_card', cardId: 'tinder_bolt', target: 'b4', line: 2 },
    { markId: 5, action: 'play_card', cardId: 'hang_a_lantern', anyTile: true, line: 3 },
  ],
  ember_duelist: [
    { markId: 2, action: 'strike', target: 'f4', take: 'f4', line: 0 },
    { markId: 3, action: 'info' },
    { markId: 4, action: 'strike', target: 'g3', take: 'g3', line: 1 },
    { markId: 5, action: 'play_card', cardId: 'strike_a_cinder', anyTile: true, line: 2 },
  ],
};

function openingOf(heroId: string, reg: ContentRegistry): TutorialOpening | null {
  return reg.maps.byId.first_vigil?.tutorial?.[heroId] ?? null;
}

function stepFrom(step: LineStep, opening: TutorialOpening): TutorialStep {
  const usesHero = step.action === 'move' || step.action === 'strike' || step.action === 'select';
  return {
    markId: step.markId,
    action: step.action,
    piece: usesHero ? 'hero' : null,
    from: step.from ? sq(step.from) : null,
    target: step.target ? sq(step.target) : null,
    cardId: step.cardId ?? null,
    anyTile: step.anyTile ?? false,
    take: step.take ? sq(step.take) : null,
    text: step.line !== undefined ? (opening.line[step.line] ?? '') : '',
  };
}

/** The scripted opening and guaranteed line of a hero, or null for a hero without one. */
export function tutorialScript(heroId: string, reg: ContentRegistry = getContent()): TutorialScript | null {
  const opening = openingOf(heroId, reg);
  const line = LINES[heroId];
  if (!opening || !line) return null;
  const start = sq(opening.heroStart);
  const select: LineStep = { markId: 1, action: 'select', from: opening.heroStart, target: opening.heroStart };
  const end: LineStep = { markId: 6, action: 'end_turn' };
  return {
    heroId,
    heroStart: start,
    sootlings: opening.sootlings.map((t) => ({ at: sq(t.at), aim: sq(t.aim) })),
    hand: opening.hand.slice(),
    flame: opening.flame,
    steps: [select, ...line, end].map((step) => stepFrom(step, opening)),
  };
}

function cardChoice(s: GameState, target: Pos): CardTargetChoice {
  const piece = pieceAt(s, target);
  return piece ? { kind: 'piece', pieceId: piece.id } : { kind: 'tile', pos: { ...target } };
}

/**
 * The engine action for a script step in the current state (hero piece id and card uid filled
 * in; a summon takes the first glowing tile). Null for `select` / `info`, or when the step cannot
 * be made (the card is not in hand, the hero is gone).
 */
export function tutorialAction(s: GameState, step: TutorialStep, seat = 0, reg: ContentRegistry = getContent()): Action | null {
  const hero = heroOf(s, seat);
  switch (step.action) {
    case 'select':
    case 'info':
      return null;
    case 'end_turn':
      return { type: 'end_turn', seat };
    case 'move':
      return hero && step.target ? { type: 'move', seat, pieceId: hero.id, to: { ...step.target } } : null;
    case 'strike':
      return hero && step.target ? { type: 'strike', seat, pieceId: hero.id, target: { ...step.target } } : null;
    case 'play_card': {
      const card = s.players[seat]?.hand.find((c) => c.id === step.cardId);
      if (!card) return null;
      if (step.target) return { type: 'play_card', seat, cardUid: card.uid, targets: [cardChoice(s, step.target)] };
      const first = cardTargetInfo(s, reg, seat, card.uid).targets[0];
      return first ? { type: 'play_card', seat, cardUid: card.uid, targets: [first.choice] } : null;
    }
  }
}

function samePlace(a: Pos | null, b: Pos): boolean {
  return a !== null && a.x === b.x && a.y === b.y;
}

/**
 * Whether `action` performs a script step (coach marks 1-4 allow only these, §15.2): the hero's
 * move or strike on the step's tile, the step's card on its target (a summon on any tile), or
 * End Turn. `select` and `info` steps have no engine action.
 */
export function matchesTutorialStep(s: GameState, step: TutorialStep, action: Action, seat = 0): boolean {
  if (!('seat' in action) || action.seat !== seat) return false;
  const heroId = s.players[seat]?.heroPieceId;
  switch (step.action) {
    case 'select':
    case 'info':
      return false;
    case 'end_turn':
      return action.type === 'end_turn';
    case 'move':
      return action.type === 'move' && action.pieceId === heroId && samePlace(step.target, action.to);
    case 'strike':
      return action.type === 'strike' && action.pieceId === heroId && samePlace(step.target, action.target);
    case 'play_card': {
      if (action.type !== 'play_card') return false;
      const card = s.players[seat]?.hand.find((c) => c.uid === action.cardUid);
      if (!card || card.id !== step.cardId) return false;
      if (step.anyTile || !step.target) return true;
      const choice = action.targets[0];
      if (!choice) return false;
      if (choice.kind === 'tile') return samePlace(step.target, choice.pos);
      const piece = choice.kind === 'piece' ? s.pieces[choice.pieceId] : undefined;
      return piece !== undefined && samePlace(step.target, piece.pos);
    }
  }
}

// =============================================================================================
// Engine hooks
// =============================================================================================

/** The tutorial forces the first-ever Quick Play rules (§14.3): first_vigil, the Hierophant, no Tolls / Moth Die / Boons. */
export function tutorialConfig(config: GameConfig): GameConfig {
  if (!config.tutorial) return config;
  return { ...config, firstGame: true, boss_choice: 'hush_hierophant', tolls: false, moth_die: false, boons: false };
}

/** Night 1 of a tutorial game, on first_vigil, with an opening for the first seat's hero. */
function scriptedOpening(s: GameState, reg: ContentRegistry): TutorialOpening | null {
  if (!s.tutorial || s.night !== 1 || s.siteId !== 'first_vigil') return null;
  return openingOf(s.tutorial.heroId, reg);
}

/** night_setup, after the full shuffle: the opening hand goes on top of the first seat's deck, in order. */
export function stackOpeningHand(ctx: Ctx, seat: number): void {
  const opening = scriptedOpening(ctx.s, ctx.reg);
  if (!opening || seat !== 0) return;
  const player = ctx.s.players[seat];
  const top: CardInstance[] = [];
  for (const id of opening.hand) {
    const index = player.deck.findIndex((c) => c.id === id);
    if (index >= 0) top.push(...player.deck.splice(index, 1));
  }
  player.deck = [...top, ...player.deck];
}

/**
 * Round 1's Snuff Move on the scripted opening: nothing moves; each Sootling locks its attack on
 * the Candle it aims at. Returns false (run the normal Snuff Move) outside the script.
 */
export function runScriptedSnuffMove(ctx: Ctx): boolean {
  const { s, reg } = ctx;
  const opening = scriptedOpening(s, reg);
  if (!opening || !s.tutorial?.scripted || s.round !== 1) return false;
  s.intents = [];
  for (const sootling of opening.sootlings) {
    const enemy = pieceAt(s, sq(sootling.at));
    const def = enemy ? enemyDefOf(reg, enemy) : null;
    if (!enemy || !def) continue;
    const aim = sq(sootling.aim);
    const intent = declareIntent(ctx, enemy, def, { pos: aim, piece: pieceAt(s, aim) });
    if (intent) s.intents.push(intent);
  }
  numberIntents(ctx);
  return true;
}

/** The first seat's first turn on the script gets the scripted Flame (§15.2: 3). */
export function tutorialTurnStart(ctx: Ctx, seat: number): void {
  const opening = scriptedOpening(ctx.s, ctx.reg);
  if (!opening || !ctx.s.tutorial?.scripted || ctx.s.round !== 1 || seat !== 0) return;
  ctx.s.players[seat].flame = Math.min(ctx.reg.rules.flameCap, opening.flame);
}

/** The scripted turn is over once round 1's players phase ends. */
export function endScriptedTurn(s: GameState): void {
  if (s.tutorial?.scripted && s.round >= 1) s.tutorial.scripted = false;
}

/** The scripted turn 1 is running (only the guaranteed line is coached). */
export function tutorialTurnActive(s: GameState): boolean {
  return s.tutorial !== null && s.tutorial.scripted && s.night === 1 && s.round <= 1 && s.siteId === 'first_vigil';
}

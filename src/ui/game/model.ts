/**
 * Words and small derived facts for the game screen: names, the phase ribbon, round labels,
 * enemy tooltips, plaque states and the End Turn (Snuff Strike) preview lines. Pure functions
 * over the engine state and the content registry.
 */
import { intentQueue, pieceName, previewSnuffStrike, sqName } from '../../engine';
import type { ContentRegistry, GameEvent, GameState, IntentView, Piece, PhaseId, Pos } from '../../engine/types';

export const BEATS = ['Snuff Move', 'Your turns', 'Snuff Strike'] as const;

/** Which of the three beats is lit (−1 outside the round). */
export function beatIndex(phase: PhaseId): number {
  switch (phase) {
    case 'omen':
    case 'snuff_move':
      return 0;
    case 'players':
      return 1;
    case 'snuff_strike':
    case 'rise':
    case 'tally':
      return 2;
    default:
      return -1;
  }
}

export function nightLabel(s: GameState): string {
  return s.isBossNight ? `Boss Night · ${s.night}/${s.config.nights}` : `Night ${s.night}/${s.config.nights}`;
}

export function roundLabel(s: GameState): string {
  if (s.round === 0) return 'Setup';
  return s.roundsThisNight === null ? `Round ${s.round}` : `Round ${s.round}/${s.roundsThisNight}`;
}

export function siteName(s: GameState, reg: ContentRegistry): string {
  return reg.sites.byId[s.siteId]?.name ?? reg.maps.byId[s.siteId]?.name ?? s.siteId.replace(/_/g, ' ');
}

export function nameOf(reg: ContentRegistry, piece: Piece): string {
  return pieceName(reg, piece);
}

export function heroTitle(reg: ContentRegistry, heroId: string): string {
  return reg.heroes.byId[heroId]?.displayName ?? heroId;
}

const PREFERS: Readonly<Record<string, string>> = {
  candles: 'Candles',
  heroes: 'heroes',
  light: 'light',
  clusters: 'clusters',
  nearest: 'the nearest',
};

/** "Will lance c3 for 1" from "Ink Wretch → lances c3 for 1" (the engine's verbs are 3rd person). */
function intentClause(view: IntentView): string {
  const arrow = view.text.indexOf('→');
  const rest = arrow >= 0 ? view.text.slice(arrow + 1).trim() : view.text;
  const [verb, ...tail] = rest.split(' ');
  const base = verb.endsWith('s') ? verb.slice(0, -1) : verb;
  return `Will ${[base, ...tail].join(' ')}`;
}

export interface InspectInfo {
  title: string;
  lines: string[];
}

/** Enemy tooltip (§15.5): "Ink Wretch · Soldier · 2 HP · Prefers Candles · Will lance c3 for 1 · Queue 1". */
export function inspectInfo(s: GameState, reg: ContentRegistry, piece: Piece): InspectInfo {
  const name = nameOf(reg, piece);
  if (piece.side === 'snuff') {
    const def = reg.enemies.byId[piece.defId];
    const boss = reg.bosses.byId[piece.defId];
    const rank = def ? (reg.ranks.byId[def.rank]?.name ?? def.rank) : boss ? 'Boss' : 'Snuff';
    const head = [rank, `${piece.hp}/${piece.maxHp} HP`];
    if (def?.ai.prefers) head.push(`Prefers ${PREFERS[def.ai.prefers] ?? def.ai.prefers}`);
    const lines = [head.join(' · ')];
    const intents = intentQueue(s).filter((v) => v.attackerId === piece.id);
    for (const v of intents) lines.push(`${intentClause(v)} · Queue ${v.queue}`);
    if (intents.length === 0) lines.push(piece.dazed ? 'Dazed: declares nothing' : 'No attack locked');
    if (def?.text) lines.push(def.text);
    return { title: name, lines };
  }
  if (piece.kind === 'candle') return { title: 'Vigil Candle', lines: [`${piece.hp}/${piece.maxHp} HP · A hit adds Dread`] };
  const owner = piece.owner !== null ? s.players[piece.owner]?.name : null;
  const lines = [`${piece.hp}/${piece.maxHp} HP · ATK ${piece.atk}${owner ? ` · ${owner}` : ''}`];
  if (piece.smoldering) lines.push('Smoldering: an adjacent ally can relight it with its Strike');
  else if (piece.exhausted) lines.push('Just arrived: acts next turn');
  return { title: name, lines };
}

// =============================================================================================
// End Turn preview (§15.5 "End Turn preview")
// =============================================================================================

export interface PreviewLine {
  text: string;
  tiles: Pos[];
  tone: 'hit' | 'death' | 'dread' | 'ward' | 'info';
}

function victimText(view: GameState, reg: ContentRegistry, id: string): string {
  const piece = view.pieces[id];
  return piece ? `${sqName(piece.pos)} ${nameOf(reg, piece)}` : 'a piece';
}

function previewLine(e: GameEvent, before: GameState, reg: ContentRegistry): PreviewLine | null {
  switch (e.type) {
    case 'damage': {
      const piece = before.pieces[e.pieceId];
      const tiles = piece ? [piece.pos] : [];
      if (e.blockedByWard) return { text: `Ward shields ${victimText(before, reg, e.pieceId)}`, tiles, tone: 'ward' };
      return { text: `${victimText(before, reg, e.pieceId)} takes ${e.amount}${e.lethal ? ' — falls' : ''}`, tiles, tone: e.lethal ? 'death' : 'hit' };
    }
    case 'dread_changed':
      return e.to > e.from ? { text: `Dread +${e.to - e.from} (${e.to}/${before.vigil?.dreadMax ?? '?'})`, tiles: [], tone: 'dread' } : null;
    case 'piece_moved':
      return e.kind === 'push' || e.kind === 'pull' ? { text: `${victimText(before, reg, e.pieceId)} is pushed to ${sqName(e.to)}`, tiles: [e.to], tone: 'info' } : null;
    case 'game_over':
      return { text: e.result.mode === 'vigil' && e.result.outcome === 'defeat' ? 'The Long Night falls!' : 'The game ends', tiles: [], tone: 'death' };
    default:
      return null;
  }
}

export interface EndTurnPreview {
  lines: PreviewLine[];
  tiles: Pos[];
  rising: Array<{ pos: Pos; enemyId: string; blocked: boolean }>;
}

/** Previews per state object (states are immutable), shared by the board and the rail. */
const previewCache = new WeakMap<GameState, EndTurnPreview>();

/** What ending the players phase now would do: the Snuff Strike, then the Plumes that rise. */
export function endTurnPreview(s: GameState, reg: ContentRegistry): EndTurnPreview {
  const cached = previewCache.get(s);
  if (cached) return cached;
  const preview = computeEndTurnPreview(s, reg);
  previewCache.set(s, preview);
  return preview;
}

function computeEndTurnPreview(s: GameState, reg: ContentRegistry): EndTurnPreview {
  const { events } = previewSnuffStrike(s);
  const lines: PreviewLine[] = [];
  for (const e of events) {
    const line = previewLine(e, s, reg);
    if (line) lines.push(line);
  }
  const tiles = intentQueue(s).flatMap((v) => v.tiles);
  const rising = s.plumes.map((m) => ({ pos: m.pos, enemyId: m.enemyId, blocked: Object.values(s.pieces).some((p) => p.pos.x === m.pos.x && p.pos.y === m.pos.y) }));
  return { lines, tiles, rising };
}

export function enemyName(reg: ContentRegistry, enemyId: string): string {
  return reg.enemies.byId[enemyId]?.name ?? enemyId;
}

// =============================================================================================
// Plaques
// =============================================================================================

export type PlaqueState = 'acting' | 'waiting' | 'claimable' | 'ended' | 'thinking' | 'idle';

export function plaqueState(s: GameState, seat: number, thinkingSeat: number | null): PlaqueState {
  const player = s.players[seat];
  if (!player || s.phase !== 'players') return 'idle';
  if (thinkingSeat === seat) return 'thinking';
  if (s.activeSeat === seat) return 'acting';
  if (player.turnEnded) return 'ended';
  if (s.claimQueue.includes(seat)) return 'waiting';
  return s.config.mode === 'vigil' ? 'claimable' : 'waiting';
}

export const PLAQUE_LABEL: Readonly<Record<PlaqueState, string>> = {
  acting: 'Acting',
  waiting: 'Waiting',
  claimable: 'To act',
  ended: 'Turn ended',
  thinking: 'Thinking…',
  idle: '',
};

/**
 * Whether a plaque offers a claim (GDD §11.3): a local human's "Take My Turn" while two or more
 * humans still have to act and nobody is acting; an AI ally's "Let them act" any time before
 * its turn while humans are still to act (it then goes next).
 */
export function canClaim(s: GameState, seat: number, local: boolean): boolean {
  const player = s.players[seat];
  if (!player || !local || s.phase !== 'players' || s.config.mode !== 'vigil' || s.players.length < 2 || player.turnEnded) return false;
  const humansToAct = s.players.filter((p) => p.kind === 'human' && !p.turnEnded && !p.eliminated).length;
  if (player.kind === 'human') return s.activeSeat === null && humansToAct >= 2;
  return s.activeSeat !== seat && !s.claimQueue.includes(seat) && humansToAct > 0;
}

/** Seats still to act in a Vigil players phase with nobody acting (the co-op claim moment). */
export function seatsToClaim(s: GameState): number[] {
  if (s.phase !== 'players' || s.activeSeat !== null || s.config.mode !== 'vigil') return [];
  return s.players.filter((p) => !p.turnEnded && !p.eliminated).map((p) => p.seat);
}


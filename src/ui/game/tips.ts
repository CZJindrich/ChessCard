/**
 * First-time tips (GDD §15.3): each shown once, the first time its situation comes up, at most
 * one per beat (the rest queue). Seen tips are stored per device under `chesscard.tips`, next to
 * the local profile. Pure detection over events and states; the TipsLayer shows them.
 */
import { readJson, writeJson, type KeyValueStorage } from '../../config';
import type { GameEvent, GameState } from '../../engine/types';

export const TIP_IDS = [
  'plume',
  'dread',
  'push',
  'bump',
  'hot_wax',
  'chimney',
  'shrine',
  'ward',
  'dazed',
  'aimed',
  'smoldering',
  'toll',
  'moth_die',
  'chandlery',
  'boss_phase',
  'crown',
  'check',
  'gloam_warning',
  'lit_shrine',
] as const;

export type TipId = (typeof TIP_IDS)[number];

export interface Tip {
  title: string;
  text: string;
}

export const TIPS: Readonly<Record<TipId, Tip>> = {
  plume: { title: 'Smoke Plume', text: 'A Sootling rises here after the Snuff Strike. Stand on it to block it (take 1) or strike it to pop it.' },
  dread: { title: 'Dread', text: 'A Candle hit adds Dread (the Hour Candle). Full Dread and the Long Night falls.' },
  push: { title: 'Push', text: 'Pushed pieces slide tile by tile until something stops them. Push a Snuff out of reach, or into the red.' },
  bump: { title: 'Bump', text: 'A push that hits something stops there: both the pushed piece and what it hit take 1.' },
  hot_wax: { title: 'Hot Wax', text: 'Ending any move on Hot Wax burns for 1, and again at every Tally. Sliding through is safe.' },
  chimney: { title: 'Chimneys', text: 'Step into a Chimney and you come out of its pair, if that tile is empty. The Snuff never use them.' },
  shrine: { title: 'Votive Shrine', text: 'A piece on or next to a Shrine can spend its Strike to light it. A Lit Shrine heals 1 to Wickfolk around it at Tally.' },
  ward: { title: 'Ward', text: 'The hexagon cancels the next whole hit, then breaks.' },
  dazed: { title: 'Dazed', text: "A Dazed Snuff loses its locked attack. A Dazed Wickfolk piece loses its next Strike." },
  aimed: { title: 'Aimed attacks', text: 'Its attack moved with it: an aimed attack follows its attacker. Move the Snuff and you move the red.' },
  smoldering: { title: 'Smoldering', text: 'A fallen hero becomes a Smoldering Wick. An adjacent ally can relight it with its Strike; otherwise it relights at Tally for 1 Dread.' },
  toll: { title: 'The Toll', text: 'Each Night from the second, choose a Blessing or a Curse. A Curse lets everyone take 2 cards at the next Chandlery.' },
  moth_die: { title: 'The Moth Die', text: 'Rolled every round. The top bar shows what its face does this round.' },
  chandlery: { title: 'The Chandlery', text: 'Between Nights, take a card for your deck and choose a Boon. A thinner deck draws its best cards more often.' },
  boss_phase: { title: 'Boss phases', text: 'At ⅔ and ⅓ of its HP the boss changes phase: new attacks from the next Snuff Move.' },
  crown: { title: 'Gutter Pawns', text: 'A Gutter Pawn that ends a Snuff Move on rank 1 is crowned a Drip Hulk. Stop them before the edge.' },
  check: { title: 'CHECK!', text: 'The Guttered King has 1 or 2 escapes left. Block every arrow before the players phase ends for CHECKMATE.' },
  gloam_warning: { title: 'The Gloam closes', text: 'The pulsing ring turns to Gloam at this round’s Tally. Wickfolk ending a Tally in Gloam take 2.' },
  lit_shrine: { title: 'Lit Shrine', text: 'It heals 1 to each Wickfolk piece on or next to it at every Tally, until a Snuff puts it out.' },
};

export const TIPS_STORAGE_KEY = 'chesscard.tips';

export function loadSeenTips(storage: KeyValueStorage | null): Set<TipId> {
  const raw = readJson(storage, TIPS_STORAGE_KEY);
  const list = Array.isArray(raw) ? raw : [];
  return new Set(list.filter((x): x is TipId => typeof x === 'string' && (TIP_IDS as readonly string[]).includes(x)));
}

export function saveSeenTips(storage: KeyValueStorage | null, seen: ReadonlySet<TipId>): void {
  writeJson(storage, TIPS_STORAGE_KEY, [...seen]);
}

function hasIntent(state: GameState, pieceId: string): boolean {
  return state.intents.some((i) => i.attackerId === pieceId && i.offset !== null);
}

/** Tips an event brings up (`before` = the board shown before it). */
export function tipsForEvent(e: GameEvent, before: GameState): TipId[] {
  switch (e.type) {
    case 'dread_changed':
      return e.to > e.from ? ['dread'] : [];
    case 'piece_moved': {
      const out: TipId[] = [];
      if (e.kind === 'push' || e.kind === 'pull') out.push('push');
      if (e.bump) out.push('bump');
      const piece = before.pieces[e.pieceId];
      if (piece?.side === 'snuff' && (e.kind === 'push' || e.kind === 'pull' || e.kind === 'swap' || e.kind === 'teleport') && before.phase === 'players' && hasIntent(before, piece.id)) out.push('aimed');
      return out;
    }
    case 'damage':
      return e.cause === 'hot_wax' ? ['hot_wax'] : [];
    case 'status_changed':
      if (!e.active) return [];
      return e.status === 'ward' ? ['ward'] : e.status === 'dazed' ? ['dazed'] : [];
    case 'hero_smoldered':
      return ['smoldering'];
    case 'toll_revealed':
      return ['toll'];
    case 'omen_rolled':
      return ['moth_die'];
    case 'chandlery_opened':
      return ['chandlery'];
    case 'boss_phase':
      return ['boss_phase'];
    case 'summoned':
      return e.defId === 'gutter_pawn' ? ['crown'] : [];
    case 'check':
      return ['check'];
    case 'gloam_warning':
      return ['gloam_warning'];
    case 'shrine_changed':
      return e.lit ? ['lit_shrine'] : [];
    default:
      return [];
  }
}

/** Tips the board itself brings up at the start of your turn (tiles you can now use). */
export function tipsForTurn(state: GameState): TipId[] {
  const out: TipId[] = [];
  const has = (type: string): boolean => state.board.tiles.some((t) => t.type === type);
  if (has('hot_wax')) out.push('hot_wax');
  if (has('chimney')) out.push('chimney');
  if (state.board.tiles.some((t) => t.type === 'votive_shrine' && !t.shrineLit)) out.push('shrine');
  if (state.board.tiles.some((t) => t.gloamWarning)) out.push('gloam_warning');
  return out;
}

/** The first End Turn preview with Plumes on the board shows the Plume tip (§15.3). */
export function tipsForPreview(state: GameState): TipId[] {
  return state.plumes.length > 0 ? ['plume'] : [];
}

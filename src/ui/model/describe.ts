/**
 * Plain-language descriptions of content (movement, attacks, heroes) for the hero picker,
 * the Codex and How to Play. Pure functions over the content registry, so mods describe
 * themselves.
 */
import type { CardArtData } from '../../art';
import type { AttackDef, BossDef, CardDef, ContentRegistry, DirSet, EnemyDef, HeroDef, Pattern, RuneId, UnitDef } from '../../engine/types';

const DIR_WORDS: Readonly<Record<DirSet, string>> = { orth: 'orthogonal', diag: 'diagonal', all: 'any direction' };

export function runeName(content: ContentRegistry, rune: string | null): string {
  if (!rune) return '';
  return content.runes.byId[rune]?.name ?? rune.replace(/^rune_/, '').replace(/_/g, ' ');
}

export function runeText(content: ContentRegistry, rune: string | null): string {
  return rune ? (content.runes.byId[rune]?.text ?? '') : '';
}

interface Moving {
  move: Pattern;
  rune: RuneId;
  pips: number | null;
}

/** "King step", "Rook slide 3", "Queen slide 2, flying", "Immobile". */
export function moveSummary(content: ContentRegistry, piece: Moving): string {
  const base = runeName(content, piece.rune);
  const range = piece.pips !== null && piece.move.type === 'slide' ? ` ${piece.pips}` : '';
  const flying = piece.move.flying ? ', flying' : '';
  return `${base}${range}${flying}`;
}

const SLIDE_NAMES: Readonly<Record<DirSet, string>> = { orth: 'Rook slide', diag: 'Bishop slide', all: 'Queen slide' };

/** A movement pattern in words, without a rune (boss phases). */
export function patternSummary(pattern: Pattern): string {
  const flying = pattern.flying ? ', flying' : '';
  switch (pattern.type) {
    case 'immobile':
      return 'Immobile';
    case 'leap':
      return `Knight leap${flying}`;
    case 'step':
      return (pattern.dirs === 'all' ? 'King step' : `1 ${DIR_WORDS[pattern.dirs]} step`) + flying;
    case 'slide':
      return `${SLIDE_NAMES[pattern.dirs]} ${pattern.range ?? 'to the edge'}${flying}`;
  }
}

function rangeText(range: number | null): string {
  return range === null ? 'to the edge' : `range ${range}`;
}

function meleeReach(attack: AttackDef): string {
  if (attack.centered && attack.area === 'ring8') return 'Hits all 8 tiles around itself';
  const reach = attack.reach;
  if (reach === 'as_move' || reach === null) return 'Melee, as move';
  if (reach.type === 'leap') return 'Melee, knight leap';
  if (reach.type === 'step' && reach.range === 1) {
    if (reach.dirs === 'diag') return 'Melee, 1 diagonal tile';
    if (reach.dirs === 'orth') return 'Melee, 1 orthogonal tile';
    return 'Melee, 1 adjacent tile';
  }
  return `Melee, ${DIR_WORDS[reach.dirs]} ${rangeText(reach.range)}`;
}

const AREA_WORDS: Readonly<Partial<Record<AttackDef['area'], string>>> = {
  plus5: 'plus-shaped blast',
  square3: '3×3 blast',
  block2x2: '2×2 block',
  beam2: '2-wide beam',
  side2: 'one side',
  ring12: 'ring around itself',
};

/** One line for an attack: kind, reach, then push / pull / status / extra hits. */
export function attackSummary(content: ContentRegistry, attack: AttackDef): string {
  let text: string;
  switch (attack.kind) {
    case 'none':
      return 'No attack';
    case 'melee':
      text = meleeReach(attack);
      break;
    case 'ranged':
      text = `Ranged line, ${DIR_WORDS[attack.dirs]}, ${rangeText(attack.range)}${attack.firstHit ? ', first hit' : attack.pierce ? ', pierces' : ''}`;
      break;
    case 'artillery': {
      const area = AREA_WORDS[attack.area];
      text = `Artillery, distance ${attack.minRange}–${attack.range ?? 'edge'}${area ? `, ${area}` : ''}`;
      break;
    }
  }
  const extras: string[] = [];
  if (typeof attack.damage === 'number') extras.push(`${attack.damage} damage`);
  if (attack.times > 1) extras.push(`hits ${attack.times}×`);
  if (attack.push > 0) extras.push(`push ${attack.push}`);
  if (attack.pull > 0) extras.push(`pull ${attack.pull}`);
  if (attack.status) extras.push(`applies ${content.statuses.byId[attack.status]?.name ?? attack.status}`);
  return extras.length > 0 ? `${text}; ${extras.join(', ')}` : text;
}

export interface HeroView {
  id: string;
  firstName: string;
  title: string;
  displayName: string;
  className: string;
  hp: number;
  atk: number;
  rune: RuneId;
  pips: number;
  move: string;
  strikeRune: RuneId | null;
  /** Name of the strike glyph ("Ranged line"), or '' when the hero strikes as it moves. */
  strikeName: string;
  strike: string;
  pitch: string;
  traitName: string;
  traitText: string;
  powerName: string;
  powerCost: number;
  powerText: string;
  flame: string;
  flavor: string;
}

export function heroView(content: ContentRegistry, hero: HeroDef): HeroView {
  const trait = content.traits.byId[hero.trait];
  const power = content.powers.byId[hero.power];
  return {
    id: hero.id,
    firstName: hero.name,
    title: hero.title,
    displayName: hero.displayName,
    className: hero.className,
    hp: hero.hp,
    atk: hero.atk,
    rune: hero.rune,
    pips: hero.pips ?? 0,
    move: moveSummary(content, hero),
    strikeRune: hero.strikeRune,
    strikeName: runeName(content, hero.strikeRune),
    strike: attackSummary(content, hero.attack),
    pitch: hero.pitch,
    traitName: trait?.name ?? hero.trait,
    traitText: trait?.text ?? '',
    powerName: power?.name ?? hero.power,
    powerCost: hero.powerCost,
    powerText: power?.text ?? '',
    flame: hero.flame,
    flavor: hero.flavor,
  };
}

/** "Brannoc" for coach marks and the log (§8.1), with a fallback for unknown ids. */
export function heroFirstName(content: ContentRegistry, heroId: string | null): string {
  if (!heroId) return 'Random hero';
  return content.heroes.byId[heroId]?.name ?? heroId;
}

/**
 * Boss HP before the difficulty multiplier (§10.1). Vigil: the solo HP, plus a share of it per
 * extra seat ("35 per player" when each seat adds the full solo HP); Last Flame: base + per hero.
 */
export function bossHpSummary(content: ContentRegistry, boss: BossDef): { vigil: string; lastFlame: string } {
  const solo = boss.hp.base + boss.hp.perPlayer;
  const share = content.rules.coopScaling.bossHpPerExtraSeat;
  const extra = Math.round(solo * share * 100) / 100;
  const vigil = share === 1 ? `${solo} per player` : share === 0 ? `${solo}` : `${solo}, +${extra} per extra player`;
  return { vigil, lastFlame: `${boss.hp.base} + ${boss.hp.perPlayer} per hero` };
}

/** "+1 Bell Drop per extra player" (Vigil co-op, §10.1), or null when the boss does not scale its intents. */
export function bossCoopIntentText(content: ContentRegistry, boss: BossDef): string | null {
  const count = content.rules.coopScaling.bossIntentsPerExtraSeat;
  if (!boss.coopIntent || count === 0) return null;
  return `+${count} ${content.bossIntents.byId[boss.coopIntent]?.name ?? boss.coopIntent} per extra player`;
}

export function rankName(content: ContentRegistry, rank: string): string {
  return content.ranks.byId[rank]?.name ?? rank;
}

export function traitNames(content: ContentRegistry, piece: UnitDef | EnemyDef): string[] {
  return piece.traits.map((t) => content.traits.byId[t]?.name ?? t);
}

/** Case-insensitive match of every word of `query` against any of the fields. */
export function matchesQuery(query: string, fields: ReadonlyArray<string | null | undefined>): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(' \u0000 ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** The art library's card data for a content card (§16.7); `cost` is the printed cost. */
export function cardArtData(card: CardDef): CardArtData {
  return {
    id: card.id,
    name: card.name,
    type: card.type,
    cost: card.cost,
    rarity: card.rarity,
    text: card.text,
    flavor: card.flavor || undefined,
    art: { sigil: card.art.sigil, accent: card.art.accent },
    summonUnitId: card.unit ?? undefined,
  };
}

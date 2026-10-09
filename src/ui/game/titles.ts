/**
 * Words for the game's big moments (GDD §15.1–15.2): the Night title card, the boss intro, the
 * finale stats (MVP piece, totals) and the Last Flame Glory breakdown. Pure functions over the
 * engine state and the content registry.
 */
import type { BossDef, BossIntentDef, ContentRegistry, GameState, GloryReason, Standing } from '../../engine/types';
import { siteName } from './model';

export interface NightTitle {
  eyebrow: string;
  title: string;
  line: string;
}

/** "Night 1 · First Vigil — Survive 4 rounds. Keep the Candles lit." */
export function nightTitle(s: GameState, reg: ContentRegistry): NightTitle {
  const site = siteName(s, reg);
  const lastFlame = s.config.mode === 'last_flame';
  const bossName = s.boss ? (reg.bosses.byId[s.boss.id]?.name ?? 'the boss') : 'the boss';
  if (s.isBossNight) {
    return {
      eyebrow: 'The final Night',
      title: `Boss Night · ${site}`,
      line: lastFlame ? `${bossName} rises at the centre. The most Glory wins.` : `Slay ${bossName}. Keep the Candles lit.`,
    };
  }
  const rounds = s.roundsThisNight ?? s.config.turns_per_night;
  const eyebrow = `Night ${s.night} of ${s.config.nights}`;
  if (lastFlame) {
    const truce = s.lastFlame?.truce ? ' No fighting rivals tonight.' : '';
    return { eyebrow, title: `Night ${s.night} · ${site}`, line: `Survive ${rounds} rounds and win Glory.${truce}` };
  }
  return { eyebrow, title: `Night ${s.night} · ${site}`, line: `Survive ${rounds} rounds. Keep the Candles lit.` };
}

// =============================================================================================
// Boss intro
// =============================================================================================

export interface BossIntro {
  name: string;
  epithet: string;
  intents: BossIntentDef[];
  special: string;
  weakness: string;
}

export function bossIntro(def: BossDef, reg: ContentRegistry): BossIntro {
  const first = def.phases[0];
  const ids = first ? [...new Set(first.intents)] : [];
  return {
    name: def.name,
    epithet: def.epithet,
    intents: ids.map((id) => reg.bossIntents.byId[id]).filter((d): d is BossIntentDef => d !== undefined),
    special: def.specialText,
    weakness: def.weaknessText,
  };
}

// =============================================================================================
// Finale stats
// =============================================================================================

export interface MvpPiece {
  pieceId: string;
  defId: string;
  owner: number | null;
  damage: number;
  kills: number;
}

/** The Wickfolk piece with the most kills, then the most damage (§15.1 "MVP piece"). */
export function mvpPiece(s: GameState): MvpPiece | null {
  let best: MvpPiece | null = null;
  for (const [pieceId, entry] of Object.entries(s.stats.pieces)) {
    if (entry.owner === null) continue;
    const candidate = { pieceId, defId: entry.defId, owner: entry.owner, damage: entry.damage, kills: entry.kills };
    if (!best || candidate.kills > best.kills || (candidate.kills === best.kills && candidate.damage > best.damage)) best = candidate;
  }
  return best && (best.kills > 0 || best.damage > 0) ? best : null;
}

export interface RunTotals {
  kills: number;
  damage: number;
  plumesBlocked: number;
  candlesSaved: number;
  nights: number;
}

export function runTotals(s: GameState, won: boolean): RunTotals {
  const sum = (pick: (p: GameState['players'][number]) => number): number => s.players.reduce((total, p) => total + pick(p), 0);
  return {
    kills: sum((p) => p.stats.kills),
    damage: Math.round(sum((p) => p.stats.damageDealt)),
    plumesBlocked: sum((p) => p.stats.plumesBlocked),
    candlesSaved: s.stats.candlesSaved,
    nights: s.stats.nightsCompleted + (won ? 1 : 0),
  };
}

// =============================================================================================
// Last Flame Glory
// =============================================================================================

export const GLORY_LABELS: Readonly<Record<GloryReason, string>> = {
  snuff_kill: 'Snuff slain',
  rival_unit: 'Rival units',
  rival_hero: 'Rival heroes',
  bounty: 'Bounties',
  shrine: 'Shrines lit',
  boss_damage: 'Boss damage',
  boss_kill: 'Killing blow',
  survival: 'Still standing',
  hero_fell: 'Falls',
  effect: 'Other',
};

/** The non-zero Glory lines of a standing, in the order of the GDD's Glory table. */
export function gloryLines(st: Standing): Array<{ reason: GloryReason; label: string; amount: number }> {
  return (Object.keys(GLORY_LABELS) as GloryReason[]).filter((r) => (st.breakdown[r] ?? 0) !== 0).map((reason) => ({ reason, label: GLORY_LABELS[reason], amount: st.breakdown[reason] }));
}

export function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

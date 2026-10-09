/**
 * Keeps the reference tables of docs/RULES.md in step with the content files (src/content/*.json).
 *
 *   npx tsx scripts/rules-tables.ts           # rewrite the generated tables in docs/RULES.md
 *   npx tsx scripts/rules-tables.ts --check   # exit 1 if docs/RULES.md is out of date (CI)
 *
 * Each table sits between `<!-- generated:<name> -->` and `<!-- /generated:<name> -->` markers;
 * everything outside the markers is hand-written and left alone. The tables use the same
 * plain-language helpers as the Codex (src/ui/model/describe.ts), so the doc and the game agree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBaseContent } from '../src/engine/content';
import type { BossDef, ContentRegistry, EnemyDef } from '../src/engine/types';
import { bossCoopIntentText, bossHpSummary, heroView, moveSummary, patternSummary, rankName } from '../src/ui/model/describe';

export const RULES_DOC = fileURLToPath(new URL('../docs/RULES.md', import.meta.url));

type Row = readonly (string | number)[];

/** A Markdown table; `|` inside a cell is escaped. */
export function markdownTable(header: Row, rows: readonly Row[]): string {
  const cell = (value: string | number): string => String(value).replace(/\|/g, '\\|');
  const line = (row: Row): string => `| ${row.map(cell).join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

/** Content texts carry engine notes in brackets ("(Expressed as immune: push, pull.)"); players don't need them. */
export function playerText(text: string): string {
  return text.replace(/\s*\((?:Expressed as|immune:)[^)]*\)/g, '').trim();
}

function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return value < 0 ? `−${-value}` : '0';
}

function onOff(value: boolean): string {
  return value ? 'On' : 'Off';
}

const ENEMY_HP_MOD_WORDS = { none: '—', non_minions: 'Soldiers, Elites, structures', all: 'Every Snuff' } as const;

function heroesTable(content: ContentRegistry): string {
  const rows = content.heroes.list.map((hero) => {
    const view = heroView(content, hero);
    return [
      `**${view.firstName}**, ${view.title}`,
      view.hp,
      view.atk,
      view.move,
      view.strike,
      `**${view.traitName}**: ${playerText(view.traitText)}`,
      `**${view.powerName}** (${view.powerCost} Flame): ${view.powerText}`,
    ];
  });
  return markdownTable(['Hero', 'HP', 'ATK', 'Moves', 'Strikes', 'Trait', 'Hero Power'], rows);
}

/** "Rook slide" reads wrong for a 1-pip rook rune that only steps: say "1 orthogonal step". */
function enemyMoves(content: ContentRegistry, enemy: EnemyDef): string {
  const singleStep = enemy.move.type === 'step' && enemy.move.dirs !== 'all' && enemy.rune !== 'rune_pawn';
  return singleStep ? patternSummary(enemy.move) : moveSummary(content, enemy);
}

function enemyRow(content: ContentRegistry, enemy: EnemyDef): Row {
  return [`**${enemy.name}**`, rankName(content, enemy.rank), enemy.hp, enemy.atk, enemyMoves(content, enemy), playerText(enemy.text)];
}

function enemiesTable(content: ContentRegistry): string {
  const rows = content.enemies.list.map((enemy) => enemyRow(content, enemy));
  return markdownTable(['Snuff', 'Rank', 'HP', 'ATK', 'Moves', 'Attack'], rows);
}

function bossPhases(content: ContentRegistry, boss: BossDef): string {
  const phases = boss.phases.map((phase, i) => {
    const intents = phase.intents.map((id) => content.bossIntents.byId[id]?.name ?? id).join(', ');
    return `${i + 1}: ${patternSummary(phase.move)}; ${intents}`;
  });
  const coop = bossCoopIntentText(content, boss);
  return [...phases, ...(coop ? [`Co-op: ${coop}`] : [])].join('<br>');
}

function bossesTable(content: ContentRegistry): string {
  const rows = content.bosses.list.map((boss) => [
    `**${boss.name}**<br>*${boss.epithet}*`,
    `Vigil: ${bossHpSummary(content, boss).vigil}<br>Last Flame: ${bossHpSummary(content, boss).lastFlame}`,
    boss.specialText,
    boss.weaknessText,
    bossPhases(content, boss),
  ]);
  return markdownTable(['Boss', 'HP', 'Special', 'Weakness', 'Phases: moves; intents'], rows);
}

function bossIntentsTable(content: ContentRegistry): string {
  const rows = content.bossIntents.list.map((intent) => [`**${intent.name}**`, content.bosses.byId[intent.boss]?.name ?? intent.boss, intent.text]);
  return markdownTable(['Intent', 'Boss', 'What it does'], rows);
}

function tilesTable(content: ContentRegistry): string {
  const tiles = content.tiles.list.map((tile) => [`**${tile.name}**`, tile.text]);
  const overlays = content.overlays.list.map((overlay) => [`**${overlay.name}**`, overlay.text]);
  const tokens = content.tokens.list.map((token) => [`**${token.name}**`, token.text]);
  return markdownTable(['Tile or token', 'Rule'], [...tiles, ...overlays, ...tokens]);
}

function statusesTable(content: ContentRegistry): string {
  return markdownTable(
    ['Status', 'Shown as', 'Rule'],
    content.statuses.list.map((status) => [`**${status.name}**`, status.shape, status.text]),
  );
}

function omensTable(content: ContentRegistry): string {
  const rows = [...content.omens.list].sort((a, b) => a.face - b.face).map((omen) => [omen.face, `**${omen.name}**`, omen.label, omen.text]);
  return markdownTable(['Face', 'Name', 'Top-bar label', 'This round'], rows);
}

function tollsTable(content: ContentRegistry): string {
  const order = { blessing: 0, curse: 1 } as const;
  const rows = [...content.tolls.list]
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((toll) => [`**${toll.name}**`, toll.kind === 'blessing' ? 'Blessing' : 'Curse', toll.text]);
  return markdownTable(['Toll', 'Kind', 'For the whole Night'], rows);
}

function chandleryTable(content: ContentRegistry): string {
  const boons = content.boons.list.map((boon) => [`**${boon.name}**`, 'Boon', boon.text]);
  const heirlooms = content.heirlooms.list.map((heirloom) => [`**${heirloom.name}**`, 'Heirloom', heirloom.text]);
  return markdownTable(['Name', 'Kind', 'Effect'], [...boons, ...heirlooms]);
}

function gloryTable(content: ContentRegistry): string {
  const glory = content.rules.glory;
  const snuff = content.ranks.list
    .filter((rank) => rank.glory !== null)
    .map((rank) => `${rank.name} ${signed(rank.glory ?? 0)}`)
    .join(', ');
  const rows: Row[] = [
    ['Slay a Snuff', snuff],
    ['Fell a rival unit', signed(glory.rivalUnit)],
    ['Fell a rival hero', signed(glory.rivalHero)],
    ['Bounty: fell the hero of the sole Glory leader', `${signed(glory.bounty)} more`],
    ['Light a Votive Shrine', signed(glory.shrine)],
    ['Damage the boss', `+1 per full ${glory.bossDamagePct}% of its max HP you dealt`],
    ['Land the boss killing blow', signed(glory.bossKill)],
    ['Still standing at the end', signed(glory.survival)],
    ['Your hero falls (any cause)', `${signed(glory.heroFalls)} (never below 0)`],
  ];
  return markdownTable(['Event', 'Glory'], rows);
}

/** Dawn recovery: −1 per lit Candle up to `dawnMax`; a cap of one Candle's worth reads as "while a Candle is lit". */
function dawnRow(dread: ContentRegistry['rules']['dread']): Row {
  if (dread.dawnMax <= -dread.dawnPerCandle) return ['Dawn of a regular Night, while a Candle is still lit', `${signed(-dread.dawnMax)} (never below 0)`];
  return ['Dawn of a regular Night, per Candle still lit', `${signed(dread.dawnPerCandle)}, at most ${signed(-dread.dawnMax)} (never below 0)`];
}

function dreadTable(content: ContentRegistry): string {
  const dread = content.rules.dread;
  const rows: Row[] = [
    ['A Vigil Candle is hit (each damage instance)', signed(dread.candleHit)],
    ['A Vigil Candle is snuffed (on top of the hit)', signed(dread.candleSnuffed)],
    ['A hero falls', signed(dread.heroFalls)],
    ['A hero relights itself at the Tally', signed(dread.selfRelight)],
    ['Each Tally on the Boss Night (the boss tolls)', signed(dread.bossToll)],
    dawnRow(dread),
  ];
  return markdownTable(['Event', 'Dread'], rows);
}

function lengthsTable(content: ContentRegistry): string {
  const rows = content.lengths.list.map((length) => [
    `**${length.name}**`,
    length.turns_per_night,
    `${length.vigil.nights} (${length.vigil.nights - 1} + Boss Night)`,
    `${length.last_flame.nights} (${length.last_flame.nights - 1} + Boss Night)`,
    length.last_flame.boss_rounds,
  ]);
  return markdownTable(['Length', 'Rounds per Night', 'Vigil Nights', 'Last Flame Nights', 'Last Flame boss rounds'], rows);
}

function difficultyTable(content: ContentRegistry): string {
  const rows = content.difficulty.list.map((d) => {
    const v = d.values;
    return [
      `**${d.name}**`,
      d.chip,
      `${v.starting_dread} / ${v.dread_max}`,
      `${signed(v.initial_enemies_mod)} / ${signed(v.plumes_mod)}`,
      ENEMY_HP_MOD_WORDS[v.enemy_hp_mod],
      `×${v.boss_hp_multiplier.toFixed(2)}`,
      v.heal_between_nights,
      onOff(v.extra_smokestack),
      onOff(v.retry_night),
    ];
  });
  return markdownTable(['Difficulty', 'Chip', 'Dread start / max', 'Enemies / Plumes', '+1 HP to', 'Boss HP', 'Heal at Dawn', 'Extra Smokestack', 'Retry'], rows);
}

/** Every generated table of docs/RULES.md, by marker name. */
export function rulesTables(content: ContentRegistry): Readonly<Record<string, string>> {
  return {
    heroes: heroesTable(content),
    enemies: enemiesTable(content),
    bosses: bossesTable(content),
    boss_intents: bossIntentsTable(content),
    tiles: tilesTable(content),
    statuses: statusesTable(content),
    omens: omensTable(content),
    tolls: tollsTable(content),
    chandlery: chandleryTable(content),
    glory: gloryTable(content),
    dread: dreadTable(content),
    lengths: lengthsTable(content),
    difficulty: difficultyTable(content),
  };
}

const BLOCK = /(<!-- generated:([a-z_]+) -->)[\s\S]*?(<!-- \/generated:\2 -->)/g;

/**
 * The document with each generated block replaced by its table. Throws on a marker without a
 * table, or a table without a marker, so a renamed section never goes stale silently.
 */
export function fillTables(doc: string, tables: Readonly<Record<string, string>>): string {
  const seen = new Set<string>();
  const out = doc.replace(BLOCK, (_whole, open: string, name: string, close: string) => {
    const table = tables[name];
    if (table === undefined) throw new Error(`docs/RULES.md has a generated block "${name}" with no table`);
    seen.add(name);
    return `${open}\n${table}\n${close}`;
  });
  const missing = Object.keys(tables).filter((name) => !seen.has(name));
  if (missing.length > 0) throw new Error(`docs/RULES.md is missing generated blocks: ${missing.join(', ')}`);
  return out;
}

function main(argv: readonly string[]): number {
  const check = argv.includes('--check');
  const doc = readFileSync(RULES_DOC, 'utf8');
  const next = fillTables(doc, rulesTables(loadBaseContent()));
  if (check) {
    if (next === doc) return 0;
    console.error('docs/RULES.md is out of date with src/content. Run: npx tsx scripts/rules-tables.ts');
    return 1;
  }
  if (next !== doc) writeFileSync(RULES_DOC, next);
  console.log(next === doc ? 'docs/RULES.md is up to date.' : 'docs/RULES.md tables updated.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

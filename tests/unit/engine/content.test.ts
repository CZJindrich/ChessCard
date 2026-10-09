import { describe, expect, it } from 'vitest';
import {
  BASE_CONTENT_FILES,
  buildRegistry,
  contentHash,
  CUSTOM_OP_DOCS,
  deriveRunes,
  getContent,
  loadBaseContent,
  mergeMod,
  MOD_SIZE_LIMIT,
  reasonText,
  registryToFiles,
  setContent,
  starterDeckIds,
} from '../../../src/engine/content';
import { parseSq, chebyshev, rotate90 } from '../../../src/engine/geometry';
import { CUSTOM_OP_IDS, REASON_CODES, TRAIT_IDS } from '../../../src/engine/types';
import type { ContentRegistry, EffectOfOp } from '../../../src/engine/types';

const content = loadBaseContent();
const ids = (table: { list: Array<{ id: string }> }) => table.list.map((e) => e.id);
const sorted = (list: readonly string[]) => [...list].sort();

describe('base content', () => {
  it('validates with zero errors', () => {
    const { registry, errors } = buildRegistry(BASE_CONTENT_FILES);
    expect(errors).toEqual([]);
    expect(registry).not.toBeNull();
  });

  it('is deep-frozen', () => {
    expect(Object.isFrozen(content.cards.byId.spark)).toBe(true);
    expect(Object.isFrozen(content.cards.byId.spark.effects[0])).toBe(true);
  });

  it('getContent returns the base registry until setContent replaces it', () => {
    expect(contentHash(getContent())).toBe(contentHash(content));
    const modded = mergeMod(content, { cards: [{ id: 'spark', cost: 0 }] }).registry;
    setContent(modded);
    expect(getContent().cards.byId.spark.cost).toBe(0);
    setContent(null);
    expect(getContent().cards.byId.spark.cost).toBe(1);
  });
});

describe('every GDD id exists (Engineering summary)', () => {
  it('heroes, powers and traits', () => {
    expect(ids(content.heroes)).toEqual(['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist']);
    expect(ids(content.powers)).toEqual(['lantern_oath', 'flutterswap', 'castle', 'shadowstep']);
    expect(content.heroes.list.map((h) => h.trait)).toEqual(['stalwart', 'mothmaker', 'quick_build', 'flourish']);
    expect(content.heroes.list.map((h) => h.power)).toEqual(['lantern_oath', 'flutterswap', 'castle', 'shadowstep']);
    expect(sorted(ids(content.traits))).toEqual(
      sorted([
        'stalwart', 'mothmaker', 'quick_build', 'flourish',
        'promotion', 'censer', 'shieldbearer', 'battering', 'webs', 'heavy', 'pop', 'twin_knives',
        'crown', 'wax_pool', 'belch',
      ]),
    );
    expect(sorted(ids(content.traits))).toEqual(sorted(TRAIT_IDS));
  });

  it('units', () => {
    expect(ids(content.units)).toEqual([
      'taper', 'taper_captain', 'wickhorse', 'incense_acolyte', 'sconce_squire', 'brass_ram', 'velvet_moth',
      'silkspinner', 'lantern', 'wick_mortar', 'bellows_golem', 'cinderling', 'twinwick',
    ]);
  });

  it('cards: 12 neutral and 7 per class', () => {
    const byClass = (cls: string | null) => content.cards.list.filter((c) => c.class === cls).map((c) => c.id);
    expect(byClass(null)).toEqual([
      'spark', 'light_a_taper', 'mend_the_wick', 'quickwick', 'beeswax_seal', 'saddle_the_wickhorse',
      'ordain_an_acolyte', 'flare', 'rally_the_captain', 'turnabout', 'kindle_hope', 'dawnbreak',
    ]);
    expect(byClass('sconce_paladin')).toEqual([
      'shield_bash', 'waxen_ward', 'call_the_squire', 'sunshield_charge', 'muster_the_ram', 'oath_of_tallow', 'aegis_of_dawn',
    ]);
    expect(byClass('moth_witch')).toEqual([
      'loose_a_moth', 'velvet_pull', 'moth_dust', 'cocoon', 'spin_the_silk', 'moonlit_hex', 'swarm_of_wings',
    ]);
    expect(byClass('lampwright')).toEqual([
      'tinder_bolt', 'hang_a_lantern', 'trim_the_wicks', 'prime_the_mortar', 'lens_of_brass', 'stoke_the_golem', 'grand_illumination',
    ]);
    expect(byClass('ember_duelist')).toEqual([
      'strike_a_cinder', 'feint', 'searing_edge', 'hire_a_twinwick', 'ember_waltz', 'riposte', 'crimson_finale',
    ]);
    expect(content.cards.list).toHaveLength(40);
  });

  it('enemies, bosses and boss intents', () => {
    expect(ids(content.enemies)).toEqual([
      'sootling', 'gnawmoth', 'smokehound', 'ink_wretch', 'hush_monk', 'ash_deacon', 'knell_banshee',
      'gutter_pawn', 'drip_hulk', 'snuffer_knight', 'hollow_lamplighter', 'smokestack', 'clapper',
    ]);
    expect(ids(content.bosses)).toEqual(['hush_hierophant', 'guttered_king', 'nocturna']);
    expect(ids(content.bossIntents)).toEqual([
      'bell_drop', 'hushwave', 'silencing_peal', 'ladle_slam', 'sceptre_sweep', 'wax_spit', 'wing_gust', 'hunger', 'dust_storm',
    ]);
  });

  it('tolls, omens, heirlooms and boons', () => {
    const tolls = (kind: string) => content.tolls.list.filter((t) => t.kind === kind).map((t) => t.id);
    expect(tolls('blessing')).toEqual(['candlemas_blessing', 'lucky_wick', 'hearthwind', 'peddler_of_wicks', 'moth_migration']);
    expect(tolls('curse')).toEqual([
      'soot_fog', 'bell_of_embers', 'waxen_rain', 'ill_omen', 'crumbling_nave', 'restless_soot', 'shifting_chimneys', 'muffled_nave', 'black_sun',
    ]);
    expect(content.omens.list.map((o) => [o.face, o.id, o.label])).toEqual([
      [1, 'eclipse', 'Snuff hit +1'],
      [2, 'smoke', 'Extra Plume'],
      [3, 'stillness', 'Calm'],
      [4, 'long_shadows', 'Slow Snuff'],
      [5, 'kindling', '+1 Flame'],
      [6, 'bright_wings', 'Draw +1'],
    ]);
    expect(ids(content.heirlooms)).toEqual([
      'ever_burning_wick', 'brass_thimble', 'lamplighters_hook', 'moth_velvet_cloak', 'candlemakers_mold', 'bell_of_saint_tallow',
    ]);
    expect(ids(content.boons)).toEqual(['heirloom', 'temper', 'prune']);
  });

  it('board vocabularies, sites and maps', () => {
    expect(ids(content.tiles)).toEqual(['flagstone', 'pillar', 'rubble', 'votive_shrine', 'chimney', 'hot_wax']);
    expect(ids(content.overlays)).toEqual(['gloam', 'gloam_warning', 'vigil_candle', 'smoldering_wick']);
    expect(ids(content.tokens)).toEqual(['smoke_plume', 'lit_shrine', 'first_light', 'crown_socket', 'bounty_seal']);
    expect(ids(content.statuses)).toEqual(['ward', 'burn', 'dazed']);
    expect(ids(content.sites)).toEqual(['cathedral_of_tallow', 'soot_market', 'belfry_steps', 'the_waxworks']);
    expect(ids(content.maps)).toEqual(['first_vigil', 'hollow_nave', 'last_flame_ring']);
  });

  it('other registries (A.1)', () => {
    expect(ids(content.difficulty)).toEqual(['candlelit', 'dusk', 'midnight', 'witching_hour']);
    expect(ids(content.lengths)).toEqual(['short', 'standard', 'long']);
    expect(ids(content.houses)).toEqual(['house_beeswax', 'house_tallow', 'house_bayberry', 'house_rushlight']);
    expect(ids(content.bots)).toEqual(['bot_apprentice', 'bot_warden', 'bot_elder']);
    expect(ids(content.ranks)).toEqual(['minion', 'soldier', 'elite', 'structure', 'boss', 'hero', 'unit']);
    expect(ids(content.runes)).toEqual([
      'rune_crown', 'rune_horse', 'rune_tower', 'rune_mitre', 'rune_star', 'rune_pawn', 'rune_wing', 'rune_arc', 'rune_bolt', 'rune_anchor',
    ]);
    expect(sorted(ids(content.reasons))).toEqual(sorted(REASON_CODES));
    expect(CUSTOM_OP_IDS).toEqual(expect.arrayContaining(['smothered_mate', 'devour_light', 'hollow_bell']));
    expect(Object.keys(CUSTOM_OP_DOCS).sort()).toEqual([...CUSTOM_OP_IDS].sort());
  });
});

describe('numbers match the GDD', () => {
  it('heroes (§8.1)', () => {
    const row = (id: string) => {
      const h = content.heroes.byId[id];
      return [h.displayName, h.hp, h.atk, h.powerCost, h.flame];
    };
    expect(row('sconce_paladin')).toEqual(['Brannoc, the Sconce Paladin', 8, 2, 2, '#F4B942']);
    expect(row('moth_witch')).toEqual(['Velveteen, the Moth Witch', 6, 2, 2, '#F09AD0']);
    expect(row('lampwright')).toEqual(['Wicklow, the Lampwright', 6, 2, 1, '#5FE0C8']);
    expect(row('ember_duelist')).toEqual(['Vey, the Ember Duelist', 6, 2, 1, '#FFF3C4']);
    expect(content.heroes.byId.ember_duelist.flameEdge).toBe('#E8742C');
    expect(content.heroes.byId.moth_witch.attack.take).toBe(false);
    expect(content.heroes.byId.sconce_paladin.immune).toEqual(['push', 'pull']);
    expect(content.heroes.byId.lampwright.attack).toMatchObject({ kind: 'ranged', dirs: 'orth', range: 4, firstHit: true });
    expect(content.heroes.byId.ember_duelist.move).toMatchObject({ type: 'slide', dirs: 'diag', range: 3 });
    expect(content.heroes.byId.moth_witch.pitch).toBe('Leaps and strikes like a knight. Her kills become moths.');
    for (const hero of content.heroes.list) expect(`${hero.name}, ${hero.title}`).toBe(hero.displayName);
  });

  it('units (§8.2)', () => {
    const table = Object.fromEntries(content.units.list.map((u) => [u.id, [u.hp, u.atk, u.traits.join(), u.card]]));
    expect(table).toEqual({
      taper: [1, 1, 'promotion', 'light_a_taper'],
      taper_captain: [2, 2, '', 'rally_the_captain'],
      wickhorse: [2, 2, '', 'saddle_the_wickhorse'],
      incense_acolyte: [2, 1, 'censer', 'ordain_an_acolyte'],
      sconce_squire: [3, 1, 'shieldbearer', 'call_the_squire'],
      brass_ram: [4, 2, 'battering', 'muster_the_ram'],
      velvet_moth: [1, 1, '', 'loose_a_moth'],
      silkspinner: [2, 1, 'webs', 'spin_the_silk'],
      lantern: [2, 1, '', 'hang_a_lantern'],
      wick_mortar: [2, 2, '', 'prime_the_mortar'],
      bellows_golem: [5, 2, 'heavy', 'stoke_the_golem'],
      cinderling: [1, 1, 'pop', 'strike_a_cinder'],
      twinwick: [2, 1, 'twin_knives', 'hire_a_twinwick'],
    });
    expect(content.units.byId.lantern).toMatchObject({ structure: true, lightRadius: 3 });
    expect(content.units.byId.wick_mortar.attack).toMatchObject({ kind: 'artillery', minRange: 2, range: 4, los: false });
    expect(content.units.byId.twinwick.attack.times).toBe(2);
    expect(content.units.byId.silkspinner.attack.status).toBe('dazed');
    expect(content.units.byId.brass_ram.attack.push).toBe(2);
    expect(content.units.byId.sconce_squire.startStatuses).toEqual(['ward']);
    expect(content.units.byId.velvet_moth.move.flying).toBe(true);
  });

  it('cards: type, cost and rarity (§7.3)', () => {
    const expected: Record<string, [string, number, string]> = {
      spark: ['rite', 1, 'common'], light_a_taper: ['summon', 1, 'common'], mend_the_wick: ['rite', 1, 'common'],
      quickwick: ['rite', 0, 'common'], beeswax_seal: ['charm', 1, 'common'], saddle_the_wickhorse: ['summon', 2, 'common'],
      ordain_an_acolyte: ['summon', 2, 'common'], flare: ['rite', 2, 'common'], rally_the_captain: ['summon', 2, 'rare'],
      turnabout: ['rite', 1, 'rare'], kindle_hope: ['rite', 2, 'rare'], dawnbreak: ['rite', 4, 'mythic'],
      shield_bash: ['rite', 1, 'common'], waxen_ward: ['rite', 1, 'common'], call_the_squire: ['summon', 1, 'common'] /* E5 balance pass; GDD §7.3 says 2 */,
      sunshield_charge: ['rite', 2, 'common'], muster_the_ram: ['summon', 3, 'rare'], oath_of_tallow: ['charm', 2, 'rare'],
      aegis_of_dawn: ['rite', 3, 'mythic'],
      loose_a_moth: ['summon', 1, 'common'], velvet_pull: ['rite', 1, 'common'], moth_dust: ['rite', 2, 'common'],
      cocoon: ['charm', 1, 'common'], spin_the_silk: ['summon', 2, 'common'], moonlit_hex: ['rite', 3, 'rare'],
      swarm_of_wings: ['rite', 4, 'mythic'],
      tinder_bolt: ['rite', 1, 'common'], hang_a_lantern: ['summon', 2, 'common'], trim_the_wicks: ['rite', 1, 'common'],
      prime_the_mortar: ['summon', 3, 'common'], lens_of_brass: ['charm', 2, 'rare'], stoke_the_golem: ['summon', 4, 'rare'],
      grand_illumination: ['rite', 4, 'mythic'],
      strike_a_cinder: ['summon', 1, 'common'], feint: ['rite', 1, 'common'], searing_edge: ['rite', 1, 'common'],
      hire_a_twinwick: ['summon', 2, 'common'], ember_waltz: ['rite', 2, 'common'], riposte: ['charm', 1, 'rare'],
      crimson_finale: ['rite', 3, 'mythic'],
    };
    expect(Object.fromEntries(content.cards.list.map((c) => [c.id, [c.type, c.cost, c.rarity]]))).toEqual(expected);
    const rarity = (r: string) => content.cards.list.filter((c) => c.rarity === r).length;
    expect([rarity('common'), rarity('rare'), rarity('mythic')]).toEqual([26, 9, 5]);
  });

  it('card targets and effects use the effect-op DSL', () => {
    const shieldBash = content.cards.byId.shield_bash;
    expect(shieldBash.target).toMatchObject({ kind: 'piece', side: 'enemy', range: { from: 'hero', max: 1 } });
    expect(shieldBash.effects).toEqual([
      { op: 'damage', amount: 2 },
      { op: 'push', distance: 2, from: 'hero', ifSurvives: true },
    ]);
    expect(content.cards.byId.tinder_bolt.target.line).toEqual({ dirs: 'orth', firstHit: true });
    expect(content.cards.byId.moonlit_hex.target.ranks).toEqual(['minion', 'soldier']);
    expect(content.cards.byId.quickwick.temperedEffects).toEqual([{ op: 'extra_move', amount: 2 }]);
    expect(content.cards.byId.kindle_hope.modes?.map((m) => m.label)).toEqual(['Relight', 'Heal']);
    expect(content.cards.byId.lens_of_brass.charm).toEqual({ atk: 1, maxHp: 0, range: 2, triggers: [] });
    for (const card of content.cards.list.filter((c) => c.type === 'summon')) {
      expect(card.target).toMatchObject({ kind: 'tile', range: { from: 'hero', max: 2 }, empty: true, noPlume: true });
      expect(card.effects[0]).toMatchObject({ op: 'summon', unit: card.unit });
    }
  });

  it('enemies (§9.2)', () => {
    const table = Object.fromEntries(
      content.enemies.list.map((e) => [e.id, [e.rank, e.hp, e.atk, e.ai.prefers, `${e.weight[1]}/${e.weight[2]}/${e.weight[3]}`]]),
    );
    expect(table).toEqual({
      sootling: ['minion', 1, 1, 'candles', '4/3/2'],
      gnawmoth: ['minion', 1, 1, 'light', '2/2/1'],
      smokehound: ['soldier', 2, 1, 'heroes', '1/2/2'],
      ink_wretch: ['soldier', 2, 1, 'candles', '2/2/1'],
      hush_monk: ['soldier', 3, 1, 'heroes', '0/2/2'],
      ash_deacon: ['soldier', 2, 1, 'clusters', '0/1/2'],
      knell_banshee: ['elite', 4, 2, 'heroes', '0/0/1'],
      gutter_pawn: ['minion', 2, 1, 'candles', '0/0/0'],
      drip_hulk: ['elite', 6, 2, 'nearest', '0/0/1'],
      snuffer_knight: ['elite', 4, 2, 'heroes', '0/1/2'],
      hollow_lamplighter: ['elite', 5, 2, 'light', '0/0/1'],
      smokestack: ['structure', 4, 0, null, '0/0/0'],
      clapper: ['elite', 5, 2, 'heroes', '0/0/0'],
    });
    for (const enemy of content.enemies.list) expect(enemy.glory).toBe(content.ranks.byId[enemy.rank].glory);
    expect(content.enemies.byId.hush_monk.attack).toMatchObject({ area: 'ring8', centered: true, status: 'dazed', reach: null });
    expect(content.enemies.byId.ash_deacon.attack).toMatchObject({ kind: 'artillery', area: 'plus5', minRange: 2, range: 4 });
    expect(content.enemies.byId.knell_banshee.attack).toMatchObject({ dirs: 'diag', range: 3, pierce: true });
  });

  it('bosses and their intents (§10)', () => {
    const boss = (id: string) => content.bosses.byId[id];
    // Base HP retuned so the three solo Boss Nights land near the same win rate (E5).
    expect([boss('hush_hierophant').hp, boss('guttered_king').hp, boss('nocturna').hp]).toEqual([
      { base: 25, perPlayer: 10 },
      { base: 48, perPlayer: 12 },
      { base: 10, perPlayer: 11 },
    ]);
    expect(boss('hush_hierophant').phases.map((p) => p.intents)).toEqual([
      ['bell_drop', 'hushwave'],
      ['bell_drop', 'hushwave', 'silencing_peal'],
      ['bell_drop', 'bell_drop', 'hushwave', 'silencing_peal'],
    ]);
    expect(boss('guttered_king').phases.map((p) => p.enterAt)).toEqual([null, [2, 3], [1, 3]]);
    expect(boss('guttered_king').special).toEqual({ op: 'custom', id: 'smothered_mate', args: { damagePct: 15, maxCrowns: 3 } });
    expect(boss('nocturna').flying).toBe(true);
    // Vigil co-op: each seat beyond the first adds one more of these at every Snuff Move (§10.1).
    expect(content.bosses.list.map((b) => [b.id, b.coopIntent])).toEqual([
      ['hush_hierophant', 'bell_drop'],
      ['guttered_king', 'sceptre_sweep'],
      ['nocturna', 'dust_storm'],
    ]);
    expect(content.rules.coopScaling).toEqual({ enemiesPerExtraSeat: 1, plumesPerExtraSeat: 1, bossHpPerExtraSeat: 1, bossIntentsPerExtraSeat: 1 });
    const kingSummon = boss('guttered_king').phases[1].onEnter[0] as EffectOfOp<'summon'>;
    expect(kingSummon).toMatchObject({ unit: 'gutter_pawn', count: { byPlayers: [1, 1, 2, 2] }, modeOverrides: { last_flame: { unit: 'drip_hulk' } } });
    const intents = Object.fromEntries(content.bossIntents.list.map((i) => [i.id, [i.area, i.damage]]));
    expect(intents).toEqual({
      bell_drop: ['block2x2', 3], hushwave: ['ring12', 1], silencing_peal: ['global', 0], ladle_slam: ['side2', 3],
      sceptre_sweep: ['beam2', 2], wax_spit: ['single', 1], wing_gust: ['beam2', 1], hunger: ['single', 3], dust_storm: ['square3', 1],
    });
    expect(content.bossIntents.byId.hushwave.reversible).toBe(false);
    expect(content.bossIntents.byId.hunger.extra).toEqual({ op: 'custom', id: 'devour_light', args: { heal: 2 } });
  });

  it('difficulty and length presets (§14.2-14.3)', () => {
    const v = (id: string) => content.difficulty.byId[id].values;
    expect(v('candlelit')).toEqual({
      starting_dread: 0, dread_max: 14, initial_enemies_mod: -1, plumes_mod: -1, enemy_hp_mod: 'none',
      boss_hp_multiplier: 0.8, heal_between_nights: 6, extra_smokestack: false, retry_night: true,
    });
    expect(v('midnight')).toMatchObject({ starting_dread: 1, dread_max: 12, enemy_hp_mod: 'non_minions', boss_hp_multiplier: 1.2, retry_night: false });
    expect(v('witching_hour')).toMatchObject({ starting_dread: 2, dread_max: 12, plumes_mod: 0, enemy_hp_mod: 'all', boss_hp_multiplier: 1.3, retry_night: false });
    expect(content.rules.dread).toMatchObject({ dawnPerCandle: -1, dawnMax: 1 });
    expect(content.lengths.list.map((l) => [l.id, l.vigil.nights, l.last_flame.nights, l.last_flame.boss_rounds])).toEqual([
      ['short', 3, 3, 5],
      ['standard', 4, 4, 5],
      ['long', 6, 5, 6],
    ]);
  });

  it('houses and tolls requirements', () => {
    expect(content.houses.list.map((h) => [h.seat, h.color])).toEqual([
      [1, '#E09A2D'],
      [2, '#E6D9B8'],
      [3, '#7FAF5A'],
      [4, '#5B8DEF'],
    ]);
    expect(content.tolls.byId.ill_omen.requires).toEqual(['moth_die']);
    expect(content.tolls.byId.black_sun.effects[0]).toEqual({ op: 'modify_rule', rule: 'plumes_per_placement', delta: 1, duration: 'night' });
    expect(content.tolls.list.filter((t) => t.kind === 'curse').every((t) => t.reward === 'chandlery_take_two')).toBe(true);
  });

  it('flavour text exists and fits 90 characters', () => {
    const flavoured = [
      ...content.heroes.list, ...content.units.list, ...content.cards.list, ...content.enemies.list,
      ...content.bosses.list, ...content.tolls.list, ...content.heirlooms.list,
    ];
    for (const entry of flavoured) {
      expect(entry.flavor.length, entry.id).toBeGreaterThan(10);
      expect(entry.flavor.length, entry.id).toBeLessThanOrEqual(90);
    }
  });

  it('explicit runes match the movement data', () => {
    for (const piece of [...content.heroes.list, ...content.units.list, ...content.enemies.list]) {
      expect(deriveRunes(piece.move, piece.attack), piece.id).toEqual({ rune: piece.rune, pips: piece.pips, strikeRune: piece.strikeRune });
    }
  });
});

describe('deck composition (§7.2)', () => {
  it('every starting deck is spark x2, light_a_taper, mend_the_wick and 3 class starters x2', () => {
    for (const hero of content.heroes.list) {
      const deck = starterDeckIds(hero.id, content);
      expect(deck).toHaveLength(10);
      const counts = deck.reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});
      expect(counts).toEqual({
        spark: 2,
        light_a_taper: 1,
        mend_the_wick: 1,
        ...Object.fromEntries(hero.starters.map((id) => [id, 2])),
      });
      expect(deck.length).toBeGreaterThanOrEqual(content.rules.deckMin);
    }
  });

  it('each class has exactly 3 starters, matching the hero', () => {
    for (const hero of content.heroes.list) {
      const starters = content.cards.list.filter((c) => c.class === hero.id && c.starter).map((c) => c.id);
      expect(starters).toEqual(hero.starters);
    }
    expect(content.heroes.byId.lampwright.starters).toEqual(['tinder_bolt', 'hang_a_lantern', 'prime_the_mortar']);
  });
});

describe('maps (§13.3.4, §15.2)', () => {
  const layout = (map: string, size: string) => {
    const found = content.maps.byId[map].layouts.find((l) => l.size === size);
    if (!found) throw new Error(`${map} ${size}`);
    return found;
  };

  it('first_vigil scripted openings: each Sootling is adjacent to the Candle it aims at', () => {
    const map = content.maps.byId.first_vigil;
    const candles = layout('first_vigil', '8x8').candles;
    expect(candles).toEqual(['c3', 'f3', 'g5']);
    expect(Object.keys(map.tutorial ?? {})).toEqual(['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist']);
    for (const opening of Object.values(map.tutorial ?? {})) {
      expect(opening.hand).toHaveLength(5);
      for (const s of opening.sootlings) {
        expect(candles).toContain(s.aim);
        const at = parseSq(s.at);
        const aim = parseSq(s.aim);
        expect(at && aim && chebyshev(at, aim)).toBe(1);
      }
    }
    expect(layout('first_vigil', '8x8').plumes).toEqual([
      { at: 'c6', enemy: 'sootling', tally: 0 },
      { at: 'f6', enemy: 'sootling', tally: 1 },
      { at: 'b6', enemy: 'ink_wretch', tally: 2 },
    ]);
  });

  it('hollow_nave layouts', () => {
    expect(layout('hollow_nave', '8x8')).toMatchObject({ bossAnchor: 'd6', pillars: ['b6', 'g6'], candles: ['b4', 'e3', 'g4'] });
    expect(layout('hollow_nave', '10x10')).toMatchObject({ bossAnchor: 'e7', shrines: ['a3', 'j3'], heroStarts: ['e1', 'f1', 'd1', 'g1'] });
  });

  it('last_flame_ring has 4-fold rotational symmetry', () => {
    for (const size of ['10x10', '12x12'] as const) {
      const l = layout('last_flame_ring', size);
      const key = (names: string[]) => names.map((n) => JSON.stringify(parseSq(n))).sort();
      const rotated = (names: string[]) =>
        names.map((n) => {
          const p = parseSq(n);
          if (!p) throw new Error(n);
          return JSON.stringify(rotate90(p, l.w));
        }).sort();
      for (const group of [l.pillars, l.shrines, l.rubble, l.chimneys.flat(), l.heroStarts]) {
        expect(rotated(group)).toEqual(key(group));
      }
    }
    expect(layout('last_flame_ring', '12x12')).toMatchObject({ bossAnchor: 'f6', finalZone: ['e5', 'h8'], heroStarts2: ['c3', 'j10'] });
    expect(layout('last_flame_ring', '10x10')).toMatchObject({ bossAnchor: 'e5', finalZone: ['d4', 'g7'], heroStarts2: ['c3', 'h8'] });
  });
});

describe('mods (A.3)', () => {
  const errorsOf = (mod: unknown, base: ContentRegistry = content) => mergeMod(base, mod).errors;

  it('patches an existing entry and changes the hash', () => {
    const result = mergeMod(content, { cards: [{ id: 'spark', cost: 0, effects: [{ op: 'damage', amount: 2 }] }] });
    expect(result.errors).toEqual([]);
    expect(result.registry.cards.byId.spark.cost).toBe(0);
    expect(result.registry.cards.byId.spark.effects).toEqual([{ op: 'damage', amount: 2 }]);
    expect(result.registry.cards.byId.spark.text).toBe(content.cards.byId.spark.text);
    expect(contentHash(result.registry)).not.toBe(contentHash(content));
    expect(content.cards.byId.spark.cost).toBe(1);
  });

  it('adds new entries that reference existing ids and custom ops', () => {
    const result = mergeMod(content, {
      cards: [
        {
          id: 'lantern_storm', name: 'Lantern Storm', type: 'rite', cost: 5, rarity: 'mythic', class: 'lampwright', starter: false,
          target: { kind: 'board' }, effects: [{ op: 'custom', id: 'lantern_volley', damage: 3, range: 5 }],
          text: 'Every Lantern fires twice as hard.', flavor: 'The whole nave rings with glass.',
          art: { sigil: ['lantern', 'burst'], accent: '#5FE0C8' },
        },
      ],
    });
    expect(result.errors).toEqual([]);
    expect(result.registry.cards.byId.lantern_storm.effects[0]).toEqual({ op: 'custom', id: 'lantern_volley', args: { damage: 3, range: 5 } });
  });

  it('reports schema errors with file and path', () => {
    expect(errorsOf({ cards: [{ id: 'spark', cost: 12 }] })).toEqual([{ file: 'cards', path: 'spark.cost', message: 'must be 0-9 (got 12)' }]);
    expect(errorsOf({ units: [{ id: 'taper', hp: 0 }] })[0]).toMatchObject({ file: 'units', path: 'taper.hp' });
    expect(errorsOf({ cards: [{ id: 'spark', costt: 1 }] })[0]).toMatchObject({ file: 'cards', path: 'spark.costt', message: 'unknown key "costt"' });
    expect(errorsOf({ units: [{ id: 'lantern', attack: { kind: 'ranged', range: 4, take: true } }] })[0]).toMatchObject({
      path: 'lantern.attack.take',
      message: 'take is allowed only when kind is melee',
    });
    expect(errorsOf({ units: [{ id: 'wick_mortar', attack: { kind: 'artillery', range: 4, los: true } }] })[0].message).toBe(
      'artillery forces los: false',
    );
    expect(errorsOf({ units: [{ id: 'lantern', attack: { kind: 'ranged', range: 4, firstHit: true, pierce: true } }] })[0].message).toBe(
      'firstHit and pierce are mutually exclusive',
    );
    expect(errorsOf({ heroes: [{ id: 'lampwright', move: { type: 'slide', dirs: 'orth', range: 13 } }] })[0]).toMatchObject({
      path: 'lampwright.move.range',
    });
  });

  it('reports reference errors (pass 2)', () => {
    expect(errorsOf({ cards: [{ id: 'light_a_taper', effects: [{ op: 'summon', unit: 'tapir' }] }] })).toContainEqual({
      file: 'cards',
      path: 'light_a_taper.effects[0].unit',
      message: 'unknown unit "tapir"',
    });
    expect(errorsOf({ bosses: [{ id: 'nocturna', phases: [{ move: { type: 'step' }, intents: ['bell_drop'] }] }] })).toContainEqual({
      file: 'bosses',
      path: 'nocturna.phases[0].intents',
      message: 'intent "bell_drop" belongs to "hush_hierophant"',
    });
    expect(errorsOf({ cards: [{ id: 'feint', starter: false, starterCopies: 0 }] })).toContainEqual({
      file: 'cards',
      path: '',
      message: 'class "ember_duelist" needs exactly 3 starters (has 2)',
    });
    expect(errorsOf({ cards: [{ id: 'dawnbreak', $remove: true }] })).toEqual([]);
    expect(errorsOf({ cards: [{ id: 'shield_bash', $remove: true }] }).length).toBeGreaterThan(0);
    expect(errorsOf({ maps: [{ id: 'first_vigil', layouts: [{ size: '8x8', w: 8, h: 8, pillars: ['i9'], heroStarts: ['d1'] }] }] })[0]).toMatchObject({
      file: 'maps',
    });
    expect(errorsOf({ tolls: [{ id: 'hunger', name: 'Dup', kind: 'curse', effects: [], text: 'x', flavor: 'A duplicate id.' }] })).toContainEqual({
      file: 'tolls',
      path: 'hunger',
      message: 'id "hunger" is already used in boss_intents',
    });
  });

  it('only references custom ops, never defines them', () => {
    expect(errorsOf({ cards: [{ id: 'spark', effects: [{ op: 'custom', id: 'make_it_rain' }] }] })[0]).toMatchObject({
      path: 'spark.effects[0].id',
    });
  });

  it('rejects malformed mods and keeps the base registry', () => {
    expect(mergeMod(content, '{not json').errors[0]).toMatchObject({ file: 'mod', message: expect.stringContaining('invalid JSON') });
    expect(mergeMod(content, { potions: [] }).errors[0]).toMatchObject({ file: 'mod', path: 'potions' });
    expect(mergeMod(content, { cards: [{ name: 'no id' }] }).errors[0]).toMatchObject({ file: 'cards', path: '[0]' });
    const big = JSON.stringify({ cards: [{ id: 'spark', text: 'x'.repeat(MOD_SIZE_LIMIT) }] });
    const tooBig = mergeMod(content, big);
    expect(tooBig.errors[0].message).toContain('limit');
    expect(tooBig.registry).toBe(content);
    expect(mergeMod(content, { rules: { flameCap: 7 } }).registry.rules.flameCap).toBe(7);
  });
});

describe('contentHash', () => {
  it('is 8 hex digits, stable across builds and independent of key order', () => {
    const hash = contentHash(content);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(contentHash(loadBaseContent())).toBe(hash);
    const files = registryToFiles(content);
    const shuffled = { ...files, heroes: (files.heroes as Array<Record<string, unknown>>).map((h) => Object.fromEntries(Object.entries(h).reverse())) };
    const rebuilt = buildRegistry(shuffled);
    expect(rebuilt.errors).toEqual([]);
    expect(rebuilt.registry && contentHash(rebuilt.registry)).toBe(hash);
  });
});

describe('reasons', () => {
  it('fills placeholders', () => {
    expect(reasonText('NEED_FLAME', { n: 2 }, content)).toBe('Need 2 Flame');
    expect(reasonText('UNIT_LIMIT', { n: 4, max: 4 }, content)).toBe('Unit limit 4/4');
    expect(reasonText('CARD_LIMIT', { source: 'Muffled Nave' }, content)).toBe('Card limit reached (Muffled Nave)');
    expect(reasonText('NO_TILE', {}, content)).toBe('No empty tile within {r} of your hero');
  });
});

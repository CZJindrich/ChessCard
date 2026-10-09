import { describe, expect, it } from 'vitest';
import { customSelection, decodeSettingsCode, defaultProfile, encodeSettingsCode, resolveConfig, setCustomPreset } from '../../../src/config';
import { contentHash, getContent } from '../../../src/engine/content';
import { demoSelection, heroPickSelection, prepareLaunch } from '../../../src/ui/app/launch';
import { attackSummary, cardArtData, heroView, matchesQuery, moveSummary, patternSummary } from '../../../src/ui/model/describe';
import { isValidRoomCode, normalizeRoomCode } from '../../../src/ui/screens/lobby/roomCode';
import { codeNotices } from '../../../src/ui/screens/setup/codeNotices';
import { advancedGroups, formatNumber, optionLabel } from '../../../src/ui/screens/setup/paramLabels';
import {
  activeChip,
  adaptSeatsForMode,
  addSeat,
  dailyFor,
  heroTakenBy,
  initialSetupSelection,
  removeSeat,
  setDifficulty,
  setLength,
  setMode,
  setOverride,
  setSeatKind,
  withSeats,
} from '../../../src/ui/screens/setup/setupModel';
import { summaryLines } from '../../../src/ui/screens/setup/SummaryPanel';
import { stepValue } from '../../../src/ui/components/Stepper';
import { placeTooltip } from '../../../src/ui/components/Tooltip';

const content = getContent();
const hash = contentHash(content);
const NOW = new Date('2026-10-09T12:00:00Z');
const env = { content, modded: false, now: NOW, randomSeed: () => 'wick-abc123' };

describe('hero picker launches', () => {
  it('starts the guided First Vigil on a first-ever Quick Play', () => {
    const sel = heroPickSelection('quick_play', defaultProfile(), 'sconce_paladin', content);
    const result = prepareLaunch(sel, env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({ mode: 'vigil', difficulty: 'candlelit', tutorial: true, firstGame: true, tolls: false, moth_die: false, boons: false });
    expect(result.config.boss_choice).toBe('hush_hierophant');
    expect(result.config.seats).toEqual([{ kind: 'human', hero: 'sconce_paladin', name: 'Player 1' }]);
    expect(result.config.seed).toBe('wick-abc123');
  });

  it('turns the systems on from the second game, and Candlelit after a loss', () => {
    const later = { ...defaultProfile(), gamesCompleted: 3, lastQuickPlayLost: true };
    const result = prepareLaunch(heroPickSelection('quick_play', later, 'lampwright', content), env);
    expect(result.ok && result.config).toMatchObject({ difficulty: 'candlelit', tutorial: false, tolls: true, moth_die: true, boons: true, boss_choice: 'random' });
  });

  it('always gives the tutorial a first-ever config', () => {
    const veteran = { ...defaultProfile(), gamesCompleted: 9 };
    const result = prepareLaunch(heroPickSelection('tutorial', veteran, 'moth_witch', content), env);
    expect(result.ok && result.config.tutorial).toBe(true);
  });

  it('seats two Warden bots in Quick Last Flame', () => {
    const result = prepareLaunch(heroPickSelection('quick_last_flame', defaultProfile(), 'ember_duelist', content), env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.mode).toBe('last_flame');
    expect(result.config.seats.map((s) => s.kind)).toEqual(['human', 'bot_warden', 'bot_warden']);
    expect(result.config).toMatchObject({ board_size: '10x10', bounty: false, haunting: false });
  });

  it('builds an all-bot demo', () => {
    const result = prepareLaunch(demoSelection(content), env);
    expect(result.ok && result.config.seats[0].kind).toBe('bot_warden');
  });

  it('reports issues instead of launching an invalid config', () => {
    const sel = withSeats(customSelection({ mode: 'last_flame' }), [{ kind: 'bot_warden', hero: null, name: 'Bot' }]);
    const result = prepareLaunch(sel, env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.reason)).toContain('CFG_NEED_HUMAN');
  });

  it('resolves the Daily seed to the UTC date', () => {
    const daily = dailyFor(NOW, [{ kind: 'human', hero: 'lampwright', name: 'Ada' }], content);
    const result = prepareLaunch(daily, env);
    expect(result.ok && result.config.seed).toBe('daily:2026-10-09');
  });
});

describe('setup model', () => {
  const seats = () => resolveConfig(initialSetupSelection('Ada'), { content }).config.seats;

  it('starts with one human seat named after the profile', () => {
    expect(seats()).toEqual([{ kind: 'human', hero: null, name: 'Ada' }]);
  });

  it('adds a bot seat when switching to Last Flame, and drops hidden overrides', () => {
    const vigil = setOverride(initialSetupSelection('Ada'), 'dread_max', 14);
    const lf = setMode(vigil, 'last_flame', seats(), content);
    const resolved = resolveConfig(lf, { content });
    expect(resolved.config.seats.map((s) => s.kind)).toEqual(['human', 'bot_warden']);
    expect(lf.overrides.dread_max).toBeUndefined();
    expect(resolved.validation.ok).toBe(true);
  });

  it('makes seat 1 human when Last Flame has none', () => {
    const adapted = adaptSeatsForMode([{ kind: 'bot_elder', hero: null, name: 'Elder of Beeswax' }], 'last_flame', content);
    expect(adapted[0]).toMatchObject({ kind: 'human', name: 'Player 1' });
  });

  it('renames default-named seats when one is removed and keeps custom names', () => {
    let list = addSeat(seats(), 'bot_warden', content);
    list = addSeat(list, 'bot_apprentice', content);
    expect(list[2].name).toBe('Apprentice of Bayberry');
    list = removeSeat(list, 1, content);
    expect(list.map((s) => s.name)).toEqual(['Ada', 'Apprentice of Tallow']);
  });

  it('renames a default-named seat when its kind changes', () => {
    const list = setSeatKind(addSeat(seats(), 'bot_warden', content), 1, 'human', content);
    expect(list[1]).toMatchObject({ kind: 'human', name: 'Player 2' });
  });

  it('finds the seat holding a hero', () => {
    const list = [
      { kind: 'human' as const, hero: 'moth_witch', name: 'A' },
      { kind: 'bot_warden' as const, hero: null, name: 'B' },
    ];
    expect(heroTakenBy(list, 'moth_witch', 1)).toBe(0);
    expect(heroTakenBy(list, 'moth_witch', 0)).toBeNull();
  });

  it('lights the length chip, the Daily, or a matching Custom preset', () => {
    const base = initialSetupSelection('Ada');
    const profile = defaultProfile();
    expect(activeChip(setLength(base, 'long', seats()), profile, hash, content)).toBe('long');
    expect(activeChip(dailyFor(NOW, seats(), content), profile, hash, content)).toBe('daily');
    const tuned = setDifficulty(setOverride(base, 'hand_size', 6), 'midnight', seats(), content);
    const saved = setCustomPreset(profile, 1, { name: 'Mine', code: encodeSettingsCode(tuned, hash, content) });
    expect(activeChip(tuned, saved, hash, content)).toBe('custom_2');
  });

  it('leaves the Daily when the length changes', () => {
    const daily = dailyFor(NOW, seats(), content);
    const next = setLength(daily, 'short', seats());
    expect(next.flags.daily).toBe(false);
    expect(next.oneClick).toBeNull();
    expect(resolveConfig(next, { content }).config.seed).toBe('random');
  });
});

describe('parameter labels', () => {
  it('shows only the current mode’s non-basic parameters', () => {
    const vigilKeys = advancedGroups('vigil').flatMap((g) => g.params.map((p) => p.key));
    const lfKeys = advancedGroups('last_flame').flatMap((g) => g.params.map((p) => p.key));
    expect(vigilKeys).toContain('dread_max');
    expect(vigilKeys).not.toContain('truce');
    expect(lfKeys).toContain('truce');
    expect(lfKeys).not.toContain('retry_night');
    expect(vigilKeys).not.toContain('difficulty');
  });

  it('formats values', () => {
    expect(formatNumber('boss_hp_multiplier', 1.15)).toBe('×1.15');
    expect(formatNumber('plumes_mod', -1)).toBe('−1');
    expect(formatNumber('initial_enemies_mod', 2)).toBe('+2');
    expect(optionLabel('truce', 'nights_1_2')).toBe('Nights 1–2');
    expect(optionLabel('neutrals', 'swarm')).toBe('Swarm');
  });

  it('names clamped and unknown keys in paste notices', () => {
    const payload = { v: 1, presets: { mode: 'vigil', length: 'short', difficulty: 'dusk' }, overrides: { hand_size: 12, potions: 1 }, contentHash: 'other' };
    const code = 'WAX1:' + Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decoded = decodeSettingsCode(code, { contentHash: hash, content });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(codeNotices(decoded.value)).toEqual(['Ignored unknown settings: potions', 'Hand size adjusted from 12 to 7', 'Made with different content (mods)']);
  });

  it('summarises the derived game', () => {
    const lf = resolveConfig(setMode(initialSetupSelection('Ada'), 'last_flame', [{ kind: 'human', hero: null, name: 'Ada' }], content), { content });
    const lines = summaryLines(lf.config, lf.derived, content);
    expect(lines.find((l) => l.label === 'Board')?.value).toBe('10×10');
    expect(lines.find((l) => l.label === 'Gloam closes')?.value).toContain('4×4');
    const vigil = resolveConfig(initialSetupSelection('Ada'), { content });
    expect(summaryLines(vigil.config, vigil.derived, content).find((l) => l.label === 'Dread')?.value).toBe('starts at 0 of 12 · dims at 4, deep dark at 8');
  });
});

describe('describe', () => {
  it('describes movement and attacks', () => {
    expect(moveSummary(content, content.heroes.byId.lampwright)).toBe('Rook slide 3');
    expect(moveSummary(content, content.units.byId.velvet_moth)).toBe('Queen slide 2, flying');
    expect(attackSummary(content, content.heroes.byId.lampwright.attack)).toBe('Ranged line, orthogonal, range 4, first hit');
    expect(attackSummary(content, content.enemies.byId.hush_monk.attack)).toBe('Hits all 8 tiles around itself; applies Dazed');
    expect(attackSummary(content, content.enemies.byId.ash_deacon.attack)).toBe('Artillery, distance 2–4, plus-shaped blast');
    expect(attackSummary(content, content.units.byId.twinwick.attack)).toContain('hits 2×');
    expect(patternSummary(content.bosses.byId.nocturna.phases[0].move)).toBe('Queen slide 2, flying');
  });

  it('builds hero views and card art data from content', () => {
    const vey = heroView(content, content.heroes.byId.ember_duelist);
    expect(vey).toMatchObject({ firstName: 'Vey', displayName: 'Vey, the Ember Duelist', move: 'Bishop slide 3', powerName: 'Shadowstep', powerCost: 1 });
    expect(heroView(content, content.heroes.byId.lampwright).strikeName).toBe('Ranged line');
    expect(cardArtData(content.cards.byId.light_a_taper)).toMatchObject({ type: 'summon', summonUnitId: 'taper', cost: 1 });
  });

  it('matches every word of a query', () => {
    expect(matchesQuery('', ['anything'])).toBe(true);
    expect(matchesQuery('hot wax', ['Hot Wax', 'a pool'])).toBe(true);
    expect(matchesQuery('hot ice', ['Hot Wax'])).toBe(false);
  });
});

describe('small helpers', () => {
  it('normalises room codes to the vowel-free alphabet', () => {
    const rules = content.rules.roomCode;
    expect(normalizeRoomCode('k w-t r a', rules)).toBe('KWTR');
    expect(normalizeRoomCode('kwtrx', rules)).toBe('KWTR');
    expect(isValidRoomCode('KWTR', rules)).toBe(true);
    expect(isValidRoomCode('KATR', rules)).toBe(false);
    expect(isValidRoomCode('KWT', rules)).toBe(false);
  });

  it('steps on the grid without float noise', () => {
    expect(stepValue(1.1, 1, 0.5, 2, 0.05)).toBe(1.15);
    expect(stepValue(2, 1, 0.5, 2, 0.05)).toBe(2);
    expect(stepValue(4, -1, 4, 7, 1)).toBe(4);
  });

  it('places tooltips above, or below near the top edge, inside the viewport', () => {
    const anchor = { top: 300, bottom: 320, left: 10, width: 20, height: 20, right: 30, x: 10, y: 300, toJSON: () => ({}) } as DOMRect;
    expect(placeTooltip(anchor, 200, 40, { width: 800, height: 600 })).toEqual({ left: 8, top: 252, below: false, arrow: 12 });
    const high = { ...anchor, top: 10, bottom: 30 } as DOMRect;
    expect(placeTooltip(high, 200, 40, { width: 800, height: 600 }).below).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../../../src/config';
import { getContent, tutorialScript } from '../../../src/engine';
import type { BossIntentDef, GameState } from '../../../src/engine/types';
import { intentDiagram } from '../../../src/ui/game/bossDiagram';
import { cardTags, nightSummary, synergy } from '../../../src/ui/game/chandleryModel';
import { currentMark, stepText, tileAllowed, type CoachContext } from '../../../src/ui/game/coach';
import { privateMoment } from '../../../src/ui/game/PassScreen';
import { gloryLines, mvpPiece, nightTitle, ordinal } from '../../../src/ui/game/titles';
import { loadSeenTips, saveSeenTips, tipsForEvent, tipsForPreview, TIPS_STORAGE_KEY } from '../../../src/ui/game/tips';
import { clampZoom, NO_ZOOM, zoomAround } from '../../../src/ui/game/zoom';
import { groupCards } from '../../../src/ui/game/DeckViewer';
import { configWithSeats, newGame, quickConfig } from './harness';

const reg = getContent();

function tutorialGame(heroId = 'sconce_paladin'): GameState {
  return newGame({ ...quickConfig('coach', heroId), tutorial: true, firstGame: true });
}

/** The scripted turn as the coach sees it: the players phase, the hero Ready. */
function scriptedTurn(): GameState {
  const s = structuredClone(tutorialGame());
  s.phase = 'players';
  s.activeSeat = 0;
  const hero = s.pieces[s.players[0].heroPieceId];
  hero.movesLeft = 1;
  hero.strikesLeft = 1;
  return s;
}

describe('Night title card (§15.1)', () => {
  it('reads "Night 1 · First Vigil — Survive 4 rounds. Keep the Candles lit." in the first game', () => {
    const s = tutorialGame();
    const title = nightTitle(s, reg);
    expect(title.title).toBe('Night 1 · First Vigil');
    expect(title.line).toBe('Survive 4 rounds. Keep the Candles lit.');
    expect(title.eyebrow).toBe(`Night 1 of ${s.config.nights}`);
  });
});

describe('boss intro diagrams', () => {
  const def = (id: string): BossIntentDef => {
    const d = reg.bossIntents.byId[id];
    if (!d) throw new Error(id);
    return d;
  };
  it('draws Hushwave as the 12 tiles around the footprint, Sceptre Sweep as a 2×4 beam', () => {
    expect(intentDiagram(def('hushwave')).hits).toHaveLength(12);
    expect(intentDiagram(def('sceptre_sweep')).hits).toHaveLength(8);
    expect(intentDiagram(def('silencing_peal')).global).toBe(true);
    expect(intentDiagram(def('bell_drop')).aim).not.toBeNull();
  });
});

describe('coach marks (§15.3)', () => {
  const script = tutorialScript('sconce_paladin');
  if (!script) throw new Error('the tutorial script is missing');
  const ctx = (over: Partial<CoachContext> = {}): CoachContext => ({
    selectedPieceId: null,
    selectedCardId: null,
    cardInfo: null,
    openingHand: Object.fromEntries(script.hand.map((id) => [id, script.hand.filter((x) => x === id).length])),
    canPlay: () => true,
    ...over,
  });

  it('walks mark 1 (click your hero) → mark 2 (step to d3) → mark 2 (strike)', () => {
    const s = scriptedTurn();
    const hero = s.pieces[s.players[0].heroPieceId];
    hero.pos = { ...script.heroStart };
    const first = currentMark(script, s, ctx(), { dismissed: new Set() }, 'mouse', {});
    expect(first?.markId).toBe(1);
    expect(first?.text).toContain('Click your hero');
    expect(first?.anchor).toEqual({ kind: 'tile', pos: script.heroStart });
    const second = currentMark(script, s, ctx({ selectedPieceId: hero.id }), { dismissed: new Set() }, 'mouse', {});
    expect(second?.markId).toBe(2);
    expect(second?.text).toContain('Step to **d3**');
    hero.pos = { x: 3, y: 2 };
    const third = currentMark(script, s, ctx({ selectedPieceId: hero.id }), { dismissed: new Set() }, 'mouse', {});
    expect(third?.text).toContain('Strike the **Sootling**');
    expect(third?.restricts).toBe(true);
  });

  it('words follow the input: touch says tap', () => {
    expect(stepText(script, 0, 'touch', {})).toContain('Tap your hero');
    const last = script.steps.length - 1;
    expect(stepText(script, last, 'touch', {})).toContain('Tap **End Turn** once to preview');
    expect(stepText(script, last, 'mouse', {})).toContain('Hover **End Turn**');
  });

  it('marks 1–4 allow only the coached tiles', () => {
    const s = scriptedTurn();
    s.pieces[s.players[0].heroPieceId].pos = { ...script.heroStart };
    const view = currentMark(script, s, ctx(), { dismissed: new Set() }, 'mouse', {});
    if (!view) throw new Error('mark expected');
    expect(tileAllowed(view, script, s, script.heroStart)).toBe(true);
    expect(tileAllowed(view, script, s, { x: 7, y: 0 })).toBe(false);
  });

  it('skips a summon mark the player cannot afford', () => {
    const s = scriptedTurn();
    const hero = s.pieces[s.players[0].heroPieceId];
    hero.pos = { x: 2, y: 3 };
    hero.movesLeft = 0;
    hero.strikesLeft = 0;
    for (const p of Object.values(s.pieces)) if (p.side === 'snuff') delete s.pieces[p.id];
    s.players[0].hand = s.players[0].hand.filter((c) => c.id !== 'spark');
    const view = currentMark(script, s, ctx({ canPlay: () => false }), { dismissed: new Set([3]) }, 'mouse', {});
    expect(view?.markId).toBe(6);
  });
});

describe('first-time tips', () => {
  it('maps events to tips and remembers what was shown', () => {
    const s = newGame();
    expect(tipsForEvent({ type: 'dread_changed', from: 0, to: 1, cause: 'candle_hit', threshold: null }, s)).toEqual(['dread']);
    expect(tipsForEvent({ type: 'omen_rolled', face: 3, omenId: 'stillness', effectiveId: 'stillness' }, s)).toEqual(['moth_die']);
    expect(tipsForEvent({ type: 'check', escapes: 2 }, s)).toEqual(['check']);
    expect(tipsForPreview({ ...s, plumes: [] })).toEqual([]);
    const storage = memoryStorage();
    saveSeenTips(storage, new Set(['dread', 'push']));
    expect([...loadSeenTips(storage)].sort()).toEqual(['dread', 'push']);
    storage.setItem(TIPS_STORAGE_KEY, '["dread","not-a-tip",3]');
    expect([...loadSeenTips(storage)]).toEqual(['dread']);
  });
});

describe('Chandlery model', () => {
  it('tags cards by what they do and counts the deck cards that share each tag', () => {
    const ward = reg.cards.byId.waxen_ward;
    const lantern = reg.cards.byId.hang_a_lantern;
    if (!ward || !lantern) throw new Error('cards missing');
    expect(cardTags(ward, reg)).toContain('Ward');
    expect(cardTags(lantern, reg)).toEqual(expect.arrayContaining(['Summons', 'Lanterns', 'Structures']));
    const deck = [{ uid: 'c1', id: 'waxen_ward', tempered: false }, { uid: 'c2', id: 'aegis_of_dawn', tempered: false }];
    expect(synergy(ward, deck, reg).find((t) => t.tag === 'Ward')?.inDeck).toBe(2);
  });

  it('summarises the Night from its night_setup snapshot', () => {
    const s = structuredClone(newGame());
    s.nightSnapshot = structuredClone({ ...s, undo: undefined, nightSnapshot: undefined }) as unknown as GameState['nightSnapshot'];
    s.players[0].stats.kills += 3;
    if (s.vigil) s.vigil.dread += 2;
    const summary = nightSummary(s, reg, 0);
    expect(summary.kills).toBe(3);
    expect(summary.dreadChange).toBe(2);
    expect(summary.candlesStanding).toBe(3);
  });

  it('groups copies in the deck viewer', () => {
    const groups = groupCards(
      [
        { uid: 'a', id: 'spark', tempered: false },
        { uid: 'b', id: 'spark', tempered: false },
        { uid: 'c', id: 'spark', tempered: true },
      ],
      reg,
    );
    expect(groups.map((g) => [g.id, g.tempered, g.count])).toEqual([
      ['spark', false, 2],
      ['spark', true, 1],
    ]);
  });
});

describe('finale words', () => {
  it('picks the MVP by kills, then damage', () => {
    const s = structuredClone(newGame());
    s.stats.pieces = { p1: { defId: 'taper', owner: 0, damage: 9, kills: 1 }, p2: { defId: 'sconce_paladin', owner: 0, damage: 4, kills: 3 }, p3: { defId: 'sootling', owner: null, damage: 30, kills: 5 } };
    expect(mvpPiece(s)?.pieceId).toBe('p2');
  });

  it('lists the Glory lines that are not zero, and ordinals', () => {
    const breakdown = { snuff_kill: 4, rival_unit: 0, rival_hero: 3, bounty: 0, shrine: 0, boss_damage: 0, boss_kill: 0, survival: 5, hero_fell: -2, effect: 0 };
    const lines = gloryLines({ seat: 0, placement: 1, score: 10, glory: 10, standingBonus: 5, alive: true, eliminationBand: null, bossDamage: 0, breakdown });
    expect(lines.map((l) => l.reason)).toEqual(['snuff_kill', 'rival_hero', 'survival', 'hero_fell']);
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '22nd']);
  });
});

describe('Pass screen (§11.5)', () => {
  it('veils Last Flame hot-seat turns and drafts, never Vigil', () => {
    const lf = structuredClone(newGame(configWithSeats([{ kind: 'human', hero: 'sconce_paladin', name: 'A' }, { kind: 'human', hero: 'moth_witch', name: 'B' }])));
    lf.config = { ...lf.config, mode: 'last_flame' };
    lf.phase = 'players';
    expect(privateMoment(lf, 0, 2)).toMatch(/^turn:/);
    expect(privateMoment(lf, 0, 1)).toBeNull();
    expect(privateMoment(lf, 0, 2, false)).toBeNull();
    lf.config = { ...lf.config, mode: 'vigil' };
    expect(privateMoment(lf, 0, 2)).toBeNull();
  });
});

describe('board zoom', () => {
  it('clamps the pan to the zoomed overhang and keeps the focus under the cursor', () => {
    expect(clampZoom({ scale: 0.5, x: 10, y: 10 }, 400, 400)).toEqual(NO_ZOOM);
    const z = zoomAround(NO_ZOOM, 2, { x: 100, y: 0 }, 400, 400);
    expect(z.scale).toBe(2);
    // The point 100 px right of centre stays put: 100 = x + 2 × 100.
    expect(z.x).toBe(-100);
    expect(clampZoom({ scale: 2, x: 999, y: -999 }, 400, 400)).toEqual({ scale: 2, x: 200, y: -200 });
  });
});

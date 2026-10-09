import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../../../src/config';
import { applyAction, getContent, legalStrikes, tutorialAction, tutorialScript } from '../../../src/engine';
import { FRAME, TILE } from '../../../src/art';
import type { RoomSnapshot, SessionState } from '../../../src/net';
import { mvpLine, signedGlory } from '../../../src/ui/game/GameOverOverlay';
import { onlineSeats, timerView } from '../../../src/ui/game/onlineModel';
import { maxUiScale } from '../../../src/ui/game/uiScale';
import { runningVote } from '../../../src/ui/game/VoteBar';
import type { Action, BossIntentDef, GameState } from '../../../src/engine/types';
import { intentDiagram } from '../../../src/ui/game/bossDiagram';
import { cardTags, nightSummary, synergy } from '../../../src/ui/game/chandleryModel';
import { actionAllowed, currentMark, recordAction, stepText, tileAllowed, type CoachContext, type CoachProgress } from '../../../src/ui/game/coach';
import { privateMoment } from '../../../src/ui/game/PassScreen';
import { gloryLines, mvpPiece, nightTitle, ordinal, runTotals } from '../../../src/ui/game/titles';
import { loadSeenTips, saveSeenTips, tipsForEvent, tipsForPreview, TIPS_STORAGE_KEY } from '../../../src/ui/game/tips';
import { clampZoom, NO_ZOOM, zoomAround } from '../../../src/ui/game/zoom';
import { groupCards } from '../../../src/ui/game/DeckViewer';
import { configWithSeats, newGame, playUntil, quickConfig } from './harness';

const reg = getContent();

function tutorialGame(heroId = 'sconce_paladin'): GameState {
  return newGame({ ...quickConfig('coach', heroId), tutorial: true, firstGame: true });
}

/** The scripted turn as the coach sees it: the real game, readied and advanced to round 1's players phase. */
function scriptedTurn(heroId = 'sconce_paladin'): GameState {
  return playUntil(tutorialGame(heroId), (s) => s.phase === 'players' && s.activeSeat === 0);
}

function act(s: GameState, action: Action): GameState {
  const result = applyAction(s, action);
  if (!result.ok) throw new Error(`${action.type} refused: ${result.reason}`);
  return result.state;
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
  const ctx = (over: Partial<CoachContext> = {}): CoachContext => ({ selectedPieceId: null, selectedCardId: null, cardInfo: null, ...over });
  const progress = (completed: number[] = [], dismissed: number[] = []): CoachProgress => ({ completed: new Set(completed), dismissed: new Set(dismissed) });

  it('walks mark 1 (click your hero) → mark 2 (step to d3) → mark 2 (strike) as the line is played', () => {
    const s = scriptedTurn();
    const hero = s.pieces[s.players[0].heroPieceId];
    const first = currentMark(script, s, ctx(), progress(), 'mouse', {});
    expect(first?.markId).toBe(1);
    expect(first?.text).toContain('Click your hero');
    expect(first?.anchor).toEqual({ kind: 'tile', pos: script.heroStart });
    const second = currentMark(script, s, ctx({ selectedPieceId: hero.id }), progress(), 'mouse', {});
    expect(second?.markId).toBe(2);
    expect(second?.text).toContain('Step to **d3**');
    const move = tutorialAction(s, script.steps[1]);
    if (!move) throw new Error('the move step has no action');
    const history = recordAction([], script, s, move, progress());
    expect(history).toEqual([1]);
    const after = act(s, move);
    const third = currentMark(script, after, ctx({ selectedPieceId: hero.id }), progress(history), 'mouse', {});
    expect(third?.text).toContain('Strike the **Sootling**');
    expect(third?.restricts).toBe(true);
  });

  it('undo pops the last coached step, so its mark comes back', () => {
    const s = scriptedTurn();
    const move = tutorialAction(s, script.steps[1]);
    if (!move) throw new Error('the move step has no action');
    const history = recordAction([], script, s, move, progress());
    expect(recordAction(history, script, s, { type: 'undo', seat: 0 }, progress(history))).toEqual([]);
  });

  it('words follow the input: touch says tap', () => {
    expect(stepText(script, 0, 'touch', {})).toContain('Tap your hero');
    const last = script.steps.length - 1;
    expect(stepText(script, last, 'touch', {})).toContain('Tap **End Turn** once to preview');
    expect(stepText(script, last, 'mouse', {})).toContain('Hover **End Turn**');
  });

  it('marks 1–4 allow only the coached tiles and the coached action', () => {
    const s = scriptedTurn();
    const view = currentMark(script, s, ctx(), progress(), 'mouse', {});
    if (!view) throw new Error('mark expected');
    expect(tileAllowed(view, script, s, script.heroStart)).toBe(true);
    expect(tileAllowed(view, script, s, { x: 7, y: 0 })).toBe(false);
    const heroId = s.players[0].heroPieceId;
    const moveMark = currentMark(script, s, ctx({ selectedPieceId: heroId }), progress(), 'mouse', {});
    expect(actionAllowed(moveMark, script, s, { type: 'move', seat: 0, pieceId: heroId, to: { x: 3, y: 2 } })).toBe(true);
    expect(actionAllowed(moveMark, script, s, { type: 'move', seat: 0, pieceId: heroId, to: { x: 4, y: 1 } })).toBe(false);
    expect(actionAllowed(moveMark, script, s, { type: 'end_turn', seat: 0 })).toBe(false);
    expect(actionAllowed(null, script, s, { type: 'end_turn', seat: 0 })).toBe(true);
  });

  it('skips a summon mark the player cannot afford', () => {
    const s = scriptedTurn();
    const hero = s.pieces[s.players[0].heroPieceId];
    hero.movesLeft = 0;
    hero.strikesLeft = 0;
    s.players[0].flame = 0;
    // Mark 1 is done (the hero was selected) and the info mark closed; nothing else can be done.
    const view = currentMark(script, s, ctx({ selectedPieceId: hero.id }), progress([], [3]), 'mouse', {});
    expect(view?.markId).toBe(6);
  });

  for (const heroId of ['sconce_paladin', 'moth_witch', 'lampwright', 'ember_duelist']) {
    it(`guides ${heroId}'s whole guaranteed line, mark by mark, to a double kill`, () => {
      const line = tutorialScript(heroId);
      if (!line) throw new Error(`no script for ${heroId}`);
      let s = scriptedTurn(heroId);
      const heroPieceId = s.players[0].heroPieceId;
      const kills = s.players[0].stats.kills;
      let history: number[] = [];
      const dismissed: number[] = [];
      const marks: number[] = [];
      for (let guard = 0; guard < 20; guard++) {
        const view = currentMark(line, s, ctx({ selectedPieceId: heroPieceId }), progress(history, dismissed), 'mouse', {});
        if (!view) break;
        marks.push(view.markId);
        const step = line.steps[view.stepIndex];
        if (step.action === 'info' || step.action === 'select') {
          dismissed.push(view.stepIndex);
          continue;
        }
        const action = tutorialAction(s, step);
        if (!action) throw new Error(`${heroId}: step ${view.stepIndex} has no action`);
        expect(actionAllowed(view, line, s, action)).toBe(true);
        history = recordAction(history, line, s, action, progress(history, dismissed));
        expect(history[history.length - 1]).toBe(view.stepIndex);
        s = act(s, action);
        if (step.action === 'end_turn') break;
      }
      expect(marks[0]).toBe(2);
      expect(marks).toContain(5);
      expect(marks[marks.length - 1]).toBe(6);
      expect(s.players[0].stats.kills - kills).toBeGreaterThanOrEqual(2);
    });
  }
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

describe('finale consistency', () => {
  it('the MVP line is a share of the team totals', () => {
    expect(mvpLine(4, 9, 17.4)).toBe('4 of the 9 kills · 17 damage');
    expect(mvpLine(1, 1, 2)).toBe('1 kill · 2 damage');
    expect(signedGlory(3)).toBe('+3');
    expect(signedGlory(-2)).toBe('−2');
    expect(signedGlory(0)).toBe('—');
  });

  it('a played game never shows an MVP above the team totals', () => {
    // Play Night 1 with strikes wherever a strike is possible, then compare the finale's sources.
    let s = playUntil(newGame(quickConfig('mvp-consistency')), (x) => x.phase === 'players');
    for (let guard = 0; guard < 60 && s.phase !== 'dawn' && !s.result; guard++) {
      const seat = s.activeSeat ?? 0;
      const striker = Object.values(s.pieces).find((p) => p.owner === seat && p.strikesLeft > 0 && legalStrikes(s, p.id).length > 0);
      const option = striker ? legalStrikes(s, striker.id)[0] : undefined;
      const action: Action = striker && option ? { type: 'strike', seat, pieceId: striker.id, target: option.target } : { type: 'end_turn', seat };
      const result = applyAction(s, action);
      s = result.ok ? result.state : playUntil(s, (x) => x.phase === 'players' || x.phase === 'dawn' || x.result !== null);
      if (s.phase !== 'players' && s.phase !== 'dawn' && !s.result) s = playUntil(s, (x) => x.phase === 'players' || x.phase === 'dawn' || x.result !== null);
    }
    const totals = runTotals(s, false);
    const mvp = mvpPiece(s);
    if (!mvp) return;
    expect(mvp.kills).toBeLessThanOrEqual(totals.kills);
    expect(Math.round(mvp.damage)).toBeLessThanOrEqual(totals.damage);
  });
});

describe('online plaques and the decision timer', () => {
  const view = newGame(configWithSeats([{ kind: 'human', hero: 'sconce_paladin', name: 'Ann' }, { kind: 'human', hero: 'moth_witch', name: 'Bob' }, { kind: 'bot_warden', hero: 'lampwright', name: 'Warden' }]));

  function sessionState(seats: RoomSnapshot['seats']): SessionState {
    const room = {
      code: 'KWTR',
      hostId: 'a',
      phase: 'playing',
      seats,
      members: [
        { id: 'a', name: 'Ann', connected: true, seat: 0, host: true },
        { id: 'b', name: 'Bob', connected: false, seat: 1, host: false },
      ],
      config: view.config,
      selection: null,
      configVersion: 1,
      reconnectGrace: 120,
      canStart: false,
      startBlocker: null,
      game: { startedAt: 0, over: false },
      expiresAt: 0,
    } satisfies RoomSnapshot;
    return { status: 'open', serverUrl: '', customServer: false, clientId: 'a', name: 'Ann', room, game: { seq: 1, view, you: [0], seats: [], reveal: null }, timer: null, rtt: null, pending: null, fatal: null };
  }

  const base = { kind: 'human' as const, hero: null, pendingId: null, ready: true, graceEndsAt: null };

  it('says who plays each seat, with the reconnect grace left', () => {
    const state = sessionState([
      { ...base, seat: 0, name: 'Ann', occupantId: 'a', connected: true, status: 'human' },
      { ...base, seat: 1, name: 'Bob', occupantId: 'b', connected: false, status: 'reconnecting', graceEndsAt: 100_000 },
      { ...base, seat: 2, kind: 'bot_warden', name: 'Warden', occupantId: null, connected: false, status: 'bot' },
    ]);
    const info = onlineSeats(state, 5_000);
    expect(info.get(0)?.tag).toBe('You');
    expect(info.get(1)?.tag).toBe('Reconnecting 1:35');
    expect(info.get(2)?.role).toBe('bot');
    const standIn = onlineSeats(sessionState([{ ...base, seat: 0, name: 'Ann', occupantId: 'a', connected: true, status: 'human' }, { ...base, seat: 1, name: 'Bob', occupantId: 'b', connected: false, status: 'bot' }]), 0);
    expect(standIn.get(1)?.tag).toBe('Stand-in');
  });

  it('burns the wick down to the deadline; the last 10 s are urgent', () => {
    const timer = { seat: 0, phase: 'players' as const, kind: 'turn' as const, deadline: 0, localDeadline: 90_000 };
    const early = timerView(timer, 0, 0, [0], view);
    expect(early).toMatchObject({ fraction: 1, text: '1:30', mine: true, owner: null, urgent: false, label: 'Turn' });
    const late = timerView(timer, 82_000, 0, [0], view);
    expect(late.urgent).toBe(true);
    expect(late.fraction).toBeCloseTo(8 / 90);
    expect(timerView(timer, 10_000, 0, [1], view)).toMatchObject({ mine: false, owner: 'Ann' });
    expect(timerView({ ...timer, seat: null, kind: 'phase' }, 0, 0, [1], view).mine).toBe(true);
  });
});

describe('ui_scale keeps 36 px tiles (§14.4)', () => {
  it('finds the largest scale whose board still fits 36 px tiles', () => {
    // 1280×720 at 150%: rem 24 px; the stage left for a 12×12 board is 600×430 px (too small).
    const probe = { viewportW: 1280, viewportH: 720, stageW: 600, stageH: 430, rem: 24, scale: 1.5, cols: 12, rows: 12 };
    const cap = maxUiScale(probe);
    expect(cap).toBeGreaterThan(0.9);
    expect(cap).toBeLessThan(1.5);
    // At the cap the rest of the layout shrinks with the root font, and the tiles fit.
    const base = probe.rem / probe.scale;
    const remW = (probe.viewportW - probe.stageW) / probe.rem;
    const remH = (probe.viewportH - probe.stageH) / probe.rem;
    const frame = (FRAME * 2) / TILE;
    const tile = Math.min((probe.viewportW - remW * base * cap) / (12 + frame), (probe.viewportH - remH * base * cap) / (12 + frame));
    expect(tile).toBeGreaterThanOrEqual(35.9);
    // A screen too small even at 90% stops at 90% (the board then zooms and pans).
    expect(maxUiScale({ ...probe, viewportW: 1024, viewportH: 600, stageW: 520, stageH: 300, rem: 21 })).toBe(0.9);
    // A roomy screen has no cap below the setting.
    expect(maxUiScale({ viewportW: 1920, viewportH: 1080, stageW: 1300, stageH: 820, rem: 20, scale: 1, cols: 8, rows: 8 })).toBeGreaterThan(1.5);
  });
});

describe('co-op votes', () => {
  it('a vote runs while any seat agreed', () => {
    const s = structuredClone(newGame());
    expect(runningVote(s)).toBeNull();
    if (!s.vigil) throw new Error('not a Vigil');
    s.vigil.retryVotes = [0];
    expect(runningVote(s)).toBe('retry');
    s.vigil.retryVotes = [];
    s.vigil.concedeVotes = [0];
    expect(runningVote(s)).toBe('concede');
  });
});

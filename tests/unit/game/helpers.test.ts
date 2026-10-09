import { describe, expect, it } from 'vitest';
import { applyAction, legalMoves, pendingAutomation } from '../../../src/engine';
import type { CardTargetInfo, GameEvent, GameState } from '../../../src/engine/types';
import {
  baseDuration,
  canSkipRest,
  cuesForEvent,
  dangerAfter,
  musicMoodFor,
  paceScale,
  patchView,
  picksComplete,
  playbackDuration,
} from '../../../src/game';
import { gameRecord } from '../../../src/ui/game/record';
import { newGame, quickConfig } from './harness';

function playersPhase(seed: string): GameState {
  let s = newGame(quickConfig(seed));
  const ready = applyAction(s, { type: 'ready', seat: 0 });
  if (!ready.ok) throw new Error(ready.reason);
  s = ready.state;
  while (pendingAutomation(s)) {
    const next = applyAction(s, { type: 'advance' });
    if (!next.ok) throw new Error(next.reason);
    s = next.state;
  }
  return s;
}

const NORMAL = { animation_speed: 1, enemy_turn_speed: 'normal' as const, reduced_motion: false };

describe('playback timing (GDD §16.9)', () => {
  it('uses the 1× durations: 180 ms per stepped tile, 300 ms leaps, 900 ms die', () => {
    const step: GameEvent = { type: 'piece_moved', pieceId: 'p1', from: { x: 0, y: 0 }, to: { x: 0, y: 3 }, kind: 'slide', path: [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }] };
    expect(baseDuration(step)).toBe(540);
    expect(baseDuration({ ...step, kind: 'leap' })).toBe(300);
    expect(baseDuration({ type: 'omen_rolled', face: 5, omenId: 'kindling', effectiveId: 'kindling' })).toBeGreaterThanOrEqual(900);
    expect(baseDuration({ type: 'log', entry: { text: 'x', night: 1, round: 1 } })).toBe(0);
  });

  it('scales by animation speed, and enemy phases also by enemy_turn_speed (instant = 0)', () => {
    expect(paceScale('player', { ...NORMAL, animation_speed: 2 })).toBe(0.5);
    expect(paceScale('enemy', { ...NORMAL, enemy_turn_speed: 'fast' })).toBe(0.5);
    expect(paceScale('enemy', { ...NORMAL, enemy_turn_speed: 'instant' })).toBe(0);
    const strike: GameEvent = { type: 'strike', attackerId: 'p1', kind: 'melee', from: { x: 0, y: 0 }, target: { x: 1, y: 1 } };
    expect(playbackDuration(strike, 'enemy', { ...NORMAL, enemy_turn_speed: 'instant' })).toBe(0);
    expect(playbackDuration(strike, 'player', NORMAL)).toBe(200);
  });
});

describe('patchView', () => {
  it('moves, damages and removes pieces as the events play', () => {
    const s = playersPhase('patch');
    const heroId = s.players[0].heroPieceId;
    const to = legalMoves(s, heroId)[0];
    let view = patchView(s, { type: 'piece_moved', pieceId: heroId, from: s.pieces[heroId].pos, to, kind: 'step' }, s);
    expect(view.pieces[heroId].pos).toEqual(to);
    expect(s.pieces[heroId].pos).not.toEqual(to);
    view = patchView(view, { type: 'damage', pieceId: heroId, amount: 2, hpAfter: 6, lethal: false, blockedByWard: false, cause: 'intent', sourceId: null, seat: null }, s);
    expect(view.pieces[heroId].hp).toBe(6);
    const enemy = Object.values(s.pieces).find((p) => p.side === 'snuff');
    if (!enemy) throw new Error('no enemy');
    view = patchView(view, { type: 'piece_died', pieceId: enemy.id, defId: enemy.defId, kind: enemy.kind, side: 'snuff', pos: enemy.pos, killerSeat: 0, cause: 'strike' }, s);
    expect(view.pieces[enemy.id]).toBeUndefined();
    expect(view.intents.some((i) => i.attackerId === enemy.id)).toBe(false);
  });

  it('adds summoned pieces and declared intents from the final state', () => {
    const s = playersPhase('patch2');
    const enemy = Object.values(s.pieces).find((p) => p.side === 'snuff');
    if (!enemy) throw new Error('no enemy');
    const without = { ...s, pieces: Object.fromEntries(Object.entries(s.pieces).filter(([id]) => id !== enemy.id)), intents: [] };
    const view = patchView(without, { type: 'summoned', pieceId: enemy.id, defId: enemy.defId, seat: null, pos: enemy.pos, side: 'snuff', source: 'rise' }, s);
    expect(view.pieces[enemy.id]?.defId).toBe(enemy.defId);
    const intent = s.intents[0];
    if (intent) {
      const withIntent = patchView(view, { type: 'intent_declared', intentId: intent.id, attackerId: intent.attackerId, queue: intent.queue, tiles: intent.tiles, damage: intent.damage }, s);
      expect(withIntent.intents.map((i) => i.id)).toContain(intent.id);
    }
  });
});

describe('sound cues (GDD §16.11)', () => {
  const s = newGame(quickConfig('sfx'));
  it('maps events to the shipped SfxNames', () => {
    expect(cuesForEvent({ type: 'piece_moved', pieceId: 'p1', from: { x: 0, y: 0 }, to: { x: 1, y: 2 }, kind: 'leap' }, s)[0].name).toBe('pieceLeap');
    expect(cuesForEvent({ type: 'damage', pieceId: 'p1', amount: 1, hpAfter: 0, lethal: true, blockedByWard: false, cause: 'strike', sourceId: null, seat: 0 }, s)[0].name).toBe('crit');
    expect(cuesForEvent({ type: 'damage', pieceId: 'p1', amount: 1, hpAfter: 3, lethal: false, blockedByWard: true, cause: 'strike', sourceId: null, seat: 0 }, s)[0].name).toBe('block');
    expect(cuesForEvent({ type: 'card_played', seat: 0, cardUid: 'c1', cardId: 'spark', cost: 1, targets: [] }, s).map((c) => c.name)).toEqual(['cardPlay', 'spellFire']);
    expect(cuesForEvent({ type: 'turn_started', seat: 1, flame: 3 }, s)[0]).toEqual({ name: 'turnStart', opts: { pitch: 1.12 } });
    const die = cuesForEvent({ type: 'omen_rolled', face: 1, omenId: 'eclipse', effectiveId: 'eclipse' }, s);
    expect(die.map((c) => c.name)).toEqual(['diceRoll', 'diceLand']);
    expect(die[1].opts?.pitch).toBe(0.71);
  });

  it('picks the music mood from the state (§16.12)', () => {
    expect(musicMoodFor(s)).toBe('explore');
    expect(musicMoodFor({ ...s, isBossNight: true })).toBe('boss');
    const dark = { ...s, vigil: s.vigil ? { ...s.vigil, dread: s.vigil.dreadMax - 1 } : null };
    expect(musicMoodFor(dark)).toBe('battle');
  });
});

describe('targeting steps', () => {
  const info = (over: Partial<CardTargetInfo>): CardTargetInfo => ({ playable: true, cost: 1, modes: null, step: 0, steps: 1, optional: false, targets: [], rangeRing: null, ...over });
  it('knows when every pick is made, and when the rest may be skipped', () => {
    expect(picksComplete(info({ steps: 0 }), [])).toBe(true);
    expect(picksComplete(info({ steps: 2 }), [{ kind: 'tile', pos: { x: 0, y: 0 } }])).toBe(false);
    expect(picksComplete(info({ steps: 2 }), [{ kind: 'tile', pos: { x: 0, y: 0 } }, { kind: 'tile', pos: { x: 1, y: 0 } }])).toBe(true);
    expect(canSkipRest(info({ steps: 2, complete: true }), [{ kind: 'tile', pos: { x: 0, y: 0 } }])).toBe(true);
    expect(canSkipRest(info({ steps: 2 }), [])).toBe(false);
  });
});

describe('danger badges', () => {
  it('reports the damage a piece would take where it ends a move (previewSnuffStrike)', () => {
    const s = playersPhase('danger');
    const heroId = s.players[0].heroPieceId;
    for (const to of legalMoves(s, heroId)) {
      const danger = dangerAfter(s, { type: 'move', seat: 0, pieceId: heroId, to }, heroId);
      expect(danger === null || danger > 0).toBe(true);
    }
  });
});

describe('recording a finished game', () => {
  it('turns a Vigil result into a profile record (stars, kills, Quick Play)', () => {
    const s = newGame(quickConfig('record'));
    const route = {
      screen: 'game' as const,
      config: s.config,
      selection: { mode: 'vigil' as const, length: 'short' as const, difficulty: 'dusk' as const, oneClick: 'quick_play' as const, locked: {}, overrides: {}, flags: { tutorial: false, firstGame: false, daily: false, modded: false } },
    };
    expect(gameRecord(route, s)).toBeNull();
    const won: GameState = { ...s, result: { mode: 'vigil', outcome: 'victory', stars: 2, cause: null, finalDread: 5, retries: 0 } };
    expect(gameRecord(route, won)).toMatchObject({ mode: 'vigil', won: true, conceded: false, quickPlay: true, stars: 2, finalDread: 5 });
    const lost: GameState = { ...s, result: { mode: 'vigil', outcome: 'defeat', stars: 0, cause: 'x', finalDread: 12, retries: 0 } };
    expect(gameRecord(route, lost)).toMatchObject({ won: false });
  });
});

/** Undo (§6.10), Retry this Night (§13.1.7) and Concede (§13.1.8). */
import { describe, expect, it } from 'vitest';
import { applyAction, canUndo, getContent, retryOpen, sq, validateAction, viewFor, voteStatus } from '../../../src/engine';
import type { Action, ContentRegistry, EffectOp, GameState } from '../../../src/engine';
import { act, blankScenario, enemyAt, giveCard, heroPiece, newGame, playCard, unitAt } from './helpers';
import { runGame } from './driver';

function undo(s: GameState, seat = 0): GameState {
  return act(s, { type: 'undo', seat }).state;
}

/** Board-relevant parts of a state (undo keeps the id counter and the log moving forward). */
function board(s: GameState) {
  return { pieces: s.pieces, players: s.players, plumes: s.plumes, intents: s.intents, rng: s.rng, tiles: s.board.tiles, rules: s.activeRules };
}

function withOps(card: string, effects: EffectOp[]): ContentRegistry {
  const reg = structuredClone(getContent());
  reg.cards.byId[card] = { ...reg.cards.byId[card], effects, temperedEffects: null };
  return reg;
}

describe('undo', () => {
  it('takes back moves and strikes one at a time, within the seat turn', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const hound = enemyAt(s, 'smokehound', 'd4');
    expect(canUndo(s, 0)).toBe(false);
    expect(validateAction(s, { type: 'undo', seat: 0 })).toMatchObject({ ok: false, reason: 'NO_UNDO' });
    const moved = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('d3') }).state;
    const struck = act(moved, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('d4') }).state;
    expect(struck.undo.depth).toBe(2);
    expect(canUndo(struck, 0)).toBe(true);
    expect(canUndo(viewFor(struck, 0), 0)).toBe(true);
    const back = undo(struck);
    expect(board(back)).toEqual(board(moved));
    const start = undo(back);
    expect(board(start)).toEqual(board(s));
    expect(start.pieces[hound.id].hp).toBe(2);
    expect(start.nextId).toBeGreaterThanOrEqual(struck.nextId);
    expect(canUndo(start, 0)).toBe(false);
  });

  it('undoing a kill also removes the Flourish strike it granted', () => {
    const s = blankScenario('ember_duelist', 'd2');
    const sootling = enemyAt(s, 'sootling', 'e3');
    const killed = act(s, { type: 'strike', seat: 0, pieceId: heroPiece(s, 0).id, target: sq('e3') }).state;
    expect(heroPiece(killed, 0).strikesLeft).toBe(1);
    expect(killed.players[0].turn.flourishUsed).toBe(1);
    const back = undo(killed);
    expect(back.pieces[sootling.id]).toBeDefined();
    expect(heroPiece(back, 0)).toMatchObject({ strikesLeft: 1, pos: sq('d2') });
    expect(back.players[0].turn.flourishUsed).toBe(0);
  });

  it('undoing a card returns it to the hand and refunds the Flame; a Charm comes back too', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    const uid = giveCard(s, 'oath_of_tallow');
    const played = playCard(s, uid, [heroPiece(s, 0)]).state;
    const back = undo(played);
    expect(back.players[0].hand.some((c) => c.uid === uid)).toBe(true);
    expect(back.players[0].flame).toBe(3);
    expect(heroPiece(back, 0)).toMatchObject({ atk: 2, charm: null });
  });

  it('commit points: card draws, Plume creation and RNG use cannot be undone (and stop older frames)', () => {
    const cases: EffectOp[][] = [
      [{ op: 'draw', amount: 1 }],
      [{ op: 'place_plume', enemy: 'sootling', count: 1 }],
      [{ op: 'create_tile', tile: 'hot_wax', count: 1, where: { base: ['flagstone'], empty: true } }],
    ];
    for (const effects of cases) {
      const reg = withOps('quickwick', effects);
      const s = blankScenario('sconce_paladin', 'd2');
      s.players[0].deck.push({ uid: 'c-deck', id: 'spark', tempered: false });
      const moved = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('d3') }).state;
      expect(moved.undo.depth).toBe(1);
      const uid = giveCard(moved, 'quickwick');
      const result = applyAction(moved, { type: 'play_card', seat: 0, cardUid: uid, targets: [{ kind: 'piece', pieceId: heroPiece(moved, 0).id }] }, reg);
      if (!result.ok) throw new Error(result.reason);
      expect(result.state.undo).toEqual({ frames: [], depth: 0 });
      expect(validateAction(result.state, { type: 'undo', seat: 0 })).toMatchObject({ ok: false, reason: 'NO_UNDO' });
    }
  });

  it('co-op: frames end with the seat turn; a queued claim survives an undo', () => {
    const coop = blankScenario('sconce_paladin', 'd2', { seats: [{ kind: 'human', hero: 'sconce_paladin' }, { kind: 'human', hero: 'moth_witch' }] });
    heroPiece(coop, 1).pos = sq('f2');
    let s = act(coop, { type: 'claim_turn', seat: 0 }).state;
    s = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('d3') }).state;
    s = act(s, { type: 'claim_turn', seat: 1 }).state;
    const back = undo(s);
    expect(back.claimQueue).toEqual([1]);
    expect(heroPiece(back, 0).pos).toEqual(sq('d2'));
    const moved = act(back, { type: 'move', seat: 0, pieceId: heroPiece(back, 0).id, to: sq('c3') }).state;
    const ended = act(moved, { type: 'end_turn', seat: 0 }).state;
    expect(ended.activeSeat).toBe(1);
    expect(validateAction(ended, { type: 'undo', seat: 1 })).toMatchObject({ ok: false, reason: 'NO_UNDO' });
    expect(validateAction(ended, { type: 'undo', seat: 0 })).toMatchObject({ ok: false, reason: 'TURN_ENDED' });
  });
});

// =============================================================================================
// Retry this Night and Concede
// =============================================================================================

const COMPARABLE = (s: GameState) => {
  const copy = JSON.parse(JSON.stringify({ ...s, nightSnapshot: null, log: [], undo: null })) as GameState;
  if (copy.vigil) copy.vigil.retries = 0;
  copy.stats.retries = 0;
  return copy;
};

function solo(overrides = {}): GameState {
  return newGame({ seed: 'retry', overrides: { retry_night: true, moth_die: true, tolls: true, ...overrides } });
}

/** Play from the start of Night 1 up to its round-2 players phase (or `steps` actions). */
function play(s: GameState, steps: number): { state: GameState; actions: Action[] } {
  return runGame(s, { policy: 'play', maxSteps: steps, stopWhen: (st) => st.night === 1 && st.round === 2 && st.phase === 'players' });
}

describe('Retry this Night', () => {
  it('restores the night_setup snapshot exactly (RNG streams included) and counts the retry', () => {
    const start = solo();
    const first = play(start, 400);
    expect(first.state).toMatchObject({ night: 1, round: 2, phase: 'players' });
    expect(retryOpen(first.state)).toEqual({ ok: true });
    const { state, events } = act(first.state, { type: 'retry_night', seat: 0 });
    expect(COMPARABLE(state)).toEqual(COMPARABLE(start));
    expect(state.vigil?.retries).toBe(1);
    expect(state.stats.retries).toBe(1);
    expect(events.map((e) => e.type)).toContain('night_retried');
    let again = state;
    for (const action of first.actions) again = act(again, action).state;
    expect(COMPARABLE(again)).toEqual(COMPARABLE(first.state));
  });

  it('works from the defeat screen, and not after a victory or outside the Night', () => {
    const s = play(solo(), 40).state;
    const lost = structuredClone(s);
    lost.result = { mode: 'vigil', outcome: 'defeat', stars: 0, cause: 'test', finalDread: 12, retries: 0 };
    lost.phase = 'game_over';
    const retried = act(lost, { type: 'retry_night', seat: 0 }).state;
    expect(retried.result).toBeNull();
    expect(retried.phase).toBe('night_setup');
    const won = structuredClone(lost);
    won.result = { mode: 'vigil', outcome: 'victory', stars: 1, cause: null, finalDread: 0, retries: 0 };
    expect(validateAction(won, { type: 'retry_night', seat: 0 })).toMatchObject({ ok: false, reason: 'GAME_OVER' });
    expect(validateAction(solo(), { type: 'retry_night', seat: 0 })).toMatchObject({ ok: false, reason: 'WRONG_PHASE' });
  });

  it('is disabled when retry_night is off, for Daily runs and in Last Flame', () => {
    expect(validateAction(play(solo({ retry_night: false }), 30).state, { type: 'retry_night', seat: 0 })).toMatchObject({ ok: false, reason: 'RETRY_DISABLED' });
    const daily = play(newGame({ seed: 'd', overrides: { retry_night: true }, flags: { daily: true } }), 30).state;
    expect(validateAction(daily, { type: 'retry_night', seat: 0 })).toMatchObject({ ok: false, reason: 'RETRY_DISABLED' });
    const lf = newGame({ mode: 'last_flame', seats: [{ kind: 'human', hero: 'moth_witch' }, { kind: 'bot_warden' }] });
    expect(validateAction(lf, { type: 'retry_night', seat: 0 })).toMatchObject({ ok: false, reason: 'MODE_ONLY' });
  });

  it('co-op needs every human seat (AI allies agree); one "no" cancels the vote', () => {
    const start = newGame({
      seed: 'vote',
      seats: [{ kind: 'human', hero: 'sconce_paladin' }, { kind: 'human', hero: 'moth_witch' }, { kind: 'bot_warden', hero: 'lampwright' }],
      overrides: { retry_night: true },
    });
    const s = play(start, 40).state;
    expect(retryOpen(s).ok).toBe(true);
    const one = act(s, { type: 'retry_night', seat: 0 }).state;
    expect(voteStatus(one, 'retry')).toEqual({ votes: [0], needed: [0, 1] });
    expect(one.vigil?.retries).toBe(0);
    expect(validateAction(one, { type: 'retry_night', seat: 0 })).toMatchObject({ ok: false, reason: 'INVALID_ACTION' });
    expect(validateAction(one, { type: 'retry_night', seat: 2 })).toMatchObject({ ok: false, reason: 'INVALID_ACTION' });
    const declined = act(one, { type: 'retry_night', seat: 1, vote: false }).state;
    expect(declined.vigil?.retryVotes).toEqual([]);
    const both = act(act(declined, { type: 'retry_night', seat: 1 }).state, { type: 'retry_night', seat: 0 }).state;
    expect(both.phase).toBe('night_setup');
    expect(both.vigil?.retries).toBe(1);
  });
});

describe('Concede', () => {
  it('solo concedes at once; co-op needs a unanimous vote of the humans', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    expect(act(s, { type: 'concede', seat: 0 }).state.result).toMatchObject({ mode: 'vigil', outcome: 'conceded' });
    const coop = newGame({ seats: [{ kind: 'human', hero: 'sconce_paladin' }, { kind: 'human', hero: 'moth_witch' }, { kind: 'bot_warden', hero: 'lampwright' }] });
    const one = act(coop, { type: 'concede', seat: 1 }).state;
    expect(one.result).toBeNull();
    expect(act(one, { type: 'concede', seat: 0, vote: false }).state.vigil?.concedeVotes).toEqual([]);
    expect(act(one, { type: 'concede', seat: 0 }).state.result).toMatchObject({ outcome: 'conceded' });
  });

  it('retries and concessions never undo: frames and units stay consistent', () => {
    const s = blankScenario('sconce_paladin', 'd2');
    unitAt(s, 'taper', 'e3');
    const moved = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('d3') }).state;
    const conceded = act(moved, { type: 'concede', seat: 0 }).state;
    expect(validateAction(conceded, { type: 'undo', seat: 0 })).toMatchObject({ ok: false, reason: 'GAME_OVER' });
  });
});

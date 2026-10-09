// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyAction, legalMoves, legalStrikes, pendingAutomation } from '../../../src/engine';
import type { Action, GameState } from '../../../src/engine/types';
import { createSyncBotRunner, GameController, LocalTransport, type ControllerSettings, type PlaybackStep } from '../../../src/game';
import { configWithSeats, flushMicrotasks, ManualScheduler, newGame, quickConfig, RecordingAudio } from './harness';

const NORMAL: ControllerSettings = { animation_speed: 1, enemy_turn_speed: 'normal', reduced_motion: false, confirm_end_turn: 'smart' };
const INSTANT: ControllerSettings = { animation_speed: 3, enemy_turn_speed: 'instant', reduced_motion: false, confirm_end_turn: 'never' };

let controllers: GameController[] = [];

afterEach(() => {
  for (const c of controllers) c.dispose();
  controllers = [];
});

interface Setup {
  controller: GameController;
  transport: LocalTransport;
  scheduler: ManualScheduler;
  audio: RecordingAudio;
}

function setup(state: GameState, settings: ControllerSettings = NORMAL): Setup {
  const transport = new LocalTransport(state);
  const scheduler = new ManualScheduler();
  const audio = new RecordingAudio();
  const controller = new GameController({ transport, scheduler, audio, settings: () => settings, bots: createSyncBotRunner });
  controllers.push(controller);
  return { controller, transport, scheduler, audio };
}

/** Run timers and bot promises until nothing is scheduled (or the step budget runs out). */
async function settle(t: Setup, budget = 5000): Promise<void> {
  for (let i = 0; i < budget; i++) {
    await flushMicrotasks();
    if (!t.scheduler.runNext()) {
      await flushMicrotasks();
      if (t.scheduler.pending === 0) return;
    }
  }
}

/** A solo game advanced to the players phase of round 1 (engine only). */
function gameAtPlayers(config = quickConfig()): GameState {
  let s = newGame(config);
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

describe('LocalTransport', () => {
  it('applies legal actions and reports reasons for illegal ones', () => {
    const s = gameAtPlayers();
    const transport = new LocalTransport(s);
    const updates: string[][] = [];
    transport.onUpdate((u) => updates.push(u.events.map((e) => e.type)));
    const hero = s.pieces[s.players[0].heroPieceId];
    const to = legalMoves(s, hero.id)[0];
    expect(transport.send({ type: 'move', seat: 0, pieceId: hero.id, to })).toEqual({ ok: true });
    expect(transport.getState().pieces[hero.id].pos).toEqual(to);
    expect(updates[0]).toContain('piece_moved');
    const again = transport.send({ type: 'move', seat: 0, pieceId: hero.id, to: hero.pos });
    expect(again.ok).toBe(false);
    expect(transport.controlledSeats(transport.getState())).toEqual([0]);
  });
});

describe('GameController playback', () => {
  it('plays events one at a time while the shown state lags behind', () => {
    const s = gameAtPlayers();
    const t = setup(s);
    t.controller.start();
    const hero = s.pieces[s.players[0].heroPieceId];
    const to = legalMoves(s, hero.id)[0];
    const steps: PlaybackStep[] = [];
    t.controller.onCue((step) => steps.push(step));
    expect(t.controller.dispatch({ type: 'move', seat: 0, pieceId: hero.id, to })).toBe(true);
    const snap = t.controller.getSnapshot();
    expect(snap.latest.pieces[hero.id].pos).toEqual(to);
    expect(snap.animating).toBe(true);
    expect(snap.playing?.event.type).toBe('piece_moved');
    expect(snap.playing?.duration).toBeGreaterThan(0);
    // The moving piece is already at its destination in the shown state (CSS animates the path).
    expect(snap.state.pieces[hero.id].pos).toEqual(to);
    t.scheduler.advance(2000);
    const done = t.controller.getSnapshot();
    expect(done.animating).toBe(false);
    expect(done.state).toBe(done.latest);
    expect(steps.map((x) => x.event.type)).toContain('piece_moved');
    expect(t.audio.names()).toContain('pieceMove');
  });

  it('scales durations with the presentation speeds', () => {
    const s = gameAtPlayers();
    const fast = setup(s, { ...NORMAL, animation_speed: 2 });
    const hero = s.pieces[s.players[0].heroPieceId];
    fast.controller.dispatch({ type: 'move', seat: 0, pieceId: hero.id, to: legalMoves(s, hero.id)[0] });
    expect(fast.controller.getSnapshot().playing?.duration).toBe(90);
  });

  it('shows illegal actions as a reason notice and plays uiError', () => {
    const s = gameAtPlayers();
    const t = setup(s);
    const hero = s.pieces[s.players[0].heroPieceId];
    expect(t.controller.dispatch({ type: 'move', seat: 0, pieceId: hero.id, to: hero.pos }, { kind: 'piece', id: hero.id })).toBe(false);
    const notice = t.controller.getSnapshot().notice;
    expect(notice?.anchor).toEqual({ kind: 'piece', id: hero.id });
    expect(notice?.text.length).toBeGreaterThan(0);
    expect(t.audio.names()).toContain('uiError');
    t.scheduler.advance(5000);
    expect(t.controller.getSnapshot().notice).toBeNull();
  });

  it('skips the rest of a player animation when the board is clicked', () => {
    const s = gameAtPlayers();
    const t = setup(s);
    const hero = s.pieces[s.players[0].heroPieceId];
    t.controller.dispatch({ type: 'move', seat: 0, pieceId: hero.id, to: legalMoves(s, hero.id)[0] });
    expect(t.controller.getSnapshot().animating).toBe(true);
    t.controller.clickTile({ x: 0, y: 0 });
    expect(t.controller.getSnapshot().animating).toBe(false);
  });
});

describe('GameController automation', () => {
  it('advances automated phases by itself once playback is idle', async () => {
    const t = setup(newGame(quickConfig('auto-advance')));
    t.controller.start();
    expect(t.controller.getSnapshot().latest.phase).toBe('night_setup');
    expect(t.controller.getSnapshot().uiSeat).toBe(0);
    expect(t.controller.ready()).toBe(true);
    await settle(t);
    const snap = t.controller.getSnapshot();
    expect(snap.latest.phase).toBe('players');
    expect(snap.uiSeat).toBe(0);
    expect(snap.state).toBe(snap.latest);
    expect(t.audio.moods).toContain('explore');
  });

  it('runs the Snuff Strike after End Turn and comes back to the players phase', async () => {
    const t = setup(gameAtPlayers(quickConfig('end-turn')), { ...NORMAL, confirm_end_turn: 'never' });
    t.controller.start();
    const round = t.controller.getSnapshot().latest.round;
    expect(t.controller.endTurn()).toBe('ended');
    await settle(t);
    const snap = t.controller.getSnapshot();
    expect(snap.latest.round).toBe(round + 1);
    expect(snap.latest.phase).toBe('players');
    expect(t.audio.names()).toContain('enemyTurn');
  });

  it('asks before ending the turn when pieces or cards are still usable (smart)', () => {
    const t = setup(gameAtPlayers(quickConfig('smart')));
    t.controller.start();
    expect(t.controller.endTurn()).toBe('confirm');
    expect(t.controller.getSnapshot().confirmingEndTurn).toBe(true);
    t.controller.cancel();
    expect(t.controller.getSnapshot().confirmingEndTurn).toBe(false);
    expect(t.controller.endTurn(true)).toBe('ended');
  });

  it('plays a whole all-bot game to the end with the sync bot runner', async () => {
    const config = configWithSeats([{ kind: 'bot_warden', hero: null, name: 'Warden' }], 'demo-run');
    const t = setup(newGame(config), INSTANT);
    t.controller.start();
    await settle(t, 20000);
    const snap = t.controller.getSnapshot();
    expect(snap.latest.result).not.toBeNull();
    expect(snap.latest.phase).toBe('game_over');
    expect(snap.uiSeat).toBeNull();
  });

  it('runs an AI ally after the human ends the turn, one action at a time', async () => {
    const config = configWithSeats(
      [
        { kind: 'human', hero: 'sconce_paladin', name: 'You' },
        { kind: 'bot_warden', hero: 'moth_witch', name: 'Ally' },
      ],
      'ally',
    );
    const t = setup(newGame(config), { ...NORMAL, confirm_end_turn: 'never' });
    const seen: number[] = [];
    t.controller.onCue((step) => {
      if (step.event.type === 'turn_started') seen.push(step.event.seat);
    });
    t.controller.start();
    t.controller.ready();
    await settle(t);
    expect(t.controller.getSnapshot().latest.activeSeat).toBe(0);
    t.controller.endTurn();
    await settle(t);
    expect(seen.slice(0, 3)).toEqual([0, 1, 0]);
    expect(t.controller.getSnapshot().latest.round).toBe(2);
  });
});

describe('GameController seats and claims', () => {
  const twoHumans = configWithSeats(
    [
      { kind: 'human', hero: 'sconce_paladin', name: 'Ann' },
      { kind: 'human', hero: 'lampwright', name: 'Bo' },
    ],
    'hotseat',
  );

  it('waits for a claim when several local humans are still to act', async () => {
    const t = setup(newGame(twoHumans));
    t.controller.start();
    expect(t.controller.ready()).toBe(true);
    expect(t.controller.getSnapshot().uiSeat).toBe(1);
    expect(t.controller.ready()).toBe(true);
    await settle(t);
    let snap = t.controller.getSnapshot();
    expect(snap.latest.phase).toBe('players');
    expect(snap.latest.activeSeat).toBeNull();
    expect(snap.uiSeat).toBeNull();
    expect(snap.controlledSeats).toEqual([0, 1]);
    expect(t.controller.claim(1)).toBe(true);
    await settle(t);
    snap = t.controller.getSnapshot();
    expect(snap.latest.activeSeat).toBe(1);
    expect(snap.uiSeat).toBe(1);
    // With one human left, the engine hands Ann the turn as soon as Bo ends.
    expect(t.controller.endTurn(true)).toBe('ended');
    await settle(t);
    expect(t.controller.getSnapshot().uiSeat).toBe(0);
  });

  it('claimNext takes the first local seat that has not acted', async () => {
    const t = setup(newGame(twoHumans));
    t.controller.start();
    t.controller.ready();
    t.controller.ready();
    await settle(t);
    expect(t.controller.claimNext()).toBe(true);
    expect(t.controller.getSnapshot().latest.activeSeat).toBe(0);
  });
});

describe('GameController selection', () => {
  it('selects a piece and moves it with a click on a gold dot', () => {
    const s = gameAtPlayers(quickConfig('select'));
    const t = setup(s);
    t.controller.start();
    const hero = s.pieces[s.players[0].heroPieceId];
    t.controller.clickTile(hero.pos);
    expect(t.controller.getSnapshot().selection.pieceId).toBe(hero.id);
    const hl = t.controller.highlightsFor(hero.id);
    expect(hl?.moves.length).toBeGreaterThan(0);
    const move = hl?.moves[0];
    if (!move) throw new Error('no move');
    t.controller.clickTile(move.pos);
    expect(t.controller.getSnapshot().latest.pieces[hero.id].pos).toEqual(move.to);
  });

  it('strikes when a gold ring is clicked', () => {
    let s = gameAtPlayers(quickConfig('strike'));
    const hero = s.pieces[s.players[0].heroPieceId];
    const enemy = Object.values(s.pieces).find((p) => p.side === 'snuff');
    if (!enemy) throw new Error('no enemy');
    // Put a Sootling next to the hero so a strike is available.
    s = { ...s, pieces: { ...s.pieces, [enemy.id]: { ...enemy, pos: { x: hero.pos.x, y: hero.pos.y + 1 }, hp: 1 } } };
    expect(legalStrikes(s, hero.id).length).toBeGreaterThan(0);
    const t = setup(s);
    t.controller.start();
    t.controller.clickTile(hero.pos);
    t.controller.clickTile({ x: hero.pos.x, y: hero.pos.y + 1 });
    const latest = t.controller.getSnapshot().latest;
    expect(latest.pieces[enemy.id]).toBeUndefined();
  });

  it('selecting an unplayable card shows its reason instead', () => {
    const s = gameAtPlayers(quickConfig('cards'));
    const poor: GameState = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, flame: 0 } : p)) };
    const t = setup(poor);
    t.controller.start();
    const card = poor.players[0].hand.find((c) => c.id !== 'quickwick');
    if (!card) throw new Error('no card');
    t.controller.selectCard(card.uid);
    const snap = t.controller.getSnapshot();
    expect(snap.selection.card).toBeNull();
    expect(snap.notice?.anchor).toEqual({ kind: 'card', uid: card.uid });
    expect(snap.notice?.text).toMatch(/Flame|isn't ready|enemy|tile/);
  });

  it('plays a targeted card with a click on a highlighted target', () => {
    const s = gameAtPlayers(quickConfig('cards2'));
    const t = setup(s);
    t.controller.start();
    const playable = s.players[0].hand.find((c) => {
      t.controller.selectCard(c.uid);
      return t.controller.getSnapshot().selection.card !== null;
    });
    if (!playable) throw new Error('no playable card in the opening hand');
    const info = t.controller.targetInfo();
    expect(info?.playable).toBe(true);
    const target = info?.targets[0];
    if (!target) throw new Error('no target');
    t.controller.clickTile(target.pos);
    const latest = t.controller.getSnapshot().latest;
    expect(latest.players[0].hand.some((c) => c.uid === playable.uid)).toBe(false);
    expect(t.controller.getSnapshot().selection.card).toBeNull();
  });

  it('Esc backs out of the selection', () => {
    const s = gameAtPlayers(quickConfig('esc'));
    const t = setup(s);
    t.controller.start();
    const hero = s.pieces[s.players[0].heroPieceId];
    t.controller.selectPiece(hero.id);
    t.controller.cancel();
    expect(t.controller.getSnapshot().selection.pieceId).toBeNull();
  });

  it('cycles through Ready pieces with Tab', () => {
    const s = gameAtPlayers(quickConfig('tab'));
    const t = setup(s);
    t.controller.start();
    t.controller.cycleReadyPiece();
    expect(t.controller.getSnapshot().selection.pieceId).toBe(s.players[0].heroPieceId);
  });

  it('hint highlights a suggested action (or explains there is none)', async () => {
    const t = setup(gameAtPlayers(quickConfig('hint')));
    t.controller.start();
    t.controller.requestHint();
    await flushMicrotasks();
    const snap = t.controller.getSnapshot();
    expect(snap.selection.hint !== null || snap.notice?.tone === 'info').toBe(true);
  });

  it('deploys by click during night setup', () => {
    const s = newGame(quickConfig('deploy'));
    const t = setup(s);
    t.controller.start();
    const hero = s.pieces[s.players[0].heroPieceId];
    t.controller.clickTile(hero.pos);
    expect(t.controller.getSnapshot().selection.pieceId).toBe(hero.id);
    const target = { x: hero.pos.x === 0 ? 1 : 0, y: 0 };
    t.controller.clickTile(target);
    expect(t.controller.getSnapshot().latest.pieces[hero.id].pos).toEqual(target);
  });

  it('undo reports its reason until the engine supports it', () => {
    const t = setup(gameAtPlayers(quickConfig('undo')));
    t.controller.start();
    const ok = t.controller.undo();
    if (!ok) expect(t.controller.getSnapshot().notice?.anchor).toEqual({ kind: 'control', id: 'undo' });
  });
});

describe('GameController with remote authority', () => {
  it('never advances or runs bots when the transport does not own automation', () => {
    const s = newGame(configWithSeats([{ kind: 'bot_warden', hero: null, name: 'W' }], 'remote'));
    const local = new LocalTransport(s);
    const sent: Action[] = [];
    const transport = Object.assign(Object.create(local) as LocalTransport, {
      runsAutomation: false,
      send: (a: Action) => {
        sent.push(a);
        return local.send(a);
      },
    });
    const scheduler = new ManualScheduler();
    const controller = new GameController({ transport, scheduler, settings: () => INSTANT, bots: createSyncBotRunner });
    controllers.push(controller);
    controller.start();
    scheduler.advance(10000);
    expect(sent).toEqual([]);
  });
});

/**
 * Boss specials and phases (GDD §10.1-10.4): hollow_bell, Escapes / CHECK / CHECKMATE
 * (smothered_mate), phase thresholds crossed in one hit, and every phase's onEnter.
 */
import { describe, expect, it } from 'vitest';
import { getContent, legalStrikes, openEscapes, sq, sqName } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { bossPlayersPhaseEnd, bossSnuffMove } from '../../../src/engine/bosses';
import { dealDamage } from '../../../src/engine/combat';
import { makeCtx } from '../../../src/engine/state';
import { blankBoss, bossNight, bossPiece } from './bossHelpers';
import { act, candleAt, enemyAt, eventsOf, giveCard, heroPiece, lockMelee, playCard, plumeAt, setTile, unitAt } from './helpers';

const reg = getContent();

function hit(s: GameState, amount: number, seat: number | null = 0) {
  const ctx = makeCtx(s);
  dealDamage(ctx, bossPiece(s), amount, { cause: 'card', sourceKind: 'card', sourceId: null, seat });
  return ctx.events;
}

describe('Hollow bell (Hush Hierophant weakness)', () => {
  it('strikes from a piece adjacent to the Hierophant deal +1; distant strikes and cards do not', () => {
    const s = blankBoss('hush_hierophant', 'd4', 'lampwright', 'd3');
    expect(legalStrikes(s, heroPiece(s, 0).id).find((o) => o.targetPieceId === s.boss?.pieceId)?.damage).toBe(3);
    const far = blankBoss('hush_hierophant', 'd4', 'lampwright', 'd1');
    expect(legalStrikes(far, heroPiece(far, 0).id).find((o) => o.targetPieceId === far.boss?.pieceId)?.damage).toBe(2);
    const card = blankBoss('hush_hierophant', 'd4', 'lampwright', 'd3');
    const before = bossPiece(card).hp;
    const after = playCard(card, giveCard(card, 'spark'), [bossPiece(card)]).state;
    expect(bossPiece(after).hp).toBe(before - 1);
  });
});

describe('Escapes (§10.3)', () => {
  it('counts the 8 step vectors; the edge, Pillars, pieces, Candles, Wicks and Gloam block; Hot Wax, Plumes and Rubble do not', () => {
    const open = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'h8');
    expect(openEscapes(open, bossPiece(open))).toHaveLength(8);
    const corner = blankBoss('guttered_king', 'a1', 'sconce_paladin', 'h8');
    expect(openEscapes(corner, bossPiece(corner))).toHaveLength(3);

    const blockers: Array<[string, (s: GameState) => void]> = [
      ['pillar', (s) => setTile(s, 'd6', 'pillar')],
      ['his own Gutter Pawn', (s) => void enemyAt(s, 'gutter_pawn', 'd6')],
      ['a Vigil Candle', (s) => void candleAt(s, 'd6')],
      [
        'a Smoldering Wick',
        (s) => {
          const hero = heroPiece(s, 0);
          hero.pos = sq('d6');
          hero.smoldering = true;
          hero.hp = 0;
        },
      ],
      ['Gloam', (s) => void (s.board.tiles[5 * 8 + 3].gloam = true)],
    ];
    for (const [label, place] of blockers) {
      const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'h8');
      place(s);
      expect(openEscapes(s, bossPiece(s)).length, label).toBe(6);
    }
    const opens: Array<[string, (s: GameState) => void]> = [
      ['Hot Wax', (s) => setTile(s, 'd6', 'hot_wax')],
      ['a Plume', (s) => plumeAt(s, 'd6')],
      ['Rubble', (s) => setTile(s, 'd6', 'rubble')],
    ];
    for (const [label, place] of opens) {
      const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'h8');
      place(s);
      expect(openEscapes(s, bossPiece(s)).length, label).toBe(8);
    }
  });

  it('CHECK! is announced when Escapes change to 2 or 1; the state keeps the open arrows', () => {
    const s = blankBoss('guttered_king', 'a1', 'sconce_paladin', 'c4');
    unitAt(s, 'taper', 'a4');
    const toTwo = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('c3') });
    expect(eventsOf(toTwo.events, 'check')).toEqual([{ type: 'check', escapes: 2 }]);
    expect(toTwo.state.boss?.escapes).toBe(2);
    expect(toTwo.state.boss?.escapeDirs).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
    const taper = Object.values(toTwo.state.pieces).find((p) => p.defId === 'taper');
    const toOne = act(toTwo.state, { type: 'move', seat: 0, pieceId: taper?.id ?? '', to: sq('a3') });
    expect(eventsOf(toOne.events, 'check')).toEqual([{ type: 'check', escapes: 1 }]);
  });

  it('the CHECK state is the Guttered King’s only: other bosses never announce it', () => {
    const s = blankBoss('hush_hierophant', 'a1', 'sconce_paladin', 'c4');
    const moved = act(s, { type: 'move', seat: 0, pieceId: heroPiece(s, 0).id, to: sq('c3') });
    expect(eventsOf(moved.events, 'check')).toHaveLength(0);
    expect(moved.state.boss?.escapes).toBe(2);
  });
});

describe('CHECKMATE (§10.3)', () => {
  function boxedKing(): GameState {
    const s = blankBoss('guttered_king', 'a1', 'sconce_paladin', 'b3');
    unitAt(s, 'brass_ram', 'c2');
    return s;
  }

  it('at the end of the players phase with 0 Escapes: ⌈15% max HP⌉ damage through Ward, and a crown', () => {
    let s = boxedKing();
    const boss = bossPiece(s);
    boss.ward = true;
    expect(openEscapes(s, boss)).toHaveLength(0);
    const maxHp = s.boss?.maxHp ?? 0;
    const damage = Math.ceil((maxHp * 15) / 100);
    const { state, events } = act(s, { type: 'end_turn', seat: 0 });
    s = state;
    expect(eventsOf(events, 'checkmate')).toEqual([{ type: 'checkmate', damage, crowns: 1, shares: [{ seat: 0, amount: damage }] }]);
    expect(eventsOf(events, 'damage').find((e) => e.cause === 'checkmate')).toMatchObject({ amount: damage, blockedByWard: false });
    expect(bossPiece(s).hp).toBe(maxHp - damage);
    expect(s.boss).toMatchObject({ crowns: 1, damageBySeat: [damage] });
  });

  it('happens again on later rounds, at most 3 times per fight', () => {
    const s = boxedKing();
    const ctx = makeCtx(s);
    for (let i = 0; i < 5; i++) bossPlayersPhaseEnd(ctx);
    expect(s.boss?.crowns).toBe(3);
    expect(eventsOf(ctx.events, 'checkmate').map((e) => e.crowns)).toEqual([1, 2, 3]);
  });

  it('not while an escape is open', () => {
    const s = blankBoss('guttered_king', 'a1', 'sconce_paladin', 'b3');
    const ctx = makeCtx(s);
    bossPlayersPhaseEnd(ctx);
    expect(eventsOf(ctx.events, 'checkmate')).toHaveLength(0);
    expect(s.boss?.escapes).toBe(1);
  });

  it('Last Flame: the damage is split equally among the players with a piece next to him', () => {
    const s = bossNight({ boss: 'guttered_king', seats: 2, mode: 'last_flame', overrides: { boss_hp_multiplier: 1 } });
    const king = bossPiece(s);
    for (const p of Object.values(s.pieces)) if (p.kind === 'enemy') delete s.pieces[p.id];
    king.pos = sq('a1');
    for (const t of ['a1', 'b1', 'a2', 'b2', 'b3', 'c2', 'c3', 'a3', 'c1']) setTile(s, t, 'flagstone');
    heroPiece(s, 0).pos = sq('b3');
    heroPiece(s, 1).pos = sq('c2');
    const ctx = makeCtx(s);
    bossPlayersPhaseEnd(ctx);
    const damage = Math.ceil(((18 + 24) * 15) / 100);
    expect(eventsOf(ctx.events, 'checkmate')[0]).toMatchObject({ damage, shares: [{ seat: 0, amount: damage / 2 }, { seat: 1, amount: damage / 2 }] });
    expect(s.boss?.damageBySeat).toEqual([damage / 2, damage / 2]);
  });
});

describe('phases (§10.1)', () => {
  it('one hit across both thresholds runs both onEnter effects in order; damage is not capped', () => {
    const s = blankBoss('hush_hierophant', 'd5', 'sconce_paladin', 'a1');
    const maxHp = s.boss?.maxHp ?? 0;
    const events = hit(s, maxHp - 2);
    expect(bossPiece(s).hp).toBe(2);
    expect(eventsOf(events, 'boss_phase').map((e) => e.phase)).toEqual([2, 3]);
    expect(s.boss).toMatchObject({ phase: 3, clapperSwinging: true });
    const clapper = Object.values(s.pieces).find((p) => p.defId === 'clapper');
    expect(clapper).toBeDefined();
    expect(eventsOf(events, 'summoned')).toEqual([expect.objectContaining({ defId: 'clapper', source: 'boss', side: 'snuff' })]);
  });

  it('crossing exactly the threshold enters the phase; a killing hit enters none', () => {
    const s = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    const maxHp = s.boss?.maxHp ?? 0;
    hit(s, maxHp - Math.floor((maxHp * 2) / 3));
    expect(s.boss?.phase).toBe(2);
    const t = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    const events = hit(t, 999);
    expect(eventsOf(events, 'boss_phase')).toHaveLength(0);
    expect(t.result).toMatchObject({ mode: 'vigil', outcome: 'victory' });
  });

  it('new phase intents start at the next Snuff Move; locked ones still resolve', () => {
    const s = blankBoss('hush_hierophant', 'd5', 'sconce_paladin', 'a1');
    bossSnuffMove(makeCtx(s));
    expect(s.intents.map((i) => i.bossIntentId)).toEqual(['bell_drop', 'hushwave']);
    hit(s, (s.boss?.maxHp ?? 0) - Math.floor(((s.boss?.maxHp ?? 0) * 2) / 3));
    expect(s.intents.map((i) => i.bossIntentId)).toEqual(['bell_drop', 'hushwave']);
    s.intents = [];
    bossSnuffMove(makeCtx(s));
    expect(s.intents.map((i) => i.bossIntentId)).toEqual(['bell_drop', 'hushwave', 'silencing_peal']);
  });

  it('Guttered King phase 2 summons Gutter Pawns × [1, 1, 2, 2] by P near his footprint', () => {
    for (const [players, pawns] of [
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
    ]) {
      const s = blankBoss('guttered_king', 'd5', 'sconce_paladin', 'a1');
      if (s.boss) s.boss.players = players;
      hit(s, (s.boss?.maxHp ?? 0) - Math.floor(((s.boss?.maxHp ?? 0) * 2) / 3));
      const summoned = Object.values(s.pieces).filter((p) => p.defId === 'gutter_pawn');
      expect(summoned).toHaveLength(pawns);
      for (const p of summoned) expect(Math.max(0, p.pos.x - 4, 3 - p.pos.x, p.pos.y - 5, 4 - p.pos.y)).toBeLessThanOrEqual(3);
    }
  });

  it('Last Flame: the King summons Drip Hulks instead', () => {
    const s = bossNight({ boss: 'guttered_king', seats: 2, mode: 'last_flame' });
    hit(s, (s.boss?.maxHp ?? 0) - Math.floor(((s.boss?.maxHp ?? 0) * 2) / 3));
    const summoned = Object.values(s.pieces).filter((p) => p.side === 'snuff' && p.kind === 'enemy');
    expect(summoned.map((p) => p.defId)).toEqual(['drip_hulk']);
  });

  it('Guttered King phase 3 pours Hot Wax on every empty tile of the ring around him', () => {
    const s = blankBoss('guttered_king', 'd5', 'sconce_paladin', 'c4');
    hit(s, (s.boss?.maxHp ?? 0) - Math.floor((s.boss?.maxHp ?? 0) / 3));
    const wax = s.board.tiles.map((t, i) => (t.type === 'hot_wax' ? sqName({ x: i % 8, y: Math.floor(i / 8) }) : null)).filter((t) => t !== null);
    const ring = ['c4', 'd4', 'e4', 'f4', 'c5', 'f5', 'c6', 'f6', 'c7', 'd7', 'e7', 'f7'];
    const pawns = Object.values(s.pieces).filter((p) => p.defId === 'gutter_pawn').map((p) => sqName(p.pos));
    expect(wax.sort()).toEqual(ring.filter((t) => t !== 'c4' && !pawns.includes(t)).sort());
  });

  it('Nocturna phase 3 summons 2 Gnawmoths', () => {
    const s = blankBoss('nocturna', 'd5', 'sconce_paladin', 'a1');
    hit(s, (s.boss?.maxHp ?? 0) - Math.floor((s.boss?.maxHp ?? 0) / 3));
    expect(Object.values(s.pieces).filter((p) => p.defId === 'gnawmoth')).toHaveLength(2);
    expect(reg.bosses.byId.nocturna.phases[2].intents).toEqual(['wing_gust', 'hunger', 'dust_storm']);
  });
});

describe('multi-tile rules (§6.7)', () => {
  it('one target: never a Take, even on the killing blow; artillery may aim at any footprint tile', () => {
    const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'd3');
    bossPiece(s).hp = 1;
    const option = legalStrikes(s, heroPiece(s, 0).id).find((o) => o.targetPieceId === s.boss?.pieceId);
    expect(option).toMatchObject({ lethal: true, take: null });
    const t = blankBoss('guttered_king', 'd5', 'lampwright', 'a1');
    const mortar = unitAt(t, 'wick_mortar', 'd2');
    const aims = legalStrikes(t, mortar.id).filter((o) => o.targetPieceId === t.boss?.pieceId).map((o) => sqName(o.target)).sort();
    expect(aims).toEqual(['d5', 'd6', 'e5', 'e6']);
  });

  it('immune to displacement: Shield Bash hurts but does not push', () => {
    const s = blankBoss('hush_hierophant', 'd4', 'sconce_paladin', 'd3');
    const hp = bossPiece(s).hp;
    const { state, events } = playCard(s, giveCard(s, 'shield_bash'), [bossPiece(s)]);
    expect(bossPiece(state)).toMatchObject({ hp: hp - 2, pos: sq('d4') });
    expect(eventsOf(events, 'piece_moved')).toHaveLength(0);
  });

  it('the footprint blocks line of sight', () => {
    const s = blankBoss('guttered_king', 'd4', 'lampwright', 'd2');
    const sootling = enemyAt(s, 'sootling', 'd7');
    const targets = legalStrikes(s, heroPiece(s, 0).id).map((o) => o.targetPieceId);
    expect(targets).toContain(s.boss?.pieceId);
    expect(targets).not.toContain(sootling.id);
  });

  it('Snuff attacks never hurt a boss', () => {
    const s = blankBoss('guttered_king', 'd4', 'sconce_paladin', 'a1');
    lockMelee(s, enemyAt(s, 'sootling', 'c4'), 'd4', 1);
    s.phase = 'snuff_strike';
    s.activeSeat = null;
    const { state, events } = act(s, { type: 'advance' });
    expect(bossPiece(state).hp).toBe(state.boss?.maxHp);
    expect(eventsOf(events, 'damage')).toHaveLength(0);
  });

  it('bosses never use Chimneys: a Chimney is flagstone to them', () => {
    const s = blankBoss('guttered_king', 'd6', 'sconce_paladin', 'd2');
    for (const [square, pair] of [
      ['c5', 0],
      ['d5', 0],
      ['e5', 1],
      ['h8', 1],
    ] as const) setTile(s, square, 'chimney', pair);
    s.phase = 'snuff_move';
    s.activeSeat = null;
    const moved = bossPiece(act(s, { type: 'advance' }).state).pos;
    expect(Math.max(Math.abs(moved.x - 3), Math.abs(moved.y - 5))).toBe(1);
  });
});

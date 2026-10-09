/**
 * Boss hooks (GDD §10). The phase machine and combat call these at fixed points; the boss
 * engineer fills them in. Until then no boss spawns: `state.boss` stays null and the Boss Night
 * runs as a capped regular Night (see phases.ts `runBossIntro`).
 */
import { addLog } from './log';
import { pieceList, removePiece } from './state';
import type { Ctx } from './state';
import { endVigil } from './modes/vigil';
import type { GameState, Piece } from './types';

/** boss_intro: spawn the boss (anchor from the hollow_nave layout / Last Flame centre). No-op for now. */
export function spawnBoss(_ctx: Ctx): void {}

/** snuff_move, before every enemy: move bosses and declare their intents. No-op for now. */
export function bossSnuffMove(_ctx: Ctx): void {}

/** End of the players phase (Guttered King CHECKMATE). No-op for now. */
export function bossPlayersPhaseEnd(_ctx: Ctx): void {}

/** Extra damage a player strike deals to a boss (Hush Hierophant `hollow_bell`). Pure: previews call it. */
export function bossStrikeBonus(_s: GameState, _attacker: Piece, _target: Piece): number {
  return 0;
}

/** A boss took damage (phase thresholds, Glory shares). No-op for now. */
export function onBossDamaged(_ctx: Ctx, _boss: Piece, _amount: number, _seat: number | null): void {}

/**
 * A boss reached 0 HP: every Snuff vanishes and, in Vigil, the game is won (§10.1, §13.1.5).
 * The boss engineer extends this (Glory, killing blow, Last Flame end of game).
 */
export function onBossDeath(ctx: Ctx, boss: Piece, killerSeat: number | null): void {
  const { s } = ctx;
  for (const p of pieceList(s)) if (p.side === 'snuff') removePiece(s, p.id);
  s.intents = [];
  if (s.boss) s.boss.killerSeat = killerSeat;
  addLog(ctx, `${ctx.reg.bosses.byId[boss.defId]?.name ?? 'The boss'} falls.`);
  if (s.config.mode === 'vigil') endVigil(ctx, 'victory', null);
}

/**
 * Heirlooms (GDD §13.6): passive items a hero keeps for the rest of the game.
 * - passive (`modify_rule`, duration game): Brass Thimble, Lamplighter's Hook, Moth-Velvet
 *   Cloak, Candlemaker's Mold. Brass Thimble and the Cloak also change the hero piece at once.
 * - triggered: Ever-Burning Wick (Ward at each Night start).
 * - free action: Bell of Saint Tallow (`ring_bell`, once per Night; see actions.ts).
 */
import { baseEnv, runEffects, runTriggered } from './effects';
import { addLog, pieceName } from './log';
import { emit, heroOf } from './state';
import type { Ctx } from './state';
import type { HeirloomDef, TriggerId } from './types';

/** Brass Thimble: +max HP (and as much current HP); the Cloak: the hero flies (Hot Wax, slides). */
function applyToHero(ctx: Ctx, seat: number, def: HeirloomDef): void {
  const hero = heroOf(ctx.s, seat);
  if (!hero) return;
  for (const op of def.effects) {
    if (op.op !== 'modify_rule') continue;
    if (op.rule === 'hero_max_hp' && op.delta) {
      hero.maxHp += op.delta;
      if (!hero.smoldering) hero.hp = Math.max(1, Math.min(hero.maxHp, hero.hp + op.delta));
      addLog(ctx, `${pieceName(ctx.reg, hero)} now has ${hero.maxHp} max HP.`, seat);
    }
    if (op.rule === 'hero_flying' && op.value === true) hero.flying = true;
  }
}

/** The seat's hero gains an Heirloom (the `heirloom` Boon). */
export function gainHeirloom(ctx: Ctx, seat: number, id: string): void {
  const def = ctx.reg.heirlooms.byId[id];
  const player = ctx.s.players[seat];
  if (!def || !player || player.heirlooms.includes(id)) return;
  player.heirlooms.push(id);
  emit(ctx, { type: 'heirloom_gained', seat, heirloomId: id });
  addLog(ctx, `${player.name} inherits the ${def.name}.`, seat);
  if (def.kind !== 'passive') return;
  runEffects(ctx, def.effects, baseEnv({ seat, ruleSource: { kind: 'heirloom', id }, defaultDuration: 'game' }));
  applyToHero(ctx, seat, def);
}

/** Run the triggered Heirlooms of every seat still in the game (Ever-Burning Wick at night_start). */
export function runHeirloomTriggers(ctx: Ctx, trigger: TriggerId): void {
  for (const player of ctx.s.players) {
    if (player.eliminated) continue;
    for (const id of player.heirlooms) {
      const def = ctx.reg.heirlooms.byId[id];
      if (!def || def.kind !== 'triggered') continue;
      runTriggered(ctx, def.effects, trigger, baseEnv({ seat: player.seat, ruleSource: { kind: 'heirloom', id }, defaultDuration: 'night' }));
    }
  }
}

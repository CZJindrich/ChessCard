/**
 * Cosmetic lighting (GDD §16.5): the darkness over the floor and the light holes cut into it.
 * Wickfolk pieces light 2.2 tiles, Lanterns and Lit Shrines 3, unlit Votive Shrines 1.5; a
 * Smoldering Wick keeps a small ember glow. The darkness deepens with Dread in Vigil and with
 * each Gloam closing in Last Flame. Radii flicker ±4%.
 */
import type { GameState } from '../../engine/types';
import { centreOf } from './bus';

export const LIGHT_RADIUS = {
  wickfolk: 2.2,
  lantern: 3,
  litShrine: 3,
  shrine: 1.5,
  smoldering: 1.1,
} as const;

/** The darkness colour (rgb of rgba(5,4,10,α)). */
export const DARKNESS_RGB = [5, 4, 10] as const;

export const FLICKER = 0.04;

export interface LightSource {
  /** Stable key so moving lights can glide (piece id or "tile:x,y"). */
  id: string;
  /** Board point (engine axes, continuous). */
  x: number;
  y: number;
  radius: number;
  /** Phase offset for the flicker. */
  phase: number;
}

function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 6283) / 1000;
}

function light(id: string, at: { x: number; y: number }, radius: number): LightSource {
  return { id, x: at.x, y: at.y, radius, phase: phaseOf(id) };
}

/** Every light on the board right now. */
export function lightSources(state: GameState): LightSource[] {
  const out: LightSource[] = [];
  for (const piece of Object.values(state.pieces)) {
    if (piece.side !== 'wick') continue;
    const radius = piece.smoldering ? LIGHT_RADIUS.smoldering : piece.defId === 'lantern' ? LIGHT_RADIUS.lantern : LIGHT_RADIUS.wickfolk;
    out.push(light(piece.id, centreOf(piece.pos, piece.size), radius));
  }
  state.board.tiles.forEach((tile, i) => {
    if (tile.type !== 'votive_shrine') return;
    const pos = { x: i % state.board.w, y: Math.floor(i / state.board.w) };
    out.push(light(`tile:${pos.x},${pos.y}`, centreOf(pos), tile.shrineLit ? LIGHT_RADIUS.litShrine : LIGHT_RADIUS.shrine));
  });
  return out;
}

/** α of the darkness: 0.30 + 0.30 × Dread/M (Vigil) or × closings/C (Last Flame). */
export function darknessAlpha(state: GameState): number {
  if (state.vigil) return 0.3 + 0.3 * Math.min(1, state.vigil.dread / Math.max(1, state.vigil.dreadMax));
  const gloam = state.lastFlame?.gloam;
  if (gloam && gloam.total > 0) return 0.3 + 0.3 * Math.min(1, gloam.closingsDone / gloam.total);
  return 0.3;
}

/** Radius multiplier at time `t` (ms): 1 ± 4%, two detuned waves so it never looks periodic. */
export function flicker(t: number, phase: number): number {
  const wave = 0.6 * Math.sin(t / 170 + phase) + 0.4 * Math.sin(t / 61 + phase * 2.3);
  return 1 + FLICKER * wave;
}

/**
 * The boss intro's pattern diagrams (GDD §15.1.9): each phase-1 intent drawn on a small grid
 * around the 2×2 footprint — red cells where it hits, push arrows, and an aim line for
 * attacks that pick a far tile. Pure: grid cells only, the component draws them.
 */
import type { BossIntentDef } from '../../engine/types';

export interface Cell {
  x: number;
  y: number;
}

export interface IntentDiagram {
  cols: number;
  rows: number;
  /** Top-left cell of the 2×2 footprint (y down). */
  boss: Cell;
  hits: Cell[];
  arrows: Array<Cell & { dx: number; dy: number }>;
  /** Aimed attacks: a dotted line from the footprint to the target cell. */
  aim: Cell | null;
  /** No board area (Silencing Peal). */
  global: boolean;
}

const COLS = 8;
const ROWS = 6;
const BOSS: Cell = { x: 1, y: 2 };

function rect(x0: number, y0: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push({ x, y });
  return out;
}

function ring12(): Cell[] {
  return rect(BOSS.x - 1, BOSS.y - 1, 4, 4).filter((c) => !(c.x >= BOSS.x && c.x < BOSS.x + 2 && c.y >= BOSS.y && c.y < BOSS.y + 2));
}

function outward(c: Cell): Cell & { dx: number; dy: number } {
  const cx = BOSS.x + 0.5;
  const cy = BOSS.y + 0.5;
  return { ...c, dx: Math.sign(Math.round(c.x - cx)), dy: Math.sign(Math.round(c.y - cy)) };
}

function shape(def: BossIntentDef): { hits: Cell[]; aim: Cell | null } {
  const right = BOSS.x + 2;
  switch (def.area) {
    case 'block2x2':
      return { hits: rect(5, 0, 2, 2), aim: { x: 6, y: 1 } };
    case 'ring12':
      return { hits: ring12(), aim: null };
    case 'side2':
      return { hits: rect(right, BOSS.y, 1, 2), aim: null };
    case 'beam2': {
      const length = def.reach.kind === 'beam' ? def.reach.length : 3;
      return { hits: rect(right, BOSS.y, Math.min(length, COLS - right), 2), aim: null };
    }
    case 'square3':
      return { hits: rect(4, 1, 3, 3), aim: { x: 5, y: 2 } };
    case 'single':
    default: {
      const max = def.reach.kind === 'within' ? def.reach.max : 3;
      const d = Math.min(max, 4);
      const target = { x: Math.min(COLS - 1, right - 1 + d), y: 1 };
      return { hits: [target], aim: target };
    }
  }
}

export function intentDiagram(def: BossIntentDef): IntentDiagram {
  if (def.area === 'global') return { cols: COLS, rows: ROWS, boss: BOSS, hits: [], arrows: [], aim: null, global: true };
  const { hits, aim } = shape(def);
  let arrows: IntentDiagram['arrows'] = [];
  if (def.push > 0) {
    if (def.pushMode === 'along') arrows = hits.filter((c) => c.x === hits[hits.length - 1].x).map((c) => ({ ...c, dx: 1, dy: 0 }));
    else if (def.area === 'ring12') arrows = hits.filter((_, i) => i % 3 === 1).map(outward);
    else arrows = hits.map((c) => ({ ...c, dx: 1, dy: 0 }));
  }
  return { cols: COLS, rows: ROWS, boss: BOSS, hits, arrows, aim, global: false };
}

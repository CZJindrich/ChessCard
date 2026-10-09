/**
 * The Guttered King's escape arrows (GDD §15.5, §10.3): around his footprint, one arrow per step
 * vector, blue for open and a grey ✕ for blocked, with "Escapes: n" under him and "CHECK!" at
 * 1–2 escapes. Hot Wax counts as open (the engine's `openEscapes`).
 */
import type { ReactElement } from 'react';
import { openEscapes } from '../../engine';
import type { Dir, GameState, Piece } from '../../engine/types';
import type { ControllerSnapshot } from '../../game';
import { useRegistry } from './context';
import { TILE, type BoardMetrics } from './geometry';

const DIRS: readonly Dir[] = [
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

const OPEN = '#7FC8FF';
const BLOCKED = '#8A8398';

/** Whether this boss has the CHECK / CHECKMATE special. */
function hasSmotheredMate(state: GameState, reg: ReturnType<typeof useRegistry>): boolean {
  const def = state.boss ? reg.bosses.byId[state.boss.id] : undefined;
  return def?.special?.op === 'custom' && def.special.id === 'smothered_mate';
}

export function escapeDirs(state: GameState, boss: Piece): Dir[] {
  return state.boss?.escapeDirs ?? openEscapes(state, boss);
}

function Arrow({ cx, cy, dir, open }: { cx: number; cy: number; dir: Dir; open: boolean }): ReactElement {
  const angle = (Math.atan2(-dir.y, dir.x) * 180) / Math.PI;
  if (!open) {
    return (
      <g transform={`translate(${cx} ${cy})`} className="ww-escape ww-escape--blocked">
        <circle r={8.5} fill="#15121B" stroke={BLOCKED} strokeWidth={1.6} opacity={0.9} />
        <path d="M-4,-4L4,4M4,-4L-4,4" stroke={BLOCKED} strokeWidth={2.4} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${angle})`} className="ww-escape ww-escape--open">
      <path d="M-9,-6.5L3,-6.5L3,-11.5L12.5,0L3,11.5L3,6.5L-9,6.5Z" fill={OPEN} stroke="#0D2238" strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
}

export function BossMarks({ snap, metrics }: { snap: ControllerSnapshot; metrics: BoardMetrics }): ReactElement | null {
  const registry = useRegistry();
  const { state } = snap;
  const bossState = state.boss;
  const boss = bossState ? state.pieces[bossState.pieceId] : undefined;
  if (!boss || state.result || !hasSmotheredMate(state, registry)) return null;
  const open = escapeDirs(state, boss);
  const isOpen = (d: Dir): boolean => open.some((o) => o.x === d.x && o.y === d.y);
  const rows = state.board.h;
  // Footprint centre in board units (64 per tile, y down).
  const cx = (boss.pos.x + boss.size / 2) * TILE;
  const cy = (rows - boss.pos.y - boss.size / 2) * TILE;
  const reach = (boss.size / 2) * TILE + 13;
  const count = open.length;
  const check = count >= 1 && count <= 2;
  const below = boss.pos.y > 0;
  const labelY = below ? cy + reach + 22 : cy - reach - 46;
  return (
    <svg
      className="ww-art ww-marks ww-marks--boss"
      width={metrics.cols * metrics.tile}
      height={metrics.rows * metrics.tile}
      viewBox={`0 0 ${metrics.cols * TILE} ${metrics.rows * TILE}`}
      aria-hidden="true"
    >
      {DIRS.map((d) => (
        <Arrow key={`${d.x},${d.y}`} cx={cx + d.x * reach} cy={cy - d.y * reach} dir={d} open={isOpen(d)} />
      ))}
      <g transform={`translate(${cx} ${labelY})`} className={check ? 'ww-escape-label ww-escape-label--check' : 'ww-escape-label'}>
        <rect x={-46} y={-12} width={92} height={22} rx={11} fill="rgba(13,11,18,0.88)" stroke={check ? '#E5383B' : OPEN} strokeWidth={1.4} />
        <text className="ww-num" y={4} textAnchor="middle" fontSize={12.5} fill={check ? '#FFD86B' : '#D9E2F2'}>
          {count === 0 ? 'Boxed in!' : `Escapes: ${count}`}
        </text>
        {check && (
          <text className="ww-escape-check" y={-20} textAnchor="middle" fontSize={17} fill="#FF5A4E" stroke="#2A0608" strokeWidth={3} paintOrder="stroke">
            CHECK!
          </text>
        )}
      </g>
    </svg>
  );
}

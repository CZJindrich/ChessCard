/**
 * BoardArt — the engraved stone chequer with its carved frame and Cinzel coordinates
 * (§16.5). Board space is 64 units per tile; `children` are drawn in board space above
 * the tiles (use `tileOrigin` to place things). Rank 1 is at the bottom unless `flipped`.
 */
import type { ReactElement, ReactNode } from 'react';
import { PALETTE } from '../palette';
import { lighten } from '../util/color';
import { fmt } from '../util/path';
import { cx, useSvgIds } from '../util/svg';
import { GloamFog, GloamWarningBand } from './overlays';
import { Flagstone, PillarColumn, PillarShadow, RubbleFloor, TileGraphic, useGrainPattern, type TileLayer } from './tiles';
import '../art.css';

export const TILE = 64;
export const FRAME = 30;
export const FILES = 'abcdefghijkl';

export interface BoardTileSpec {
  id: string;
  /** Votive Shrine lit. */
  lit?: boolean;
  /** Chimney pair index. */
  pair?: number;
}

export interface BoardPos {
  x: number;
  y: number;
}

export interface BoardArtProps {
  cols: number;
  rows: number;
  /** Non-flagstone tiles keyed by `"x,y"` (engine posKey). Strings are tile ids. */
  tiles?: Readonly<Record<string, BoardTileSpec | string>>;
  /** Tiles covered by Gloam / showing the Gloam warning, as `"x,y"` keys. */
  gloam?: readonly string[];
  gloamWarning?: readonly string[];
  /** Tile size in px. */
  tileSize?: number;
  /** `floor` for under the darkness canvas, `glyph` for hazard glyphs above it. */
  layer?: TileLayer;
  frame?: boolean;
  flipped?: boolean;
  animated?: boolean;
  seed?: string;
  children?: ReactNode;
  className?: string;
}

/** Top-left of a tile in board space (64 units per tile). */
export function tileOrigin(pos: BoardPos, cols: number, rows: number, flipped = false): { x: number; y: number } {
  const col = flipped ? cols - 1 - pos.x : pos.x;
  const row = flipped ? pos.y : rows - 1 - pos.y;
  return { x: col * TILE, y: row * TILE };
}

function specAt(tiles: BoardArtProps['tiles'], key: string): BoardTileSpec | null {
  const raw = tiles?.[key];
  if (!raw) return null;
  return typeof raw === 'string' ? { id: raw } : raw;
}

function keyToPos(key: string): BoardPos {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function Frame({ cols, rows, flipped }: { cols: number; rows: number; flipped: boolean }): ReactElement {
  const w = cols * TILE;
  const h = rows * TILE;
  const labels: ReactElement[] = [];
  for (let c = 0; c < cols; c++) {
    const file = FILES[flipped ? cols - 1 - c : c] ?? '?';
    const x = c * TILE + TILE / 2;
    labels.push(
      <text key={`fb${c}`} className="ww-label" x={x} y={h + 21} fontSize={14} textAnchor="middle" fill={PALETTE.ashText}>
        {file}
      </text>,
      <text key={`ft${c}`} className="ww-label" x={x} y={-11} fontSize={14} textAnchor="middle" fill={PALETTE.ashText} opacity={0.7}>
        {file}
      </text>,
    );
  }
  for (let r = 0; r < rows; r++) {
    const rank = flipped ? r + 1 : rows - r;
    const y = r * TILE + TILE / 2 + 5;
    labels.push(
      <text key={`rl${r}`} className="ww-label" x={-15} y={y} fontSize={14} textAnchor="middle" fill={PALETTE.ashText}>
        {rank}
      </text>,
      <text key={`rr${r}`} className="ww-label" x={w + 15} y={y} fontSize={14} textAnchor="middle" fill={PALETTE.ashText} opacity={0.7}>
        {rank}
      </text>,
    );
  }
  const corner = (x: number, y: number, key: string): ReactElement => (
    <g key={key} transform={`translate(${x} ${y})`}>
      <circle r={9} fill={PALETTE.velvetDusk} stroke={PALETTE.brass} strokeWidth={1.4} />
      <path d="M0,-6L1.8,-1.8L6,0L1.8,1.8L0,6L-1.8,1.8L-6,0L-1.8,-1.8Z" fill={PALETTE.brass} />
    </g>
  );
  return (
    <g className="ww-board-frame">
      <rect x={-FRAME} y={-FRAME} width={w + FRAME * 2} height={h + FRAME * 2} rx={10} fill={PALETTE.velvetDusk} />
      <rect x={-FRAME + 3} y={-FRAME + 3} width={w + FRAME * 2 - 6} height={h + FRAME * 2 - 6} rx={8} fill="none" stroke={PALETTE.engraving} strokeWidth={1.4} />
      <rect x={-FRAME + 6.5} y={-FRAME + 6.5} width={w + FRAME * 2 - 13} height={h + FRAME * 2 - 13} rx={6} fill="none" stroke={lighten(PALETTE.velvetDusk, 0.12)} strokeWidth={0.8} />
      <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={2} fill={PALETTE.grout} stroke={PALETTE.engraving} strokeWidth={1.2} />
      <path d={`M${-FRAME + 3},${-FRAME + 14}Q${-FRAME + 3},${-FRAME + 3} ${-FRAME + 14},${-FRAME + 3}`} stroke={PALETTE.brass} strokeOpacity={0.5} strokeWidth={1} fill="none" />
      {corner(-FRAME / 2, -FRAME / 2, 'tl')}
      {corner(w + FRAME / 2, -FRAME / 2, 'tr')}
      {corner(-FRAME / 2, h + FRAME / 2, 'bl')}
      {corner(w + FRAME / 2, h + FRAME / 2, 'br')}
      {labels}
    </g>
  );
}

export function BoardArt({
  cols,
  rows,
  tiles,
  gloam = [],
  gloamWarning = [],
  tileSize = 48,
  layer = 'all',
  frame = true,
  flipped = false,
  animated = true,
  seed = 'board',
  children,
  className,
}: BoardArtProps): ReactElement {
  const ids = useSvgIds('board');
  const grain = useGrainPattern(ids);
  const margin = frame ? FRAME : 0;
  const w = cols * TILE + margin * 2;
  const h = rows * TILE + margin * 2;
  const scale = tileSize / TILE;
  const cells: Array<{ pos: BoardPos; key: string; spec: BoardTileSpec | null; o: { x: number; y: number } }> = [];
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      cells.push({ pos: { x, y }, key, spec: specAt(tiles, key), o: tileOrigin({ x, y }, cols, rows, flipped) });
    }
  }
  const floor = layer !== 'glyph';
  const glyphs = layer !== 'floor';
  const place = (o: { x: number; y: number }): string => `translate(${fmt(o.x)} ${fmt(o.y)})`;
  return (
    <svg
      className={cx('ww-art ww-board', !animated && 'ww-still', className)}
      width={w * scale}
      height={h * scale}
      viewBox={`${-margin} ${-margin} ${w} ${h}`}
      role="img"
      aria-label={`${cols} by ${rows} board`}
    >
      {grain.def && <defs>{grain.def}</defs>}
      {floor && frame && <Frame cols={cols} rows={rows} flipped={flipped} />}
      {floor &&
        cells.map(({ pos, key, o }) => (
          <g key={`f${key}`} transform={place(o)}>
            <Flagstone variant={(pos.x + pos.y) % 2 === 0 ? 'a' : 'b'} seed={`${seed}${key}`} grainUrl={grain.url} />
          </g>
        ))}
      {floor &&
        cells
          .filter((c) => c.spec?.id === 'rubble')
          .map(({ key, o }) => (
            <g key={`r${key}`} transform={place(o)}>
              <RubbleFloor seed={`${seed}${key}`} />
            </g>
          ))}
      {floor &&
        cells
          .filter((c) => c.spec?.id === 'pillar')
          .map(({ key, o }) => (
            <g key={`ps${key}`} transform={place(o)}>
              <PillarShadow />
            </g>
          ))}
      {floor &&
        cells
          .filter((c) => c.spec?.id === 'pillar')
          .map(({ key, o }) => (
            <g key={`pc${key}`} transform={place(o)}>
              <PillarColumn />
            </g>
          ))}
      {glyphs &&
        cells
          .filter((c) => c.spec && ['votive_shrine', 'chimney', 'hot_wax'].includes(c.spec.id))
          .map(({ key, o, spec }) => (
            <TileGraphic key={`g${key}`} tileId={spec?.id ?? 'flagstone'} layer="glyph" lit={spec?.lit} pairIndex={spec?.pair} x={o.x} y={o.y} seed={`${seed}${key}`} animated={animated} />
          ))}
      {glyphs &&
        gloam.map((key) => {
          const o = tileOrigin(keyToPos(key), cols, rows, flipped);
          return <GloamFog key={`gl${key}`} x={o.x} y={o.y} seed={`${seed}${key}`} animated={animated} />;
        })}
      {glyphs &&
        gloamWarning.map((key) => {
          const o = tileOrigin(keyToPos(key), cols, rows, flipped);
          return <GloamWarningBand key={`gw${key}`} x={o.x} y={o.y} animated={animated} />;
        })}
      {children}
    </svg>
  );
}

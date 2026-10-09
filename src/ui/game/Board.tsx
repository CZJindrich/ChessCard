/**
 * The board (GDD §15.4 centre, §15.5 render order): the carved floor, the darkness canvas with
 * its light holes, hazard glyphs, floor marks (Plumes, intents, target glows, range ring, deploy
 * zone), the pieces, then dots, rings and previews, the particle canvas, numbers and pings, and
 * finally the transparent input layer (BoardInput). The whole board zooms and pans (§15.4) and
 * shakes on heavy moments (§16.9).
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from 'react';
import { BoardArt, type BoardTileSpec } from '../../art';
import { posKey } from '../../engine';
import type { GameState } from '../../engine/types';
import { usePresentation } from '../app/services';
import { centreOf, darknessAlpha, DarknessCanvas, lightSources, ParticleCanvas, useFxBus, useShake, type BoardPoint } from '../fx';
import { BossMarks } from './BossMarks';
import { MarksOver, MarksUnder } from './BoardMarks';
import { useGameSnapshot } from './context';
import { FxLayer } from './FxLayer';
import { fitBoard } from './geometry';
import { BoardInput } from './BoardInput';
import { InspectTooltip } from './InspectTooltip';
import { PiecesLayer } from './PiecesLayer';
import { PingLayer } from './PingLayer';
import { useGameUi, useGameUiState } from './uiStore';
import { useBoardModel } from './useBoardModel';

interface FloorSpec {
  cols: number;
  rows: number;
  tiles: Record<string, BoardTileSpec>;
  gloam: string[];
  gloamWarning: string[];
  key: string;
}

function floorSpec(state: GameState): FloorSpec {
  const tiles: Record<string, BoardTileSpec> = {};
  const gloam: string[] = [];
  const gloamWarning: string[] = [];
  state.board.tiles.forEach((tile, i) => {
    const key = posKey({ x: i % state.board.w, y: Math.floor(i / state.board.w) });
    if (tile.type !== 'flagstone') tiles[key] = { id: tile.type, lit: tile.shrineLit, pair: tile.chimneyPair ?? undefined };
    if (tile.gloam) gloam.push(key);
    else if (tile.gloamWarning) gloamWarning.push(key);
  });
  const key = JSON.stringify([state.board.w, state.board.h, tiles, gloam, gloamWarning]);
  return { cols: state.board.w, rows: state.board.h, tiles, gloam, gloamWarning, key };
}

interface FloorProps {
  spec: FloorSpec;
  tile: number;
  layer: 'floor' | 'glyph';
  animated: boolean;
  seed: string;
}

/** The floor only re-renders when the tiles change (it is the heaviest SVG on screen). */
const Floor = memo(
  function Floor({ spec, tile, layer, animated, seed }: FloorProps): ReactElement {
    return (
      <BoardArt
        className={`ww-gameboard__${layer}`}
        cols={spec.cols}
        rows={spec.rows}
        tiles={spec.tiles}
        gloam={spec.gloam}
        gloamWarning={spec.gloamWarning}
        tileSize={tile}
        layer={layer}
        animated={animated}
        seed={seed}
      />
    );
  },
  (a, b) => a.spec.key === b.spec.key && a.tile === b.tile && a.layer === b.layer && a.animated === b.animated && a.seed === b.seed,
);

function useElementSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => setSize((prev) => (prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Gloam tiles drift fog (§16.5). */
function gloamPoints(spec: FloorSpec): BoardPoint[] {
  return spec.gloam.map((key) => {
    const [x, y] = key.split(',').map(Number);
    return centreOf({ x, y });
  });
}

export function Board(): ReactElement {
  const snap = useGameSnapshot();
  const presentation = usePresentation();
  const bus = useFxBus();
  const ui = useGameUi();
  const { zoom } = useGameUiState();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const size = useElementSize(stageRef);
  const { state } = snap;
  const spec = useMemo(() => floorSpec(state), [state]);
  const stableSpec = useStableSpec(spec);
  const metrics = fitBoard(state.board.w, state.board.h, size.w, size.h);
  const model = useBoardModel(snap);
  const animated = !presentation.reduced_motion;
  const lights = useMemo(() => lightSources(state), [state]);
  const fog = useMemo(() => gloamPoints(stableSpec), [stableSpec]);
  const seed = `${state.seed}:${state.night}`;
  const tilesStyle: CSSProperties = { left: metrics.frame, top: metrics.frame, width: metrics.cols * metrics.tile, height: metrics.rows * metrics.tile };
  const ready = size.w > 0 && size.h > 0;
  useShake(boardRef, bus, presentation.screen_shake && animated);
  useEffect(() => ui.setBoardSize(metrics.width, metrics.height), [ui, metrics.width, metrics.height]);
  const zoomed = zoom.scale > 1;
  const boardStyle = {
    width: metrics.width,
    height: metrics.height,
    '--ww-tile': `${metrics.tile}px`,
    transform: zoomed ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` : undefined,
  } as CSSProperties;
  return (
    <div ref={stageRef} className={`ww-board-stage${zoomed ? ' ww-board-stage--zoomed' : ''}`}>
      {ready && (
        <div ref={boardRef} className="ww-gameboard" style={boardStyle} data-tile={metrics.tile}>
          <Floor spec={stableSpec} tile={metrics.tile} layer="floor" animated={animated} seed={seed} />
          <div className="ww-gameboard__dark" style={tilesStyle}>
            <DarknessCanvas className="ww-fx-darkness" cols={metrics.cols} rows={metrics.rows} tile={metrics.tile} lights={lights} alpha={darknessAlpha(state)} animated={animated} />
          </div>
          <Floor spec={stableSpec} tile={metrics.tile} layer="glyph" animated={animated} seed={seed} />
          <div className="ww-gameboard__tiles" style={tilesStyle}>
            <MarksUnder snap={snap} model={model} metrics={metrics} />
            <PiecesLayer snap={snap} model={model} metrics={metrics} />
            <MarksOver snap={snap} model={model} metrics={metrics} />
            <BossMarks snap={snap} metrics={metrics} />
            <ParticleCanvas className="ww-fx-particles" bus={bus} cols={metrics.cols} rows={metrics.rows} tile={metrics.tile} enabled={animated} ambient={fog} />
            <FxLayer metrics={metrics} />
            <PingLayer metrics={metrics} />
            <BoardInput metrics={metrics} />
            <InspectTooltip model={model} metrics={metrics} />
          </div>
        </div>
      )}
      {zoomed && (
        <button type="button" className="ww-zoom-reset" onClick={() => ui.resetZoom()} aria-label="Fit the board">
          {Math.round(zoom.scale * 100)}% · Fit
        </button>
      )}
    </div>
  );
}

/** Keep the same spec object while its content key is unchanged (memo-friendly). */
function useStableSpec(spec: FloorSpec): FloorSpec {
  const ref = useRef(spec);
  if (ref.current.key !== spec.key) ref.current = spec;
  return ref.current;
}

/**
 * Board marks in board space (64 units per tile), GDD §15.5.
 * - `MarksUnder` (below the pieces): Smoke Plumes, the intent tiles (red fill, hatching, ✕,
 *   damage, queue, push arrows), the deploy zone, the selected tile, card target glows, the dashed
 *   range ring, dimmed invalid tiles and the inspected enemy's move range.
 * - `MarksOver` (above the pieces): intent frames and badges where a piece stands in the red,
 *   gold move dots and strike rings with their previews, card previews, End Turn preview tiles
 *   and the hint. Looping motion is frozen by the art's `.ww-reduced-motion` switch.
 */
import type { ReactElement, ReactNode } from 'react';
import { CHIMNEY_PAIR_COLORS, DamageBadge, IntentTile, MoveDot, PALETTE, PieceGraphic, PushArrow, SkullBadge, SmokePlumeToken, StrikeRing, type Dir } from '../../art';
import { posKey } from '../../engine';
import type { Action, EffectPreview, GameState, Intent, Pos } from '../../engine/types';
import type { ControllerSnapshot, PieceHighlights } from '../../game';
import { houseColorOf } from './pieceView';
import { TILE, tileCentreUnits, tileUnits, type BoardMetrics } from './geometry';
import type { BoardModel, TargetingModel } from './useBoardModel';

interface LayerProps {
  snap: ControllerSnapshot;
  model: BoardModel;
  metrics: BoardMetrics;
}

function Svg({ metrics, className, children }: { metrics: BoardMetrics; className: string; children: ReactNode }): ReactElement {
  return (
    <svg className={`ww-art ww-marks ${className}`} width={metrics.cols * metrics.tile} height={metrics.rows * metrics.tile} viewBox={`0 0 ${metrics.cols * TILE} ${metrics.rows * TILE}`} aria-hidden="true">
      {children}
    </svg>
  );
}

function at(pos: Pos, rows: number): string {
  const o = tileUnits(pos, rows);
  return `translate(${o.x} ${o.y})`;
}

// =============================================================================================
// Under the pieces
// =============================================================================================

function Plumes({ state }: { state: GameState }): ReactElement {
  return (
    <g className="ww-marks__plumes">
      {state.plumes.map((m) => (
        <g key={m.id} transform={at(m.pos, state.board.h)} className="ww-plume-mark">
          <SmokePlumeToken enemyId={m.enemyId} seed={m.id} />
        </g>
      ))}
    </g>
  );
}

function TileFill({ pos, rows, color, opacity, className }: { pos: Pos; rows: number; color: string; opacity: number; className?: string }): ReactElement {
  const o = tileUnits(pos, rows);
  return <rect className={className} x={o.x + 2} y={o.y + 2} width={TILE - 4} height={TILE - 4} rx={6} fill={color} opacity={opacity} />;
}

function TileOutline({ pos, rows, color, dashed = false, width = 2.4, className }: { pos: Pos; rows: number; color: string; dashed?: boolean; width?: number; className?: string }): ReactElement {
  const o = tileUnits(pos, rows);
  return <rect className={className} x={o.x + 3} y={o.y + 3} width={TILE - 6} height={TILE - 6} rx={6} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dashed ? '5 4' : undefined} />;
}

/** Dashed rune ring: a square at Chebyshev radius r around the centre tile. */
function RangeRing({ centre, radius, rows, cols, color }: { centre: Pos; radius: number; rows: number; cols: number; color: string }): ReactElement {
  const minX = Math.max(0, centre.x - radius);
  const maxX = Math.min(cols - 1, centre.x + radius);
  const minY = Math.max(0, centre.y - radius);
  const maxY = Math.min(rows - 1, centre.y + radius);
  const x = minX * TILE + 2;
  const y = (rows - 1 - maxY) * TILE + 2;
  const w = (maxX - minX + 1) * TILE - 4;
  const h = (maxY - minY + 1) * TILE - 4;
  return (
    <g className="ww-range-ring">
      <rect x={x} y={y} width={w} height={h} rx={14} fill="none" stroke="#0D0B12" strokeWidth={5} opacity={0.5} />
      <rect x={x} y={y} width={w} height={h} rx={14} fill="none" stroke={color} strokeWidth={2.2} strokeDasharray="10 7" />
    </g>
  );
}

function allTiles(state: GameState): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < state.board.h; y++) for (let x = 0; x < state.board.w; x++) out.push({ x, y });
  return out;
}

function TargetFloor({ state, targeting }: { state: GameState; targeting: TargetingModel }): ReactElement {
  const rows = state.board.h;
  const valid = new Set(targeting.info.targets.flatMap((t) => footprintKeys(state, t.pos, t.choice.kind === 'piece' ? t.choice.pieceId : null)));
  const picked = new Set(targeting.picks.map(posKey));
  const ring = targeting.info.rangeRing;
  const boardWide = targeting.info.steps === 0;
  return (
    <g className="ww-marks__targets">
      {!boardWide && allTiles(state).filter((p) => !valid.has(posKey(p)) && !picked.has(posKey(p))).map((p) => <TileFill key={posKey(p)} pos={p} rows={rows} color={PALETTE.nightInk} opacity={0.45} />)}
      {targeting.info.targets.map((t) => (
        <g key={posKey(t.pos)} className="ww-target-glow">
          <TileFill pos={t.pos} rows={rows} color={targeting.color} opacity={0.22} />
          <TileOutline pos={t.pos} rows={rows} color={targeting.color} width={2.2} />
        </g>
      ))}
      {targeting.picks.map((p) => (
        <TileOutline key={`pick${posKey(p)}`} pos={p} rows={rows} color={PALETTE.flameCore} width={3.4} />
      ))}
      {ring && <RangeRing centre={ring.centre} radius={ring.radius} rows={rows} cols={state.board.w} color={targeting.color} />}
    </g>
  );
}

function footprintKeys(state: GameState, pos: Pos, pieceId: string | null): string[] {
  const piece = pieceId ? state.pieces[pieceId] : undefined;
  if (!piece || piece.size === 1) return [posKey(pos)];
  const out: string[] = [];
  for (let dy = 0; dy < piece.size; dy++) for (let dx = 0; dx < piece.size; dx++) out.push(posKey({ x: piece.pos.x + dx, y: piece.pos.y + dy }));
  return out;
}

function MoveRange({ keys, rows }: { keys: Set<string>; rows: number }): ReactElement {
  return (
    <g className="ww-marks__range">
      {[...keys].map((key) => {
        const [x, y] = key.split(',').map(Number);
        return <TileOutline key={key} pos={{ x, y }} rows={rows} color="#FFFFFF" dashed width={1.6} />;
      })}
    </g>
  );
}

export function MarksUnder({ snap, model, metrics }: LayerProps): ReactElement {
  const { state, latest, selection } = snap;
  const rows = state.board.h;
  const selected = selection.pieceId ? latest.pieces[selection.pieceId] : undefined;
  const uiSeat = snap.uiSeat;
  const zone = latest.phase === 'night_setup' && uiSeat !== null ? model.deploy : [];
  return (
    <Svg metrics={metrics} className="ww-marks--under">
      <Plumes state={state} />
      <IntentFloor state={state} model={model} show={selection.showIntents} />
      {zone.map((p) => (
        <g key={`dz${posKey(p)}`} className="ww-deploy-tile">
          <TileFill pos={p} rows={rows} color={PALETTE.candleGold} opacity={0.16} />
          <TileOutline pos={p} rows={rows} color={PALETTE.candleGold} dashed width={1.6} />
        </g>
      ))}
      {selected && !snap.animating && (
        <g className="ww-selected-tile">
          <TileFill pos={selected.pos} rows={rows} color={houseColorOf(latest, selected.owner) ?? PALETTE.candleGold} opacity={0.28} />
        </g>
      )}
      {model.targeting && <TargetFloor state={latest} targeting={model.targeting} />}
      {model.inspectRange.size > 0 && <MoveRange keys={model.inspectRange} rows={rows} />}
      {selection.hover && !snap.animating && <TileOutline pos={selection.hover} rows={rows} color={PALETTE.tallowText} width={1.4} className="ww-hover-tile" />}
    </Svg>
  );
}

// =============================================================================================
// Above the pieces
// =============================================================================================

function screenDir(dir: Pos): Dir {
  return { dx: Math.sign(dir.x), dy: -Math.sign(dir.y) };
}

/** Push direction of an intent on one of its tiles (from the attacker, or the aimed direction). */
function intentPush(state: GameState, intent: Intent, tile: Pos): Dir | undefined {
  if (intent.push <= 0 && intent.pull <= 0) return undefined;
  if (intent.dir && intent.pushMode === 'along') return screenDir(intent.dir);
  const attacker = state.pieces[intent.attackerId];
  if (!attacker) return intent.dir ? screenDir(intent.dir) : undefined;
  const cx = attacker.pos.x + (attacker.size - 1) / 2;
  const cy = attacker.pos.y + (attacker.size - 1) / 2;
  const d = { x: tile.x - cx, y: tile.y - cy };
  const sign = intent.pull > 0 ? -1 : 1;
  return { dx: Math.sign(d.x) * sign, dy: -Math.sign(d.y) * sign };
}

interface IntentCell {
  pos: Pos;
  damage: number;
  queue: number;
  push: Dir | undefined;
  ids: string[];
}

function intentCells(state: GameState, model: BoardModel): IntentCell[] {
  const cells = new Map<string, IntentCell>();
  for (const view of model.intents) {
    const intent = state.intents.find((i) => i.id === view.intentId);
    for (const tile of view.tiles) {
      if (tile.x < 0 || tile.y < 0 || tile.x >= state.board.w || tile.y >= state.board.h) continue;
      const key = posKey(tile);
      const cell = cells.get(key);
      const push = intent ? intentPush(state, intent, tile) : undefined;
      if (cell) {
        cell.damage += view.damage;
        cell.queue = Math.min(cell.queue, view.queue);
        cell.push = cell.push ?? push;
        cell.ids.push(view.intentId);
      } else {
        cells.set(key, { pos: tile, damage: view.damage, queue: view.queue, push, ids: [view.intentId] });
      }
    }
  }
  return [...cells.values()];
}

function intentFirstTiles(model: BoardModel): Map<number, string> {
  const first = new Map<number, string>();
  for (const view of model.intents) {
    const sorted = view.tiles.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    if (sorted[0]) first.set(view.queue, posKey(sorted[0]));
  }
  return first;
}

function occupied(state: GameState, pos: Pos): boolean {
  return Object.values(state.pieces).some((p) => p.size === 1 && p.pos.x === pos.x && p.pos.y === pos.y);
}

interface IntentLayerProps {
  state: GameState;
  model: BoardModel;
  show: boolean;
}

/**
 * Under the pieces: the full intent tile (red fill, hatching, ✕, damage, queue, push arrow), so a
 * piece standing in the red stays readable on top of it.
 */
function IntentFloor({ state, model, show }: IntentLayerProps): ReactElement | null {
  if (!show && model.focusIntents.size === 0) return null;
  const first = intentFirstTiles(model);
  const rows = state.board.h;
  return (
    <g className="ww-marks__intents">
      {intentCells(state, model).map((cell) => {
        const focused = cell.ids.some((id) => model.focusIntents.has(id));
        if (!show && !focused) return null;
        const o = tileUnits(cell.pos, rows);
        const showQueue = first.get(cell.queue) === posKey(cell.pos);
        return (
          <g key={posKey(cell.pos)} className="ww-intent-cell">
            <IntentTile x={o.x} y={o.y} damage={cell.damage} queue={showQueue ? cell.queue : undefined} push={cell.push} animated />
          </g>
        );
      })}
    </g>
  );
}

/** Above the pieces: on occupied intent tiles, the red frame, damage and queue badges; focus outlines. */
function IntentBadges({ state, model, show }: IntentLayerProps): ReactElement | null {
  if (!show && model.focusIntents.size === 0) return null;
  const first = intentFirstTiles(model);
  const rows = state.board.h;
  return (
    <g className="ww-marks__intent-badges">
      {intentCells(state, model).map((cell) => {
        const focused = cell.ids.some((id) => model.focusIntents.has(id));
        if (!show && !focused) return null;
        const o = tileUnits(cell.pos, rows);
        const covered = occupied(state, cell.pos);
        const showQueue = first.get(cell.queue) === posKey(cell.pos);
        return (
          <g key={posKey(cell.pos)} transform={`translate(${o.x} ${o.y})`} className="ww-intent-badge">
            {covered && (
              <>
                <rect x={2} y={2} width={60} height={60} fill="none" stroke={PALETTE.bloodWax} strokeWidth={2.4} />
                <text className="ww-num ww-halo-text" x={54} y={60} fontSize={15} textAnchor="middle" fill="#FFFFFF" stroke="#5A0E10" strokeWidth={3.4}>
                  {cell.damage}
                </text>
                {showQueue && (
                  <g>
                    <circle cx={11} cy={11} r={8} fill="#0D0B12" stroke={PALETTE.bloodWax} strokeWidth={1.6} />
                    <text className="ww-num" x={11} y={15} fontSize={11} textAnchor="middle" fill={PALETTE.tallowText}>
                      {cell.queue}
                    </text>
                  </g>
                )}
              </>
            )}
            {focused && <rect x={1} y={1} width={TILE - 2} height={TILE - 2} fill="none" stroke="#FFFFFF" strokeWidth={2.6} />}
          </g>
        );
      })}
    </g>
  );
}

function SelectedPieceMarks({ state, hl }: { state: GameState; hl: PieceHighlights }): ReactElement {
  const rows = state.board.h;
  const piece = state.pieces[hl.pieceId];
  const color = houseColorOf(state, piece?.owner ?? null);
  return (
    <g className="ww-marks__piece">
      {hl.moves.map((m) => {
        const o = tileUnits(m.pos, rows);
        const pairTile = m.chimneyExit ? state.board.tiles[m.chimneyExit.y * state.board.w + m.chimneyExit.x] : undefined;
        const pairColor = CHIMNEY_PAIR_COLORS[(pairTile?.chimneyPair ?? 0) % CHIMNEY_PAIR_COLORS.length];
        return (
          <g key={`mv${posKey(m.pos)}`}>
            <MoveDot x={o.x} y={o.y} danger={m.danger ?? undefined} chimney={m.chimneyExit !== null} hotWax={m.hotWax} />
            {m.chimneyExit && <TileOutline pos={m.chimneyExit} rows={rows} color={pairColor} width={3} className="ww-chimney-exit" />}
          </g>
        );
      })}
      {hl.strikes.map((m) => {
        const o = tileUnits(m.pos, rows);
        const { option } = m;
        const victim = option.targetPieceId ? state.pieces[option.targetPieceId] : undefined;
        return (
          <g key={`st${posKey(m.pos)}`} className="ww-strike-mark">
            <StrikeRing x={o.x} y={o.y} damage={option.isPlume ? undefined : option.blockedByWard ? undefined : option.damage} lethal={option.lethal && !option.isPlume} />
            {option.blockedByWard && <WardBadge x={o.x} y={o.y} />}
            {option.take && piece && (
              <g transform={at(option.take, rows)} opacity={0.42} className="ww-take-ghost">
                <PieceGraphic defId={piece.defId} kind={piece.kind === 'hero' ? 'hero' : 'unit'} houseColor={color} bare animated={false} />
              </g>
            )}
            {option.push && victim && <PushPreviewMarks rows={rows} from={victim.pos} path={option.push.path} bump={option.push.bump !== null} />}
          </g>
        );
      })}
      {hl.specials.map((m) => {
        const o = tileCentreUnits(m.pos, rows);
        const tint = m.kind === 'relight' ? PALETTE.sunriseGold : PALETTE.verdigris;
        return (
          <g key={`sp${posKey(m.pos)}`} className="ww-special-mark">
            <circle cx={o.x} cy={o.y + 2} r={24} fill="none" stroke="#0D0B12" strokeWidth={5} opacity={0.6} />
            <circle cx={o.x} cy={o.y + 2} r={24} fill="none" stroke={tint} strokeWidth={2.6} strokeDasharray="4 3" />
            <text className="ww-num ww-halo-text" x={o.x} y={o.y - 21} fontSize={9} textAnchor="middle" fill={tint} stroke="#0D0B12" strokeWidth={2.6}>
              {m.kind === 'relight' ? 'RELIGHT' : 'LIGHT'}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function WardBadge({ x, y }: { x: number; y: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={34} y={2} width={28} height={15} rx={7.5} fill={PALETTE.moonmoth} stroke="#0D0B12" strokeWidth={1.2} />
      <text className="ww-num" x={48} y={13.4} fontSize={8.6} textAnchor="middle" fill="#0D0B12">
        WARD
      </text>
    </g>
  );
}

function PushPreviewMarks({ rows, from, path, bump }: { rows: number; from: Pos; path: Pos[]; bump: boolean }): ReactElement {
  let prev = from;
  return (
    <g className="ww-push-preview">
      {path.map((p, i) => {
        const dir = { dx: Math.sign(p.x - prev.x), dy: -Math.sign(p.y - prev.y) };
        const o = tileUnits(prev, rows);
        prev = p;
        return <PushArrow key={i} x={o.x} y={o.y} dir={dir} bump={bump && i === path.length - 1} />;
      })}
      {path.length === 0 && bump && <PushArrow {...tileUnits(from, rows)} dir={{ dx: 0, dy: -1 }} bump />}
    </g>
  );
}

function CardPreviewMarks({ state, preview, color }: { state: GameState; preview: EffectPreview; color: string }): ReactElement {
  const rows = state.board.h;
  return (
    <g className="ww-marks__preview">
      {preview.area.map((p) => (
        <TileOutline key={`ar${posKey(p)}`} pos={p} rows={rows} color={color} width={2.4} dashed />
      ))}
      {preview.damage.map((d, i) => {
        const piece = state.pieces[d.pieceId];
        if (!piece) return null;
        const o = tileUnits(piece.pos, rows);
        return (
          <g key={`dm${d.pieceId}${i}`}>
            {d.blockedByWard ? <WardBadge x={o.x} y={o.y} /> : <DamageBadge x={o.x} y={o.y} amount={d.amount} />}
            {d.lethal && <SkullBadge x={o.x} y={o.y} />}
          </g>
        );
      })}
      {preview.heal.map((h, i) => {
        const piece = state.pieces[h.pieceId];
        if (!piece) return null;
        const o = tileUnits(piece.pos, rows);
        return (
          <g key={`hl${h.pieceId}${i}`} transform={`translate(${o.x} ${o.y})`}>
            <rect x={38} y={2} width={24} height={15} rx={7.5} fill={PALETTE.verdigris} stroke="#0D0B12" strokeWidth={1.2} />
            <text className="ww-num" x={50} y={13.6} fontSize={11} textAnchor="middle" fill="#0D0B12">
              +{h.amount}
            </text>
          </g>
        );
      })}
      {preview.plumesPopped.map((p) => (
        <TileOutline key={`pp${posKey(p)}`} pos={p} rows={rows} color={PALETTE.plumeViolet} width={3} />
      ))}
      {preview.summon && (
        <g transform={at(preview.summon.pos, rows)} opacity={0.55} className="ww-summon-ghost">
          <PieceGraphic defId={preview.summon.defId} kind="unit" houseColor={houseColorOf(state, state.activeSeat)} bare animated={false} />
        </g>
      )}
      {preview.swap && <SwapLine a={preview.swap[0]} b={preview.swap[1]} rows={rows} color={color} />}
      {preview.push.map((p, i) => {
        const piece = state.pieces[p.pieceId];
        return piece ? <PushPreviewMarks key={`pu${i}`} rows={rows} from={piece.pos} path={p.path} bump={p.bump !== null} /> : null;
      })}
      {(preview.moves ?? []).map((mv, i) => (
        <SwapLine key={`mvl${i}`} a={mv.from} b={mv.to} rows={rows} color={color} arrow />
      ))}
      {preview.reversedIntentTiles?.map((p) => (
        <TileOutline key={`rv${posKey(p)}`} pos={p} rows={rows} color="#FFFFFF" width={2.6} dashed />
      ))}
    </g>
  );
}

function SwapLine({ a, b, rows, color, arrow = false }: { a: Pos; b: Pos; rows: number; color: string; arrow?: boolean }): ReactElement {
  const pa = tileCentreUnits(a, rows);
  const pb = tileCentreUnits(b, rows);
  return (
    <g className="ww-swap-line">
      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#0D0B12" strokeWidth={6} strokeLinecap="round" opacity={0.6} />
      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={color} strokeWidth={3} strokeDasharray={arrow ? undefined : '7 5'} strokeLinecap="round" />
      <circle cx={pb.x} cy={pb.y} r={5} fill={color} />
      {!arrow && <circle cx={pa.x} cy={pa.y} r={5} fill={color} />}
    </g>
  );
}

function PreviewTiles({ tiles, rows }: { tiles: Pos[]; rows: number }): ReactElement {
  return (
    <g className="ww-marks__end-preview">
      {tiles.map((p, i) => (
        <TileOutline key={`ep${posKey(p)}${i}`} pos={p} rows={rows} color="#FFFFFF" width={3} className="ww-end-preview-tile" />
      ))}
    </g>
  );
}

/** Where a hinted action lands on the board, if anywhere. */
function hintTarget(state: GameState, hint: Action): Pos | null {
  switch (hint.type) {
    case 'move':
      return hint.to;
    case 'strike':
      return hint.target;
    case 'light_shrine':
      return hint.shrine;
    case 'relight':
      return state.pieces[hint.wickId]?.pos ?? null;
    case 'play_card':
    case 'use_power': {
      const first = hint.targets[0];
      if (!first) return null;
      if (first.kind === 'piece') return state.pieces[first.pieceId]?.pos ?? null;
      return first.kind === 'tile' ? first.pos : null;
    }
    default:
      return null;
  }
}

function HintMarks({ state, snap }: { state: GameState; snap: ControllerSnapshot }): ReactElement | null {
  const hint = snap.selection.hint;
  const target = hint ? hintTarget(state, hint) : null;
  if (!target) return null;
  const c = tileCentreUnits(target, state.board.h);
  return (
    <g className="ww-hint-mark">
      <circle cx={c.x} cy={c.y} r={29} fill="none" stroke={PALETTE.flameCore} strokeWidth={3} strokeDasharray="3 5" />
      <text className="ww-num ww-halo-text" x={c.x} y={c.y + 40} fontSize={10} textAnchor="middle" fill={PALETTE.flameCore} stroke="#0D0B12" strokeWidth={2.6}>
        HINT
      </text>
    </g>
  );
}

export function MarksOver({ snap, model, metrics }: LayerProps): ReactElement {
  const { state, latest, selection } = snap;
  const hovered = model.targeting?.hovered;
  return (
    <Svg metrics={metrics} className="ww-marks--over">
      <IntentBadges state={state} model={model} show={selection.showIntents} />
      {model.preview && <PreviewTiles tiles={model.preview.lines.flatMap((l) => l.tiles)} rows={latest.board.h} />}
      {model.piece && <SelectedPieceMarks state={latest} hl={model.piece} />}
      {hovered && model.targeting && <CardPreviewMarks state={latest} preview={hovered.preview} color={model.targeting.color} />}
      {model.targeting?.info.steps === 0 && model.targeting.info.preview && <CardPreviewMarks state={latest} preview={model.targeting.info.preview} color={model.targeting.color} />}
      <HintMarks state={latest} snap={snap} />
    </Svg>
  );
}

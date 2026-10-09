/**
 * The board tooltip (GDD §15.5): the inspected enemy ("Ink Wretch · Soldier · 2 HP ·
 * Prefers Candles · Will lance c3 for 1 · Queue 1"), any hovered piece's basics, a danger
 * badge's warning on a move dot, or what a hovered Smoke Plume holds.
 */
import type { ReactElement } from 'react';
import type { Pos } from '../../engine/types';
import { useGameSnapshot, useRegistry } from './context';
import { tileXY, type BoardMetrics } from './geometry';
import { enemyName, inspectInfo, type InspectInfo } from './model';
import type { BoardModel } from './useBoardModel';

function same(a: Pos | null, b: Pos): boolean {
  return a !== null && a.x === b.x && a.y === b.y;
}

export function InspectTooltip({ model, metrics }: { model: BoardModel; metrics: BoardMetrics }): ReactElement | null {
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const hover = snap.selection.hover;
  let info: InspectInfo | null = null;
  let anchor: Pos | null = null;
  let tone = 'piece';

  const dangerDot = hover ? model.piece?.moves.find((m) => same(hover, m.pos) && m.danger !== null) : undefined;
  const plume = hover ? snap.state.plumes.find((m) => same(hover, m.pos)) : undefined;
  if (dangerDot && dangerDot.danger !== null) {
    info = { title: '⚠ Danger', lines: [`Will be struck for ${dangerDot.danger} at the Snuff Strike`] };
    anchor = dangerDot.pos;
    tone = 'danger';
  } else if (model.inspect) {
    info = inspectInfo(snap.state, registry, model.inspect);
    anchor = model.inspect.pos;
    tone = model.inspect.side === 'snuff' ? 'snuff' : 'piece';
  } else if (plume && !snap.selection.card) {
    info = {
      title: `Smoke Plume · ${enemyName(registry, plume.enemyId)}`,
      lines: [`A ${enemyName(registry, plume.enemyId)} rises here after the Snuff Strike.`, 'Stand on it to block it (take 1), or strike it to pop it.'],
    };
    anchor = plume.pos;
    tone = 'plume';
  }
  if (!info || !anchor) return null;
  const o = tileXY(anchor, metrics);
  const below = anchor.y >= snap.state.board.h - 2;
  const left = Math.min(Math.max(o.x + metrics.tile / 2, 110), metrics.cols * metrics.tile - 110);
  const style = below ? { left, top: o.y + metrics.tile + 6 } : { left, top: o.y - 6 };
  return (
    <div className={`ww-inspect ww-inspect--${tone}${below ? ' ww-inspect--below' : ''}`} style={style} role="tooltip">
      <div className="ww-inspect__title">{info.title}</div>
      {info.lines.map((line, i) => (
        <div key={i} className={i === 0 ? 'ww-inspect__stats' : 'ww-inspect__line'}>
          {line}
        </div>
      ))}
    </div>
  );
}

/**
 * The online decision timer (GDD §11.4) as a burning wick beside End Turn: the wax stick burns
 * down to the deadline, the flame sputters in the last 10 seconds and a low tick plays once a
 * second then (§16.11: `uiClick`, pitch 0.6) when the decision is this player's. Someone else's
 * timer shows dimmed with their name. Local games have no timer and show nothing.
 */
import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { usePresentation, useServices } from '../app/services';
import { useGameSnapshot } from './context';
import { useOnlineState, useTicker } from './onlineContext';
import { timerKey, timerView, type TimerView } from './onlineModel';

const localNow = (): number => Date.now();

/** When each timer was first seen (its full wick length). */
function useStartedAt(key: string | null): number {
  const seen = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  if (seen.current.key !== key) seen.current = { key, at: Date.now() };
  return seen.current.at;
}

/** One tick per second during the last 10 s of this player's own decision. */
function useUrgentTicks(view: TimerView | null): void {
  const services = useServices();
  const second = view && view.mine && view.urgent ? Math.ceil(view.remaining / 1000) : null;
  useEffect(() => {
    if (second !== null) services.audio.play('uiClick', { pitch: 0.6 });
  }, [second, services]);
}

function Wick({ view, animated }: { view: TimerView; animated: boolean }): ReactElement {
  const style = { '--ww-wick-left': view.fraction.toFixed(3) } as CSSProperties;
  return (
    <svg className="ww-turn-timer__wick" viewBox="0 0 100 24" preserveAspectRatio="none" style={style} aria-hidden="true">
      <rect className="ww-turn-timer__wax-spent" x={4} y={10} width={92} height={6} rx={3} />
      <rect className="ww-turn-timer__wax" x={4} y={10} width={92 * view.fraction} height={6} rx={3} />
      <g transform={`translate(${4 + 92 * view.fraction} 13)`}>
        <ellipse className={`ww-turn-timer__flame${animated ? ' ww-turn-timer__flame--live' : ''}`} cx={0} cy={-4} rx={3.2} ry={6} />
        <ellipse className="ww-turn-timer__core" cx={0} cy={-3} rx={1.4} ry={3} />
      </g>
    </svg>
  );
}

export function TurnTimer(): ReactElement | null {
  const online = useOnlineState();
  const snap = useGameSnapshot();
  const presentation = usePresentation();
  const timer = online?.timer ?? null;
  const key = timer ? timerKey(timer) : null;
  const startedAt = useStartedAt(key);
  const now = useTicker(timer !== null, localNow, 250);
  const view = timer && !snap.latest.result ? timerView(timer, now, startedAt, snap.controlledSeats, snap.latest) : null;
  useUrgentTicks(view);
  if (!view) return null;
  const classes = ['ww-turn-timer', view.mine ? 'ww-turn-timer--mine' : 'ww-turn-timer--other', view.urgent && 'ww-turn-timer--urgent'].filter(Boolean).join(' ');
  const who = view.owner ? `${view.owner} · ` : '';
  return (
    <div className={classes} role="timer" aria-live="off" aria-label={`${who}${view.label}: ${view.text} left`} data-testid="turn-timer">
      <span className="ww-turn-timer__label">
        {who}
        {view.label}
      </span>
      <Wick view={view} animated={!presentation.reduced_motion} />
      <span className="ww-turn-timer__time ww-num">{view.text}</span>
    </div>
  );
}

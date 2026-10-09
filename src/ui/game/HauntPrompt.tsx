/**
 * Haunting (GDD §13.2.7): at each Plume placement an eliminated Last Flame player places one
 * Sootling Plume on a legal (violet) tile, or skips. The haunted hero is the hero nearest the
 * Plume. Offline the choice lasts 15 s and then skips itself; online the server's timer runs it
 * (the wick by End Turn shows it).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { GameState } from '../../engine/types';
import { usePresentation } from '../app/services';
import { useController, useGameSnapshot, useRegistry } from './context';
import { nameOf } from './model';
import { useOnlineSession } from './onlineContext';

/** Seconds a Haunt waits before it is skipped (§11.4 fixed timers). */
export function hauntSeconds(state: GameState, fallback = 15): number {
  return state.config.mode === 'last_flame' ? fallback : 0;
}

function useCountdown(active: boolean, seconds: number, onDone: () => void): number {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!active) return undefined;
    const end = Date.now() + seconds * 1000;
    setLeft(seconds);
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        done.current();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [active, seconds]);
  return left;
}

export function HauntPrompt(): ReactElement | null {
  const snap = useGameSnapshot();
  const controller = useController();
  const registry = useRegistry();
  const presentation = usePresentation();
  const online = useOnlineSession();
  const pending = snap.uiSeat !== null && !snap.animating && (snap.latest.players[snap.uiSeat]?.haunt.pending ?? false);
  const seconds = hauntSeconds(snap.latest, registry.rules.timers.haunt);
  const key = pending ? `${snap.latest.night}:${snap.latest.round}:${snap.uiSeat}` : null;
  const left = useCountdown(pending && online === null, seconds, () => controller.haunt(null));
  if (!pending || key === null) return null;
  const hover = snap.selection.hover;
  const targets = controller.hauntTargets();
  const option = hover ? targets.find((t) => t.pos.x === hover.x && t.pos.y === hover.y) : undefined;
  const victim = option ? snap.latest.pieces[option.heroId] : undefined;
  const style = { '--ww-haunt-left': online ? 1 : left / Math.max(1, seconds) } as CSSProperties;
  return (
    <div className="ww-card-prompt ww-haunt-prompt" role="status" data-testid="haunt-prompt" style={style}>
      <span className="ww-card-prompt__name">Haunt</span>
      <span className="ww-card-prompt__text">
        {targets.length === 0
          ? 'No tile can take a Haunt Plume this time.'
          : victim
            ? `A Sootling rises here next to ${nameOf(registry, victim)}.`
            : 'Place a Sootling Plume on a violet tile. It haunts the nearest hero.'}
      </span>
      {online === null && (
        <span className={`ww-haunt-prompt__clock ww-num${presentation.reduced_motion ? '' : ' ww-haunt-prompt__clock--live'}`} aria-label={`${left} seconds left`}>
          {left}
        </span>
      )}
      <button type="button" className="ww-card-prompt__btn ww-card-prompt__btn--ghost" data-testid="haunt-skip" onClick={() => controller.haunt(null)}>
        Skip
      </button>
    </div>
  );
}

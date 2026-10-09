/**
 * First-time tips (GDD §15.3): a vellum slip that explains a situation the first time it comes
 * up. One per beat (the rest queue for the next beat); a tip that appears while the Snuff are
 * playing pauses playback until "Got it". On while `tutorial_hints` allows (auto: first 3 games).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { browserStorage, hintsEnabled } from '../../config';
import type { GameState, PhaseId } from '../../engine/types';
import { usePresentation, useProfile } from '../app/services';
import { useController, useGameSnapshot } from './context';
import { beatIndex } from './model';
import { loadSeenTips, saveSeenTips, TIPS, tipsForEvent, tipsForPreview, tipsForTurn, type TipId } from './tips';

/** Phases where the players act; a tip shown in them never holds playback. */
const PLAYER_BEATS: ReadonlySet<PhaseId> = new Set<PhaseId>(['players', 'night_setup', 'toll', 'chandlery']);

function beatKey(s: GameState): string {
  return `${s.night}:${s.round}:${s.phase === 'players' ? 'p' : beatIndex(s.phase)}`;
}

export function TipsLayer({ disabled = false }: { disabled?: boolean }): ReactElement | null {
  const controller = useController();
  const snap = useGameSnapshot();
  const presentation = usePresentation();
  const profile = useProfile();
  const enabled = !disabled && hintsEnabled(presentation, profile.gamesCompleted);
  const storage = useRef(browserStorage());
  const seen = useRef<Set<TipId>>(loadSeenTips(storage.current));
  const [queue, setQueue] = useState<TipId[]>([]);
  const [current, setCurrent] = useState<TipId | null>(null);
  const shownAtBeat = useRef<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const enqueue = (ids: readonly TipId[]): void => {
    if (!enabledRef.current) return;
    const fresh = ids.filter((id) => !seen.current.has(id));
    if (fresh.length === 0) return;
    setQueue((q) => [...q, ...fresh.filter((id) => !q.includes(id))]);
  };
  const enqueueRef = useRef(enqueue);
  enqueueRef.current = enqueue;

  useEffect(
    () =>
      controller.onCue((step) => {
        const before = controller.getSnapshot().state;
        const ids = tipsForEvent(step.event, before);
        if (step.event.type === 'turn_started' && step.event.seat === controller.getSnapshot().uiSeat) ids.push(...tipsForTurn(controller.getSnapshot().latest));
        enqueueRef.current(ids);
      }),
    [controller],
  );

  const previewing = snap.selection.previewEndTurn;
  useEffect(() => {
    if (previewing) enqueueRef.current(tipsForPreview(controller.getSnapshot().latest));
  }, [previewing, controller]);

  // Show the next queued tip, at most one per beat.
  const beat = beatKey(snap.state);
  useEffect(() => {
    if (current !== null || queue.length === 0 || shownAtBeat.current === beat) return;
    const [next, ...rest] = queue;
    seen.current.add(next);
    saveSeenTips(storage.current, seen.current);
    shownAtBeat.current = beat;
    setQueue(rest.filter((id) => !seen.current.has(id)));
    setCurrent(next);
  }, [current, queue, beat]);

  // A tip during the Snuff's playback pauses it (the players' own beats never wait).
  const pauses = current !== null && snap.animating && !PLAYER_BEATS.has(snap.state.phase);
  useEffect(() => {
    if (!pauses) return undefined;
    controller.hold('tip');
    return () => controller.release('tip');
  }, [pauses, controller]);

  if (!current || !enabled) return null;
  const tip = TIPS[current];
  return (
    <aside className="ww-tip" role="note" aria-label={`Tip: ${tip.title}`} data-testid="tip" data-tip={current}>
      <span className="ww-tip__badge" aria-hidden="true">
        ?
      </span>
      <div className="ww-tip__body">
        <strong className="ww-tip__title">{tip.title}</strong>
        <span className="ww-tip__text">{tip.text}</span>
      </div>
      <button type="button" className="ww-tip__ok" onClick={() => setCurrent(null)}>
        Got it
      </button>
    </aside>
  );
}

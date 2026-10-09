/**
 * The Night title card (GDD §15.1.2, §15.2): when a game opens and whenever a new Night starts,
 * a 2-second card — "Night 1 · First Vigil — Survive 4 rounds. Keep the Candles lit." — then the
 * board fades in. A click dismisses it early.
 */
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { FlameIcon } from '../../art';
import type { GameState } from '../../engine/types';
import { usePresentation } from '../app/services';
import { useController, useGameSnapshot, useRegistry } from './context';
import { nightTitle, type NightTitle } from './titles';

/** GDD §15.1: "A 2-second title card plays, then the board appears." */
export const TITLE_CARD_MS = 2200;

interface Card {
  id: number;
  title: NightTitle;
}

function opensOnTitle(s: GameState): boolean {
  return s.result === null && s.phase === 'night_setup' && s.round === 0;
}

export function NightTitleCard(): ReactElement | null {
  const controller = useController();
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const presentation = usePresentation();
  const [card, setCard] = useState<Card | null>(() => (opensOnTitle(snap.latest) ? { id: 0, title: nightTitle(snap.latest, registry) } : null));

  useEffect(() => {
    let next = 1;
    return controller.onCue((step) => {
      if (step.event.type !== 'night_started' || step.duration <= 0) return;
      setCard({ id: next++, title: nightTitle(controller.getSnapshot().latest, registry) });
    });
  }, [controller, registry]);

  useEffect(() => {
    if (!card) return undefined;
    const id = card.id;
    const timer = window.setTimeout(() => setCard((c) => (c?.id === id ? null : c)), TITLE_CARD_MS);
    return () => window.clearTimeout(timer);
  }, [card]);

  if (!card) return null;
  return (
    <div
      key={card.id}
      className={`ww-title-card${presentation.reduced_motion ? ' ww-title-card--still' : ''}`}
      style={{ '--ww-title-ms': `${TITLE_CARD_MS}ms` } as CSSProperties}
      role="status"
      aria-live="polite"
      data-testid="night-title"
      onClick={() => setCard(null)}
    >
      <div className="ww-title-card__inner">
        <FlameIcon lit size={34} animated={!presentation.reduced_motion} className="ww-title-card__flame" />
        <span className="ww-title-card__eyebrow">{card.title.eyebrow}</span>
        <h2 className="ww-title-card__title">{card.title.title}</h2>
        <span className="ww-title-card__rule" aria-hidden="true" />
        <p className="ww-title-card__line">{card.title.line}</p>
      </div>
    </div>
  );
}

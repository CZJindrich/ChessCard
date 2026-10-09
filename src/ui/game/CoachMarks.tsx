/**
 * Coach marks for the first-ever game's scripted turn (GDD §15.2–15.3): one mark at a time with
 * an arrow at its target (a tile, a card, End Turn). Each closes when its action is done and is
 * skipped when it can no longer be done; marks 1–4 allow only the guaranteed line's actions.
 * After 15 s idle a "Got it" button appears; "Skip tutorial" is always there. The words follow
 * the input (mouse or touch). Driven by the engine's `tutorialScript(heroId)`; without a script
 * nothing shows.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { cardTargets, tutorialScript, tutorialTurnActive, type TutorialScript } from '../../engine';
import type { GameState } from '../../engine/types';
import { usePresentation } from '../app/services';
import { useBoardLocator, type BoardLocatorRef, type ClientRect } from './boardLocator';
import { cardAllowed, currentMark, tileAllowed, type CoachAnchor, type CoachContext, type CoachView, type InputKind } from './coach';
import { useController, useGameSnapshot, useRegistry } from './context';

export const IDLE_GOT_IT_MS = 15000;

/** Render "**bold**" spans. */
function richText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

function anchorRect(anchor: CoachAnchor, locator: BoardLocatorRef): ClientRect | null {
  if (anchor.kind === 'tile') return locator.current?.tileRect(anchor.pos) ?? null;
  const selector = anchor.kind === 'card' ? `.ww-hand-card[data-card-id="${anchor.cardId}"] .ww-hand-card__body` : '[data-testid="end-turn"]';
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  return rect && rect.width > 0 ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null;
}

function useInputKind(): InputKind {
  const [kind, setKind] = useState<InputKind>(() => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse'));
  useEffect(() => {
    const onDown = (e: PointerEvent): void => setKind(e.pointerType === 'touch' ? 'touch' : 'mouse');
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  return kind;
}

function openingCounts(script: TutorialScript): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of script.hand) out[id] = (out[id] ?? 0) + 1;
  return out;
}

function canPlayCard(state: GameState, cardId: string): boolean {
  const card = state.players[0]?.hand.find((c) => c.id === cardId);
  return card !== undefined && cardTargets(state, 0, card.uid).playable;
}

/** Track idle time: true once nothing has been pressed for `ms`. */
function useIdle(ms: number, resetKey: unknown): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    let timer = window.setTimeout(() => setIdle(true), ms);
    const poke = (): void => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener('pointerdown', poke, true);
    window.addEventListener('keydown', poke, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', poke, true);
      window.removeEventListener('keydown', poke, true);
    };
  }, [ms, resetKey]);
  return idle;
}

/** Block clicks and keys outside the coached line (marks 1–4). */
function useRestriction(view: CoachView | null, script: TutorialScript | null, latest: GameState, locator: BoardLocatorRef, onBlocked: () => void): void {
  const live = useRef({ view, script, latest, onBlocked });
  live.current = { view, script, latest, onBlocked };
  useEffect(() => {
    const allowedTarget = (target: EventTarget | null, clientX: number, clientY: number): boolean => {
      const { view: v, script: sc, latest: s } = live.current;
      if (!v || !sc || !v.restricts || !(target instanceof Element)) return true;
      if (target.closest('.ww-coach')) return true;
      if (target.closest('.ww-gameboard__input')) {
        const tile = locator.current?.tileAt(clientX, clientY);
        return tile ? tileAllowed(v, sc, s, tile) : false;
      }
      const card = target.closest('.ww-hand-card');
      if (card) return cardAllowed(v, sc, card.getAttribute('data-card-id') ?? '');
      return !target.closest('[data-testid="end-turn"], .ww-ctrl');
    };
    const onClick = (e: MouseEvent): void => {
      if (allowedTarget(e.target, e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      live.current.onBlocked();
    };
    const onKey = (e: KeyboardEvent): void => {
      const { view: v, script: sc, latest: s } = live.current;
      if (!v || !sc || !v.restricts) return;
      const digit = /^[1-8]$/.test(e.key) ? s.players[0]?.hand[Number(e.key) - 1] : undefined;
      const blocked = e.key === ' ' || e.key === 'p' || e.key === 'P' || (digit !== undefined && !cardAllowed(v, sc, digit.id));
      if (!blocked) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      live.current.onBlocked();
    };
    // Dragging a card plays it without a click: stop drags of cards off the line too.
    const onPointerDown = (e: PointerEvent): void => {
      if (!(e.target instanceof Element) || !e.target.closest('.ww-hand-card')) return;
      if (allowedTarget(e.target, e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('click', onClick, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [locator]);
}

interface Placement {
  bubble: CSSProperties;
  ring: CSSProperties;
  below: boolean;
  arrowX: number;
}

const BUBBLE_W = 300;

function place(rect: ClientRect, root: DOMRect): Placement {
  const cx = rect.x + rect.w / 2 - root.left;
  const top = rect.y - root.top;
  const below = top < 170;
  const left = Math.min(Math.max(12, cx - BUBBLE_W / 2), root.width - BUBBLE_W - 12);
  return {
    below,
    arrowX: cx - left,
    bubble: below ? { left, top: top + rect.h + 16, width: BUBBLE_W } : { left, bottom: root.height - top + 16, width: BUBBLE_W },
    ring: { left: rect.x - root.left - 6, top: top - 6, width: rect.w + 12, height: rect.h + 12 },
  };
}

export function CoachMarks(): ReactElement | null {
  const snap = useGameSnapshot();
  const controller = useController();
  const registry = useRegistry();
  const presentation = usePresentation();
  const locator = useBoardLocator();
  const input = useInputKind();
  const [skipped, setSkipped] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const [placement, setPlacement] = useState<Placement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { latest, selection } = snap;
  const heroId = latest.tutorial?.heroId ?? null;
  const script = useMemo(() => (heroId ? tutorialScript(heroId) : null), [heroId]);
  const active = !skipped && script !== null && latest.tutorial !== null && presentation.tutorial_hints !== 'off' && tutorialTurnActive(latest) && latest.phase === 'players' && snap.uiSeat === 0;
  const cardNames = useMemo(() => Object.fromEntries(registry.cards.list.map((c) => [c.id, c.name])), [registry]);
  const opening = useMemo(() => (script ? openingCounts(script) : {}), [script]);

  const selectedCardId = selection.card ? (latest.players[0]?.hand.find((c) => c.uid === selection.card?.uid)?.id ?? null) : null;
  const ctx: CoachContext = {
    selectedPieceId: selection.pieceId,
    selectedCardId,
    cardInfo: selection.card ? controller.targetInfo() : null,
    openingHand: opening,
    canPlay: (cardId) => canPlayCard(latest, cardId),
  };
  const view = active && script && !snap.animating ? currentMark(script, latest, ctx, { dismissed }, input, cardNames) : null;
  const idle = useIdle(IDLE_GOT_IT_MS, view?.stepIndex ?? -1);

  useRestriction(view, script, latest, locator, () => controller.showNotice('Follow the guide — or press Skip tutorial', { kind: 'board' }, 'info'));

  // The info mark closes after 3 s or on the next click.
  const autoClose = view?.autoCloseMs ?? null;
  const viewStep = view?.stepIndex ?? -1;
  useEffect(() => {
    if (autoClose === null) return undefined;
    const close = (): void => setDismissed((d) => new Set([...d, viewStep]));
    const timer = window.setTimeout(close, autoClose);
    const onDown = (e: PointerEvent): void => {
      if (!(e.target instanceof Element && e.target.closest('.ww-coach__skip'))) close();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [autoClose, viewStep]);

  // Follow the anchor (pieces animate, the hand fans): measure now and a few times a second.
  const anchor = useRef<CoachAnchor | null>(null);
  anchor.current = view?.anchor ?? null;
  const anchorKey = view ? JSON.stringify(view.anchor) : '';
  useLayoutEffect(() => {
    if (!anchorKey) {
      setPlacement(null);
      return undefined;
    }
    const measure = (): void => {
      const root = rootRef.current?.getBoundingClientRect();
      const rect = anchor.current ? anchorRect(anchor.current, locator) : null;
      setPlacement(root && rect ? place(rect, root) : null);
    };
    measure();
    const timer = window.setInterval(measure, 250);
    return () => window.clearInterval(timer);
  }, [anchorKey, locator]);

  if (!active || !script) return null;
  return (
    <div ref={rootRef} className="ww-coach-layer" data-testid="coach-layer">
      {view && placement && (
        <>
          <span className={`ww-coach__ring${presentation.reduced_motion ? ' ww-coach__ring--still' : ''}`} style={placement.ring} aria-hidden="true" />
          <div className={`ww-coach${placement.below ? ' ww-coach--below' : ''}`} style={{ ...placement.bubble, '--ww-arrow-x': `${placement.arrowX}px` } as CSSProperties} role="status" aria-live="polite" data-testid="coach-mark" data-mark={view.markId}>
            <span className="ww-coach__num ww-num" aria-hidden="true">
              {view.markId}
            </span>
            <p className="ww-coach__text">{richText(view.text)}</p>
            {idle && (
              <button type="button" className="ww-coach__ok" onClick={() => setDismissed((d) => new Set([...d, view.stepIndex]))}>
                Got it
              </button>
            )}
          </div>
        </>
      )}
      <button type="button" className="ww-coach__skip" onClick={() => setSkipped(true)} data-testid="skip-tutorial">
        Skip tutorial
      </button>
    </div>
  );
}

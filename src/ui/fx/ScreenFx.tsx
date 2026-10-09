/**
 * Screen-level effects (GDD §16.9): the white flash of a phase change or CHECKMATE (a gentle fade
 * under reduced motion, never more than 3 flashes a second), the violet vignette pulse of
 * Dread +1, the board shake, and a played card flying to its target where its wax seal cracks.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode, type RefObject } from 'react';
import type { CardFlightSpec, FxBus, FxCommandOf } from './bus';

/** Minimum gap between two flashes (GDD §16.9: never more than 3 per second). */
export const MIN_FLASH_GAP_MS = 340;

/** Whether a flash may start at `now` after the previous one at `last` (ms; null = none yet). */
export function flashAllowed(last: number | null, now: number): boolean {
  return last === null || now - last >= MIN_FLASH_GAP_MS;
}

interface Transient<T> {
  id: number;
  spec: T;
}

function useTransient<T>(): [Transient<T> | null, (spec: T, ttl: number) => void] {
  const [item, setItem] = useState<Transient<T> | null>(null);
  const next = useRef(1);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const show = useCallback((spec: T, ttl: number): void => {
    const id = next.current++;
    setItem({ id, spec });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setItem((cur) => (cur?.id === id ? null : cur)), ttl + 40);
  }, []);
  return [item, show];
}

export interface ScreenFxProps {
  bus: FxBus;
  reducedMotion: boolean;
  /** Draws the card in flight (the game screen knows the card art). */
  renderCard?: (flight: CardFlightSpec) => ReactNode;
}

export function ScreenFx({ bus, reducedMotion, renderCard }: ScreenFxProps): ReactElement {
  const [flash, showFlash] = useTransient<FxCommandOf<'flash'>>();
  const [vignette, showVignette] = useTransient<FxCommandOf<'vignette'>>();
  const [flights, setFlights] = useState<Array<Transient<CardFlightSpec>>>([]);
  const lastFlash = useRef<number | null>(null);
  const nextFlight = useRef(1);
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;

  useEffect(() => {
    const timers = new Set<number>();
    const off = bus.on((command) => {
      if (command.kind === 'flash') {
        const now = performance.now();
        if (!flashAllowed(lastFlash.current, now)) return;
        lastFlash.current = now;
        const duration = reduced.current ? Math.max(700, command.duration * 1.6) : command.duration;
        showFlash({ ...command, duration }, duration);
      } else if (command.kind === 'vignette') {
        const duration = reduced.current ? Math.max(900, command.duration * 1.5) : command.duration;
        showVignette({ ...command, duration }, duration);
      } else if (command.kind === 'card') {
        const id = nextFlight.current++;
        setFlights((prev) => [...prev, { id, spec: command.flight }]);
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          setFlights((prev) => prev.filter((f) => f.id !== id));
        }, command.flight.duration + SEAL_MS + 60);
        timers.add(timer);
      }
    });
    return () => {
      off();
      for (const t of timers) window.clearTimeout(t);
    };
  }, [bus, showFlash, showVignette]);

  return (
    <div className="ww-fx-screen" aria-hidden="true">
      {vignette && (
        <div
          key={vignette.id}
          className={`ww-fx-vignette${reducedMotion ? ' ww-fx-vignette--fade' : ''}`}
          style={{ '--ww-fx-dur': `${vignette.spec.duration}ms`, '--ww-fx-strength': vignette.spec.strength } as CSSProperties}
        />
      )}
      {flash && (
        <div
          key={flash.id}
          className={`ww-fx-flash-screen ww-fx-flash-screen--${flash.spec.tone}${reducedMotion ? ' ww-fx-flash-screen--fade' : ''}`}
          style={{ '--ww-fx-dur': `${flash.spec.duration}ms` } as CSSProperties}
        />
      )}
      {flights.map((f) => (
        <CardFlight key={f.id} flight={f.spec} reducedMotion={reducedMotion}>
          {renderCard?.(f.spec)}
        </CardFlight>
      ))}
    </div>
  );
}

/** How long the seal takes to crack after the card lands (ms). */
const SEAL_MS = 420;

function CardFlight({ flight, reducedMotion, children }: { flight: CardFlightSpec; reducedMotion: boolean; children: ReactNode }): ReactElement {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(reducedMotion);

  useEffect(() => {
    const node = cardRef.current;
    if (reducedMotion || !node || typeof node.animate !== 'function') {
      setLanded(true);
      return undefined;
    }
    const from = flight.from ?? { x: window.innerWidth / 2 - 40, y: window.innerHeight - 140, w: 80, h: 112 };
    const startX = from.x + from.w / 2;
    const startY = from.y + from.h / 2;
    const midX = (startX + flight.to.x) / 2;
    const midY = Math.min(startY, flight.to.y) - 60;
    const animation = node.animate(
      [
        { transform: `translate(${startX}px, ${startY}px) translate(-50%, -50%) scale(1) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${midX}px, ${midY}px) translate(-50%, -50%) scale(0.75) rotate(-8deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${flight.to.x}px, ${flight.to.y}px) translate(-50%, -50%) scale(0.28) rotate(4deg)`, opacity: 0.2 },
      ],
      { duration: Math.max(120, flight.duration), easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
    );
    animation.onfinish = () => setLanded(true);
    return () => animation.cancel();
  }, [flight, reducedMotion]);

  const sealStyle = { left: flight.to.x, top: flight.to.y, '--ww-seal-accent': flight.accent } as CSSProperties;
  return (
    <>
      {!landed && (
        <div ref={cardRef} className="ww-fx-card-flight">
          {children}
        </div>
      )}
      {landed && (
        <div className={`ww-fx-seal${reducedMotion ? ' ww-fx-seal--still' : ''}`} style={sealStyle}>
          <span className="ww-fx-seal__glow" />
          <span className="ww-fx-seal__half ww-fx-seal__half--l" />
          <span className="ww-fx-seal__half ww-fx-seal__half--r" />
        </div>
      )}
    </>
  );
}

/**
 * Shake an element on the bus's `shake` commands (GDD §16.9: 6 px on a phase change). Uses the
 * independent `translate` property so it composes with the element's own transform (zoom).
 */
export function useShake(target: RefObject<HTMLElement | null>, bus: FxBus, enabled: boolean): void {
  const on = useRef(enabled);
  on.current = enabled;
  useEffect(
    () =>
      bus.on((command) => {
        const node = target.current;
        if (command.kind !== 'shake' || !on.current || !node || typeof node.animate !== 'function') return;
        node.animate(shakeFrames(command.strength), { duration: command.duration, easing: 'linear' });
      }),
    [bus, target],
  );
}

/** Decaying random offsets, ending at rest. */
export function shakeFrames(strength: number, steps = 8, random: () => number = Math.random): Keyframe[] {
  const frames: Keyframe[] = [{ translate: '0px 0px' }];
  for (let i = 1; i < steps; i++) {
    const k = strength * (1 - i / steps);
    const x = (random() * 2 - 1) * k;
    const y = (random() * 2 - 1) * k * 0.6;
    frames.push({ translate: `${x.toFixed(1)}px ${y.toFixed(1)}px` });
  }
  frames.push({ translate: '0px 0px' });
  return frames;
}

/**
 * Vellum-slip tooltips (EB Garamond, GDD §16.3). Shown on hover and keyboard focus, rendered
 * in a portal with fixed positioning so scrolling panels never clip them; flips below the
 * anchor when there is no room above and stays inside the viewport horizontally.
 */
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from './icons';

const GAP = 8;
const EDGE = 8;
const SHOW_DELAY_MS = 220;

export interface TooltipPosition {
  left: number;
  top: number;
  below: boolean;
  /** Arrow x inside the tooltip, so it still points at the anchor when the tooltip is clamped. */
  arrow: number;
}

const ARROW_MARGIN = 10;

/** Place a `w`×`h` tooltip centred over `anchor`, flipping below and clamping to the viewport. */
export function placeTooltip(anchor: DOMRect, w: number, h: number, viewport: { width: number; height: number }): TooltipPosition {
  const below = anchor.top - GAP - h < EDGE;
  const top = below ? Math.min(viewport.height - EDGE - h, anchor.bottom + GAP) : anchor.top - GAP - h;
  const centred = anchor.left + anchor.width / 2 - w / 2;
  const left = Math.max(EDGE, Math.min(viewport.width - EDGE - w, centred));
  const arrow = Math.max(ARROW_MARGIN, Math.min(w - ARROW_MARGIN, anchor.left + anchor.width / 2 - left));
  return { left, top, below, arrow };
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /** Show immediately (keyboard focus always does). */
  instant?: boolean;
}

export function Tooltip({ content, children, className, instant = false }: TooltipProps): ReactElement {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPosition | null>(null);

  const clearTimer = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (now: boolean): void => {
    clearTimer();
    if (now) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  };
  const hide = (): void => {
    clearTimer();
    setOpen(false);
    setPos(null);
  };

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const tip = tipRef.current.getBoundingClientRect();
    setPos(placeTooltip(anchorRef.current.getBoundingClientRect(), tip.width, tip.height, { width: window.innerWidth, height: window.innerHeight }));
  }, [open, content]);

  useLayoutEffect(() => clearTimer, []);

  const hasContent = content !== null && content !== undefined && content !== '';
  return (
    <span
      ref={anchorRef}
      className={className ? `ww-tip-anchor ${className}` : 'ww-tip-anchor'}
      aria-describedby={open && hasContent ? id : undefined}
      onPointerEnter={() => show(instant)}
      onPointerLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
    >
      {children}
      {open &&
        hasContent &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={pos?.below ? 'ww-tooltip ww-tooltip--below' : 'ww-tooltip'}
            style={pos ? ({ left: pos.left, top: pos.top, '--ww-arrow-x': `${pos.arrow}px` } as CSSProperties) : { left: -9999, top: -9999 }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** A small "?" disc that explains the control next to it. */
export function InfoTip({ text, label = 'More information' }: { text: ReactNode; label?: string }): ReactElement {
  return (
    <Tooltip content={text}>
      <button type="button" className="ww-infotip" aria-label={label}>
        <UiIcon name="info" />
      </button>
    </Tooltip>
  );
}

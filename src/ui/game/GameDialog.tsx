/**
 * An in-game dialog over the board (Toll, carry-over, Chandlery, End Turn confirmation, game
 * over). Unlike the menu Modal it lives inside the game screen, so the game's own keys and
 * playback keep working around it.
 */
import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { WaxDrips } from '../components/WaxDrips';

export interface GameDialogProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Dim the whole screen (game over) instead of just the board area. */
  full?: boolean;
}

export function GameDialog({ title, eyebrow, children, footer, size = 'md', className, full = false }: GameDialogProps): ReactElement {
  const titleId = useId();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('button:not([disabled])');
    first?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={`ww-dialog-layer${full ? ' ww-dialog-layer--full' : ''}`}>
      <div ref={ref} role="dialog" aria-modal="false" aria-labelledby={titleId} className={['ww-dialog', `ww-dialog--${size}`, 'ww-panel', 'ww-panel--night', 'ww-filigree', 'ww-panel--dripping', className].filter(Boolean).join(' ')}>
        <WaxDrips tone="tallow" offset={53} className="ww-panel__drips" />
        <header className="ww-dialog__head">
          {eyebrow && <span className="ww-dialog__eyebrow">{eyebrow}</span>}
          <h2 id={titleId} className="ww-dialog__title">
            {title}
          </h2>
        </header>
        <div className="ww-dialog__body">{children}</div>
        {footer && <footer className="ww-dialog__foot">{footer}</footer>}
      </div>
    </div>
  );
}

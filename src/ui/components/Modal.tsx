/**
 * Modal dialog in a portal: dims the page, traps Tab inside, closes on Esc or a backdrop
 * click, and gives focus back to whatever opened it.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUiSound } from '../app/services';
import { IconButton } from './Button';
import { WaxDrips } from './WaxDrips';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Modal({ open, title, onClose, children, footer, size = 'md', className }: ModalProps): ReactElement | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const play = useUiSound();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialogRef.current)?.focus();
    return () => opener?.focus();
  }, [open]);

  if (!open) return null;

  const close = (): void => {
    play('back');
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  };

  return createPortal(
    <div
      className="ww-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={['ww-modal', `ww-modal--${size}`, 'ww-panel', 'ww-panel--night', 'ww-filigree', 'ww-panel--dripping', className].filter(Boolean).join(' ')}
        onKeyDown={onKeyDown}
      >
        <WaxDrips tone="tallow" offset={71} className="ww-panel__drips" />
        <header className="ww-modal__head">
          <h2 id={titleId} className="ww-modal__title">
            {title}
          </h2>
          <IconButton icon="close" label="Close" sound={null} tooltip={false} onClick={close} />
        </header>
        <div ref={bodyRef} className="ww-modal__body">
          {children}
        </div>
        {footer && <footer className="ww-modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Keyboard controls (GDD §15.7): Space end turn, Enter confirm, Z undo, 1–8 select a card,
 * Tab cycle Ready pieces, Esc cancel, P Hero Power, C claim turn, H hint, I intent overlay.
 */
import { useEffect, type RefObject } from 'react';
import type { GameController } from '../../game';
import { useServices } from '../app/services';
import { useController } from './context';

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Tab cycles pieces only while focus is on the board (not on a button). */
function boardHasFocus(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === root || (active instanceof HTMLElement && active.closest('.ww-board-stage') !== null);
}

function handleKey(event: KeyboardEvent, controller: GameController, root: HTMLElement | null): boolean {
  const snap = controller.getSnapshot();
  const key = event.key;
  if (snap.confirmingEndTurn) {
    if (key === 'Enter' || key === ' ') {
      controller.endTurn(true);
      return true;
    }
    if (key === 'Escape') {
      controller.cancel();
      return true;
    }
    return false;
  }
  switch (key) {
    case ' ':
      controller.endTurn();
      return true;
    case 'Enter':
      return controller.tryPlaySelected();
    case 'Escape':
      controller.cancel();
      return true;
    case 'z':
    case 'Z':
      controller.undo();
      return true;
    case 'p':
    case 'P':
      controller.selectPower();
      return true;
    case 'c':
    case 'C':
      controller.claimNext();
      return true;
    case 'h':
    case 'H':
      controller.requestHint();
      return true;
    case 'i':
    case 'I':
      controller.toggleIntents();
      return true;
    case 'Tab':
      if (!boardHasFocus(root)) return false;
      controller.cycleReadyPiece(event.shiftKey ? -1 : 1);
      return true;
    default:
      break;
  }
  if (/^[1-8]$/.test(key) && snap.uiSeat !== null) {
    const card = snap.latest.players[snap.uiSeat]?.hand[Number(key) - 1];
    if (card) controller.selectCard(card.uid);
    return true;
  }
  return false;
}

export function useGameKeys(rootRef: RefObject<HTMLElement | null>): void {
  const controller = useController();
  const services = useServices();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return;
      if (services.overlays.get().settingsOpen || document.querySelector('.ww-modal-backdrop')) return;
      if (handleKey(event, controller, rootRef.current)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, services, rootRef]);
}

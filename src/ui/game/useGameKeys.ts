/**
 * Keyboard controls (GDD §15.7): Space end turn, Enter confirm (the keyboard cursor's tile, else
 * the selected card), Z undo, 1–8 select a card, Tab cycle Ready pieces, Esc cancel (with nothing
 * to cancel: the pause menu), P Hero Power, C claim turn, D deck viewer, H hint, I intent overlay,
 * R rules, G ping the hovered tile, + / − zoom, arrow keys move the keyboard cursor.
 * While an overlay is open only Esc (close), D and R work. Nothing fires while typing in a field,
 * and Enter / Space on a focused dialog button press that button instead.
 */
import { useEffect, type RefObject } from 'react';
import type { ControllerSnapshot, GameController } from '../../game';
import { useServices, type AppServices } from '../app/services';
import { useController } from './context';
import { useGameUi, ZOOM_STEP, type GameUi } from './uiStore';

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Enter / Space on a focused button inside a dialog or prompt belong to that button. */
function isDialogButton(target: EventTarget | null, key: string): boolean {
  if (key !== 'Enter' && key !== ' ') return false;
  return target instanceof HTMLElement && target.closest('button, [role="radio"]') !== null && target.closest('[role="dialog"], .ww-card-prompt, .ww-haunt-prompt') !== null;
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Tab cycles pieces only while focus is on the board (not on a button). */
function boardHasFocus(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === root || (active instanceof HTMLElement && active.closest('.ww-board-stage') !== null);
}

/** Nothing for Esc to back out of: no piece, card, Power, inspection, preview or confirmation. */
export function nothingSelected(snap: ControllerSnapshot): boolean {
  const sel = snap.selection;
  return !snap.confirmingEndTurn && sel.pieceId === null && sel.card === null && sel.power === null && sel.inspectId === null && sel.hint === null && !sel.previewEndTurn;
}

function overlayKeys(key: string, ui: GameUi): boolean {
  switch (key) {
    case 'Escape':
      ui.close();
      return true;
    case 'd':
    case 'D':
      ui.toggle('deck');
      return true;
    case 'r':
    case 'R':
      ui.toggle('rules');
      return true;
    default:
      return false;
  }
}

function confirmKeys(key: string, controller: GameController): boolean {
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

function ping(controller: GameController, ui: GameUi, services: AppServices): void {
  const snap = controller.getSnapshot();
  const tile = snap.selection.hover;
  if (!tile) return;
  ui.ping(tile, snap.uiSeat);
  services.audio.play('uiConfirm', { pitch: 1.5, volume: 0.6 });
}

function handleKey(event: KeyboardEvent, controller: GameController, ui: GameUi, services: AppServices, root: HTMLElement | null): boolean {
  const snap = controller.getSnapshot();
  const key = event.key;
  if (ui.store.get().overlay !== null) return overlayKeys(key, ui);
  if (snap.confirmingEndTurn) return confirmKeys(key, controller);
  switch (key) {
    case ' ':
      controller.endTurn();
      return true;
    case 'Enter':
      return controller.confirm();
    case 'Escape':
      if (snap.selection.keyCursor && nothingSelected(snap)) controller.hoverTile(null);
      else if (nothingSelected(snap)) ui.open('pause');
      else controller.cancel();
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
    case 'd':
    case 'D':
      ui.open('deck');
      return true;
    case 'r':
    case 'R':
      ui.open('rules');
      return true;
    case 'g':
    case 'G':
      ping(controller, ui, services);
      return true;
    case '+':
    case '=':
      ui.zoomBy(ZOOM_STEP);
      return true;
    case '-':
    case '_':
      ui.zoomBy(1 / ZOOM_STEP);
      return true;
    case 'Tab':
      if (!boardHasFocus(root)) return false;
      controller.cycleReadyPiece(event.shiftKey ? -1 : 1);
      return true;
    default:
      break;
  }
  const arrow = ARROWS[key];
  if (arrow) {
    controller.moveCursor(arrow[0], arrow[1]);
    return true;
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
  const ui = useGameUi();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target) || isDialogButton(event.target, event.key)) return;
      if (services.overlays.get().settingsOpen || document.querySelector('.ww-modal-backdrop')) return;
      if (handleKey(event, controller, ui, services, rootRef.current)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, services, ui, rootRef]);
}

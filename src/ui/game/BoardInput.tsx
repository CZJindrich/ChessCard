/**
 * The board's input layer (GDD §15.7):
 * - pointer → tile hover and click (Shift-click moves onto a Plume instead of popping it);
 * - right-click cancels, or pings an empty tile when nothing is selected;
 * - touch: long-press inspects, two fingers pinch-zoom and pan, a two-finger tap pings;
 * - the wheel zooms about the cursor; once zoomed, dragging the board pans it;
 * - during Night setup a seat's piece can be dragged onto a deploy tile.
 * It also registers the board locator (tile ↔ client px) for the hand, FX and coach marks.
 */
import { useEffect, useRef, useState, type PointerEvent, type ReactElement, type WheelEvent } from 'react';
import { PieceArt } from '../../art';
import type { Pos } from '../../engine/types';
import { useServices } from '../app/services';
import { useBoardLocator, type ClientRect } from './boardLocator';
import { useController, useGameSnapshot } from './context';
import { tileAtPoint, type BoardMetrics } from './geometry';
import { pieceArtProps } from './pieceView';
import { useGameUi } from './uiStore';

const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD = 6;
const TWO_FINGER_TAP_MS = 320;

interface DeployDrag {
  pieceId: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Pointer position inside the tile area (px). */
  x: number;
  y: number;
  active: boolean;
}

interface PointerTrack {
  x: number;
  y: number;
}

interface Gesture {
  /** Two-finger gesture: start distance, last midpoint, start time, whether it moved. */
  dist: number;
  midX: number;
  midY: number;
  startedAt: number;
  moved: boolean;
}

interface PanDrag {
  pointerId: number;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  active: boolean;
}

/** A client point → px inside the element, undoing the board's zoom transform. */
function localPoint(el: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const sx = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  const sy = el.offsetHeight > 0 ? rect.height / el.offsetHeight : 1;
  return { x: (clientX - rect.left) / (sx || 1), y: (clientY - rect.top) / (sy || 1) };
}

function tileClientRect(el: HTMLElement, pos: Pos, m: BoardMetrics): ClientRect | null {
  if (pos.x < 0 || pos.y < 0 || pos.x >= m.cols || pos.y >= m.rows) return null;
  const rect = el.getBoundingClientRect();
  const sx = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  const sy = el.offsetHeight > 0 ? rect.height / el.offsetHeight : 1;
  return { x: rect.left + pos.x * m.tile * sx, y: rect.top + (m.rows - 1 - pos.y) * m.tile * sy, w: m.tile * sx, h: m.tile * sy };
}

export function BoardInput({ metrics }: { metrics: BoardMetrics }): ReactElement {
  const controller = useController();
  const services = useServices();
  const ui = useGameUi();
  const snap = useGameSnapshot();
  const ref = useRef<HTMLDivElement | null>(null);
  const locator = useBoardLocator();
  const press = useRef<{ timer: number; fired: boolean } | null>(null);
  const suppressClick = useRef(false);
  const pointers = useRef(new Map<number, PointerTrack>());
  const gesture = useRef<Gesture | null>(null);
  const panDrag = useRef<PanDrag | null>(null);
  const [drag, setDrag] = useState<DeployDrag | null>(null);

  useEffect(() => {
    locator.current = {
      tileAt: (clientX, clientY) => {
        const el = ref.current;
        if (!el) return null;
        const p = localPoint(el, clientX, clientY);
        return tileAtPoint(p.x, p.y, metrics);
      },
      tileRect: (pos) => (ref.current ? tileClientRect(ref.current, pos, metrics) : null),
      boardRect: () => {
        const rect = ref.current?.getBoundingClientRect();
        return rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null;
      },
    };
    return () => {
      locator.current = null;
    };
  }, [locator, metrics]);

  const tileOf = (el: HTMLElement, clientX: number, clientY: number): Pos | null => {
    const p = localPoint(el, clientX, clientY);
    return tileAtPoint(p.x, p.y, metrics);
  };

  /** Focus for zooming: px from the unzoomed board's centre (the board scales about it). */
  const focusOf = (clientX: number, clientY: number): { x: number; y: number } => {
    const stage = ref.current?.closest('.ww-board-stage');
    const rect = stage?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  };

  const clearPress = (): void => {
    if (press.current) window.clearTimeout(press.current.timer);
  };

  const startLongPress = (pos: Pos | null): void => {
    clearPress();
    press.current = {
      fired: false,
      timer: window.setTimeout(() => {
        if (!press.current || !pos) return;
        press.current.fired = true;
        const piece = Object.values(controller.getSnapshot().state.pieces).find((p) => pos.x >= p.pos.x && pos.x < p.pos.x + p.size && pos.y >= p.pos.y && pos.y < p.pos.y + p.size);
        controller.inspect(piece?.id ?? null);
      }, LONG_PRESS_MS),
    };
  };

  const ping = (pos: Pos): void => {
    ui.ping(pos, controller.getSnapshot().uiSeat);
    services.audio.play('uiConfirm', { pitch: 1.5, volume: 0.6 });
  };

  /** Night setup: a press on one of the acting seat's pieces may become a drag. */
  const startDeployDrag = (e: PointerEvent<HTMLDivElement>, pos: Pos | null): boolean => {
    const current = controller.getSnapshot();
    if (!pos || current.latest.phase !== 'night_setup' || current.uiSeat === null || current.animating) return false;
    const piece = Object.values(current.latest.pieces).find((p) => p.pos.x === pos.x && p.pos.y === pos.y);
    if (!piece || piece.owner !== current.uiSeat) return false;
    const p = localPoint(e.currentTarget, e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ pieceId: piece.id, pointerId: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y, active: false });
    return true;
  };

  const startGesture = (): void => {
    const [a, b] = [...pointers.current.values()];
    clearPress();
    panDrag.current = null;
    setDrag(null);
    gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, startedAt: performance.now(), moved: false };
  };

  const moveGesture = (): void => {
    const g = gesture.current;
    const [a, b] = [...pointers.current.values()];
    if (!g || !a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (Math.abs(dist - g.dist) > DRAG_THRESHOLD || Math.hypot(midX - g.midX, midY - g.midY) > DRAG_THRESHOLD) g.moved = true;
    if (!g.moved) return;
    if (g.dist > 0 && dist > 0) ui.zoomBy(dist / g.dist, focusOf(midX, midY));
    ui.pan(midX - g.midX, midY - g.midY);
    gesture.current = { ...g, dist, midX, midY };
  };

  const endGesture = (el: HTMLElement): void => {
    const g = gesture.current;
    gesture.current = null;
    suppressClick.current = true;
    if (!g || g.moved || performance.now() - g.startedAt > TWO_FINGER_TAP_MS) return;
    const pos = tileOf(el, g.midX, g.midY);
    if (pos) ping(pos);
  };

  const draggedPiece = drag?.active ? snap.state.pieces[drag.pieceId] : undefined;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      startGesture();
      return;
    }
    if (pointers.current.size > 2) return;
    const pos = tileOf(e.currentTarget, e.clientX, e.clientY);
    if (e.pointerType === 'touch') startLongPress(pos);
    if (e.button !== 0) return;
    if (startDeployDrag(e, pos)) return;
    if (ui.store.get().zoom.scale > 1) panDrag.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, active: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current) {
      moveGesture();
      return;
    }
    controller.hoverTile(tileOf(e.currentTarget, e.clientX, e.clientY));
    const pan = panDrag.current;
    if (pan && pan.pointerId === e.pointerId) {
      if (!pan.active && Math.hypot(e.clientX - pan.startX, e.clientY - pan.startY) > DRAG_THRESHOLD) {
        pan.active = true;
        clearPress();
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (pan.active) ui.pan(e.clientX - pan.lastX, e.clientY - pan.lastY);
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
    }
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = localPoint(e.currentTarget, e.clientX, e.clientY);
    const active = drag.active || Math.hypot(p.x - drag.startX, p.y - drag.startY) > DRAG_THRESHOLD;
    if (active && !drag.active && controller.getSnapshot().selection.pieceId !== drag.pieceId) controller.selectPiece(drag.pieceId);
    setDrag({ ...drag, x: p.x, y: p.y, active });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(e.pointerId);
    clearPress();
    if (gesture.current) {
      if (pointers.current.size < 2) endGesture(e.currentTarget);
      return;
    }
    if (panDrag.current?.pointerId === e.pointerId) {
      if (panDrag.current.active) suppressClick.current = true;
      panDrag.current = null;
    }
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.active) {
      suppressClick.current = true;
      const pos = tileOf(e.currentTarget, e.clientX, e.clientY);
      if (pos) controller.dropDeploy(drag.pieceId, pos);
    }
    setDrag(null);
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>): void => {
    if (e.deltaY === 0) return;
    ui.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), focusOf(e.clientX, e.clientY));
  };

  return (
    <>
      <div
        ref={ref}
        className="ww-gameboard__input"
        data-testid="board-input"
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          clearPress();
          if (!drag) controller.hoverTile(null);
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          gesture.current = null;
          panDrag.current = null;
          setDrag(null);
        }}
        onWheel={onWheel}
        onClick={(e) => {
          if (suppressClick.current || press.current?.fired) {
            suppressClick.current = false;
            press.current = null;
            return;
          }
          const pos = tileOf(e.currentTarget, e.clientX, e.clientY);
          if (pos) controller.clickTile(pos, e.shiftKey);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const current = controller.getSnapshot();
          const sel = current.selection;
          const pos = tileOf(e.currentTarget, e.clientX, e.clientY);
          const busy = sel.pieceId !== null || sel.card !== null || sel.power !== null || current.confirmingEndTurn;
          const empty = pos !== null && !Object.values(current.state.pieces).some((p) => pos.x >= p.pos.x && pos.x < p.pos.x + p.size && pos.y >= p.pos.y && pos.y < p.pos.y + p.size);
          if (!busy && pos && empty) ping(pos);
          else controller.cancel();
        }}
      />
      {draggedPiece && drag && (
        <div className="ww-deploy-ghost" style={{ transform: `translate(${drag.x - metrics.tile / 2}px, ${drag.y - metrics.tile * 0.7}px)`, width: metrics.tile, height: metrics.tile }}>
          <PieceArt {...pieceArtProps(snap.state, draggedPiece, metrics.tile, false)} animated={false} />
        </div>
      )}
    </>
  );
}

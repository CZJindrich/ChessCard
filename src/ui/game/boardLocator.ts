/**
 * Lets siblings of the board find it on screen: the hand asks which tile is under a dragged
 * card, the FX and coach marks ask where a tile is (client px). The board registers the locator.
 */
import { createContext, useContext, useRef, type MutableRefObject } from 'react';
import type { Pos } from '../../engine/types';

export interface ClientRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLocator {
  /** The tile under a client point, or null off the board. */
  tileAt(clientX: number, clientY: number): Pos | null;
  /** A tile's client rect (zoom and pan included), or null off the board. */
  tileRect(pos: Pos): ClientRect | null;
  /** The whole tile area's client rect. */
  boardRect(): ClientRect | null;
}

export type BoardLocatorRef = MutableRefObject<BoardLocator | null>;

export const BoardLocatorContext = createContext<BoardLocatorRef | null>(null);

export function useBoardLocatorRef(): BoardLocatorRef {
  return useRef<BoardLocator | null>(null);
}

export function useBoardLocator(): BoardLocatorRef {
  const ref = useContext(BoardLocatorContext);
  if (!ref) throw new Error('useBoardLocator must be used inside the game screen');
  return ref;
}

export function rectCentre(rect: ClientRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

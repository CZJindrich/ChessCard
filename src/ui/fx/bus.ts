/**
 * The FX bus: the game screen turns playback events into FX commands (director.ts) and the FX
 * layers (particle canvas, screen flash, vignette, shake, card flight) listen. Commands use board
 * points: engine axes (x = file, y = rank, rank 1 at the bottom), continuous, so a tile's centre
 * is `{ x: pos.x + 0.5, y: pos.y + 0.5 }`.
 */
import { createContext, useContext } from 'react';
import type { Rgb } from './particles';

export interface BoardPoint {
  x: number;
  y: number;
}

export type BurstKind =
  | 'sparks'
  | 'snuff_sparks'
  | 'dust'
  | 'melt_smoke'
  | 'dust_puff'
  | 'ward_shards'
  | 'ward_glint'
  | 'heal'
  | 'plume'
  | 'plume_small'
  | 'gloam'
  | 'summon'
  | 'wax_chips'
  | 'embers';

export interface CardFlightSpec {
  /** Card art data id (the card face drawn in flight). */
  cardId: string;
  tempered: boolean;
  /** Client rect the card leaves from (the hand card), or null to rise from the bottom centre. */
  from: { x: number; y: number; w: number; h: number } | null;
  /** Client point it lands on (the first target's tile centre, or the board centre). */
  to: { x: number; y: number };
  /** Sigil / frame colour of the seal flash. */
  accent: string;
  duration: number;
}

export type FxCommand =
  | { kind: 'burst'; burst: BurstKind; at: BoardPoint; delay?: number; color?: Rgb }
  | { kind: 'trail'; points: BoardPoint[]; msPerTile: number }
  | { kind: 'bolt'; from: BoardPoint; to: BoardPoint; arc: number; duration: number; color: Rgb }
  | { kind: 'ring'; at: BoardPoint; radius: number; ttl: number; color: Rgb; delay?: number }
  | { kind: 'shake'; strength: number; duration: number }
  | { kind: 'flash'; tone: 'white' | 'gold'; duration: number }
  | { kind: 'vignette'; strength: number; duration: number }
  | { kind: 'card'; flight: CardFlightSpec };

export type FxCommandOf<K extends FxCommand['kind']> = Extract<FxCommand, { kind: K }>;

type Listener = (command: FxCommand) => void;

export class FxBus {
  private readonly listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(command: FxCommand): void {
    for (const listener of [...this.listeners]) listener(command);
  }

  emitAll(commands: readonly FxCommand[]): void {
    for (const command of commands) this.emit(command);
  }
}

export const FxBusContext = createContext<FxBus | null>(null);

export function useFxBus(): FxBus {
  const bus = useContext(FxBusContext);
  if (!bus) throw new Error('useFxBus must be used inside an FxBusContext provider');
  return bus;
}

/** Centre of a tile or of a multi-tile footprint, as a board point. */
export function centreOf(pos: { x: number; y: number }, size = 1): BoardPoint {
  return { x: pos.x + size / 2, y: pos.y + size / 2 };
}

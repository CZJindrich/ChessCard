/**
 * DOM board effects driven by playback cues (GDD §16.9): floating damage and heal numbers (red
 * only for damage the Wickfolk take), the melting / bursting ghosts of the dead and a soft glow
 * where a card, Ward or summon lands. Sparks, dust, smoke and bolts are particles (src/ui/fx).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { PieceArt } from '../../art';
import type { CardTargetChoice, GameState, Piece, Pos } from '../../engine/types';
import type { PlaybackStep } from '../../game';
import { useController, useGameSnapshot } from './context';
import { tileXY, type BoardMetrics } from './geometry';
import { houseColorOf, pieceArtProps } from './pieceView';

type FxItem =
  | { id: number; kind: 'number'; pos: Pos; text: string; tone: 'incoming' | 'dealt' | 'heal' | 'ward'; ttl: number }
  | { id: number; kind: 'ghost'; piece: Piece; state: GameState; style: 'melt' | 'burst'; ttl: number }
  | { id: number; kind: 'flash'; pos: Pos; tone: string; ttl: number };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type FxDraft = DistributiveOmit<FxItem, 'id'>;

const NUMBER_MS = 1100;

function choicePos(state: GameState, choice: CardTargetChoice | undefined): Pos | null {
  if (!choice) return null;
  if (choice.kind === 'piece') return state.pieces[choice.pieceId]?.pos ?? null;
  if (choice.kind === 'tile') return choice.pos;
  return null;
}

/** The effects one playback step spawns (positions read from the state shown before it). */
function fxFor(step: PlaybackStep, before: GameState): FxDraft[] {
  const e = step.event;
  switch (e.type) {
    case 'damage': {
      const piece = before.pieces[e.pieceId];
      if (!piece) return [];
      if (e.blockedByWard) return [{ kind: 'number', pos: piece.pos, text: 'Ward', tone: 'ward', ttl: NUMBER_MS }];
      return [{ kind: 'number', pos: piece.pos, text: `−${e.amount}`, tone: piece.side === 'wick' ? 'incoming' : 'dealt', ttl: NUMBER_MS }];
    }
    case 'heal': {
      const piece = before.pieces[e.pieceId];
      return piece && e.amount > 0 ? [{ kind: 'number', pos: piece.pos, text: `+${e.amount}`, tone: 'heal', ttl: NUMBER_MS }] : [];
    }
    case 'piece_died': {
      const piece = before.pieces[e.pieceId];
      if (!piece) return [];
      return [{ kind: 'ghost', piece, state: before, style: e.side === 'snuff' ? 'burst' : 'melt', ttl: Math.max(300, step.duration) + 120 }];
    }
    case 'card_played':
    case 'power_used': {
      const pos = choicePos(before, e.targets[0]);
      return pos ? [{ kind: 'flash', pos, tone: 'card', ttl: 600 }] : [];
    }
    case 'status_changed': {
      if (!e.active || e.status !== 'ward') return [];
      const piece = before.pieces[e.pieceId];
      return piece ? [{ kind: 'flash', pos: piece.pos, tone: 'ward', ttl: 500 }] : [];
    }
    case 'summoned':
      return e.source === 'setup' ? [] : [{ kind: 'flash', pos: e.pos, tone: e.side === 'snuff' ? 'snuff' : 'summon', ttl: 600 }];
    default:
      return [];
  }
}

function centre(pos: Pos, m: BoardMetrics): { x: number; y: number } {
  const o = tileXY(pos, m);
  return { x: o.x + m.tile / 2, y: o.y + m.tile / 2 };
}

function FxView({ item, m }: { item: FxItem; m: BoardMetrics }): ReactElement | null {
  switch (item.kind) {
    case 'number': {
      const c = centre(item.pos, m);
      return (
        // left/top, not transform: the float animation scales the number about its own centre.
        <span className={`ww-fx-number ww-fx-number--${item.tone}`} style={{ left: c.x, top: c.y - m.tile * 0.25, fontSize: Math.max(14, m.tile * 0.38) }}>
          {item.text}
        </span>
      );
    }
    case 'ghost': {
      const o = tileXY(item.piece.pos, m);
      return (
        <div
          className={`ww-fx-ghost ww-fx-ghost--${item.style}`}
          style={{ transform: `translate(${o.x}px, ${o.y}px)`, width: m.tile, height: m.tile, '--ww-fx-dur': `${item.ttl}ms`, '--ww-fx-wax': houseColorOf(item.state, item.piece.owner) ?? '#E6D9B8' } as CSSProperties}
        >
          <PieceArt {...pieceArtProps(item.state, item.piece, m.tile, false)} animated={false} showStats={false} showPips={false} />
        </div>
      );
    }
    case 'flash': {
      const o = tileXY(item.pos, m);
      return <span className={`ww-fx-flash ww-fx-flash--${item.tone}`} style={{ transform: `translate(${o.x}px, ${o.y}px)`, width: m.tile, height: m.tile }} />;
    }
  }
}

export function FxLayer({ metrics }: { metrics: BoardMetrics }): ReactElement {
  const controller = useController();
  const snap = useGameSnapshot();
  const [items, setItems] = useState<FxItem[]>([]);
  const stateRef = useRef(snap.state);
  const nextId = useRef(1);
  stateRef.current = snap.state;

  useEffect(() => {
    const timers = new Set<number>();
    const off = controller.onCue((step) => {
      if (step.duration <= 0) return;
      const drafts = fxFor(step, stateRef.current);
      if (drafts.length === 0) return;
      const created = drafts.map((d) => ({ ...d, id: nextId.current++ }) as FxItem);
      setItems((prev) => [...prev, ...created]);
      for (const item of created) {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          setItems((prev) => prev.filter((x) => x.id !== item.id));
        }, item.ttl);
        timers.add(timer);
      }
    });
    return () => {
      off();
      for (const t of timers) window.clearTimeout(t);
    };
  }, [controller]);

  return (
    <div className="ww-fx" aria-hidden="true">
      {items.map((item) => (
        <FxView key={item.id} item={item} m={metrics} />
      ))}
    </div>
  );
}

/**
 * The hand as a fan of mini cards (GDD §15.4, §16.7). Hover lifts a card and shows its full
 * face; click selects it (then click a glowing tile), or drag it onto a target (§15.7). A card
 * that can't be played is greyed with its reason and shakes when clicked (§15.6).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement } from 'react';
import { CardFace, CardMini, type CardArtData } from '../../art';
import { cardTargets } from '../../engine';
import type { CardInstance, CardTargetInfo, ContentRegistry, GameState } from '../../engine/types';
import { reasonLine } from '../../game';
import { usePresentation } from '../app/services';
import { cardArtData } from '../model/describe';
import { useBoardLocator } from './boardLocator';
import { useController, useGameSnapshot, useRegistry } from './context';
import { houseColorOf } from './pieceView';

const DRAG_THRESHOLD = 8;

function useRemPx(): number {
  const [rem, setRem] = useState(16);
  useEffect(() => {
    const read = (): void => setRem(parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return rem;
}

function artFor(reg: ContentRegistry, card: CardInstance, info: CardTargetInfo | undefined): CardArtData | null {
  const def = reg.cards.byId[card.id];
  if (!def) return null;
  const base = cardArtData(def);
  const disabled = info !== undefined && !info.playable;
  return {
    ...base,
    cost: info?.cost ?? Math.max(0, def.cost - (card.tempered ? 1 : 0)),
    tempered: card.tempered,
    disabled,
    reason: disabled && info?.reason ? reasonLine(info.reason, info.params) : undefined,
  };
}

interface DragState {
  uid: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

function useCardInfos(state: GameState, seat: number | null, interactive: boolean): Map<string, CardTargetInfo> {
  return useMemo(() => {
    const out = new Map<string, CardTargetInfo>();
    if (!interactive || seat === null) return out;
    for (const card of state.players[seat]?.hand ?? []) out.set(card.uid, cardTargets(state, seat, card.uid));
    return out;
  }, [state, seat, interactive]);
}

export function HandFan({ seat }: { seat: number | null }): ReactElement {
  const snap = useGameSnapshot();
  const controller = useController();
  const registry = useRegistry();
  const presentation = usePresentation();
  const locator = useBoardLocator();
  const rem = useRemPx();
  const [hovered, setHovered] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);
  const interactive = seat !== null && snap.uiSeat === seat && snap.latest.phase === 'players';
  const infos = useCardInfos(snap.latest, seat, interactive);
  const hand = seat !== null ? (snap.state.players[seat]?.hand ?? []) : [];
  const n = hand.length;
  const cardW = Math.round(rem * 5.6);
  const houseColor = houseColorOf(snap.state, seat);
  const selectedUid = snap.selection.card?.uid ?? null;
  const notice = snap.notice;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, uid: string): void => {
    if (!interactive || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ uid, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false });
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>): void => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD;
    if (!drag.active && moved) {
      controller.selectCard(drag.uid);
      if (controller.getSnapshot().selection.card?.uid !== drag.uid) {
        setDrag(null);
        return;
      }
    }
    const active = drag.active || moved;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, active });
    if (active) controller.hoverTile(locator.current?.tileAt(e.clientX, e.clientY) ?? null);
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>): void => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.active) {
      suppressClick.current = true;
      const tile = locator.current?.tileAt(e.clientX, e.clientY) ?? null;
      if (tile) controller.dropCard(drag.uid, tile);
      controller.hoverTile(null);
    }
    setDrag(null);
  };

  const shown = hovered;
  const draggedCard = drag?.active ? hand.find((c) => c.uid === drag.uid) : undefined;
  const draggedArt = draggedCard ? artFor(registry, draggedCard, infos.get(draggedCard.uid)) : null;

  return (
    <div className={`ww-hand${interactive ? '' : ' ww-hand--idle'}`} style={{ '--ww-hand-n': n, '--ww-card-w': `${cardW}px` } as CSSProperties} aria-label="Your hand">
      {hand.map((card, i) => {
        const art = artFor(registry, card, infos.get(card.uid));
        if (!art) return null;
        const selected = selectedUid === card.uid;
        const shaking = notice?.anchor.kind === 'card' && notice.anchor.uid === card.uid;
        const offset = i - (n - 1) / 2;
        const style = { '--ww-i': i, '--ww-offset': offset, '--ww-abs': Math.abs(offset), zIndex: hovered === card.uid ? 40 : selected ? 30 : 10 + i } as CSSProperties;
        const classes = ['ww-hand-card', selected && 'ww-hand-card--selected', art.disabled && 'ww-hand-card--disabled', drag?.active && drag.uid === card.uid && 'ww-hand-card--dragging'].filter(Boolean).join(' ');
        return (
          <button
            key={shaking ? `${card.uid}:${notice.id}` : card.uid}
            type="button"
            className={classes}
            style={style}
            aria-label={`${art.name}, ${art.cost} Flame${art.reason ? `: ${art.reason}` : ''}`}
            aria-pressed={selected}
            data-card-id={card.id}
            data-card-uid={card.uid}
            onPointerEnter={() => setHovered(card.uid)}
            onPointerLeave={() => setHovered((h) => (h === card.uid ? null : h))}
            onPointerDown={(e) => onPointerDown(e, card.uid)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              if (interactive) controller.selectCard(card.uid);
            }}
          >
            <span className={`ww-hand-card__body${shaking ? ' ww-shake' : ''}`}>
              <CardMini card={art} width={cardW} houseColor={houseColor} animated={!presentation.reduced_motion && selected} />
              {interactive && i < 8 && <span className="ww-hand-card__key ww-num">{i + 1}</span>}
            </span>
          </button>
        );
      })}
      {shown && !drag?.active && <CardPreview hand={hand} uid={shown} infos={infos} houseColor={houseColor} rem={rem} index={hand.findIndex((c) => c.uid === shown)} />}
      {draggedArt && drag && (
        <div className="ww-drag-ghost" style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}>
          <CardMini card={draggedArt} width={Math.round(cardW * 0.8)} houseColor={houseColor} animated={false} />
        </div>
      )}
    </div>
  );
}

function CardPreview({ hand, uid, infos, houseColor, rem, index }: { hand: CardInstance[]; uid: string; infos: Map<string, CardTargetInfo>; houseColor: string | undefined; rem: number; index: number }): ReactElement | null {
  const registry = useRegistry();
  const presentation = usePresentation();
  const card = hand.find((c) => c.uid === uid);
  const art = card ? artFor(registry, card, infos.get(uid)) : null;
  if (!art) return null;
  const offset = index - (hand.length - 1) / 2;
  return (
    <div className="ww-card-preview" style={{ '--ww-offset': offset } as CSSProperties} aria-hidden="true">
      <CardFace card={art} width={Math.round(rem * 11.5)} houseColor={houseColor} animated={!presentation.reduced_motion} />
    </div>
  );
}

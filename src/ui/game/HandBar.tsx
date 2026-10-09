/**
 * The bottom bar (GDD §15.4): deck and discard counts, the Flame sconce row (spent Flame
 * smokes; the Flame a selected card would spend pulses), the hand fan, the Hero Power, Undo,
 * Hint and the End Turn wax seal (it pulses when nothing is left to do; hovering it previews
 * the Snuff Strike). During Night setup the hand gives way to the deploy bar.
 */
import { useMemo, useRef, type ReactElement } from 'react';
import { DeckIcon, DiscardIcon, EndTurnSeal, FlameIcon, HeroPowerIcon, HintIcon, UndoIcon } from '../../art';
import { powerTargets } from '../../engine';
import type { CardTargetInfo, GameState } from '../../engine/types';
import { hasRemainingActions, reasonLine } from '../../game';
import { usePresentation } from '../app/services';
import { Tooltip } from '../components/Tooltip';
import { useController, useGameSnapshot } from './context';
import { HandFan } from './HandFan';
import { NightSetupBar } from './NightSetupBar';

function FlameSconces({ state, seat, pending }: { state: GameState; seat: number | null; pending: number }): ReactElement {
  const presentation = usePresentation();
  const player = seat !== null ? state.players[seat] : undefined;
  const flame = player?.flame ?? 0;
  const slots = Math.max(flame, state.config.flame_per_turn);
  return (
    <Tooltip content={`${flame} Flame. Cards cost Flame; it refills to ${state.config.flame_per_turn} at the start of your turn.`}>
      <div className="ww-sconces" aria-label={`${flame} Flame`}>
        {Array.from({ length: slots }, (_, i) => (
          <FlameIcon key={i} lit={i < flame} pending={i < flame && i >= flame - pending} size={22} animated={!presentation.reduced_motion} />
        ))}
        <span className="ww-sconces__count ww-num">{flame}</span>
      </div>
    </Tooltip>
  );
}

function Piles({ state, seat }: { state: GameState; seat: number | null }): ReactElement | null {
  const player = seat !== null ? state.players[seat] : undefined;
  if (!player) return null;
  return (
    <div className="ww-piles">
      <Tooltip content={`Deck: ${player.deck.length} cards`}>
        <span className="ww-pile">
          <DeckIcon size={26} />
          <span className="ww-num">{player.deck.length}</span>
        </span>
      </Tooltip>
      <Tooltip content={`Discard pile: ${player.discard.length} cards`}>
        <span className="ww-pile">
          <DiscardIcon size={26} />
          <span className="ww-num">{player.discard.length}</span>
        </span>
      </Tooltip>
    </div>
  );
}

function shakeKey(base: string, active: boolean, id: number | undefined): string {
  return active && id !== undefined ? `${base}:${id}` : base;
}

function PowerButton({ state, seat }: { state: GameState; seat: number }): ReactElement {
  const controller = useController();
  const snap = useGameSnapshot();
  const player = state.players[seat];
  const info: CardTargetInfo = useMemo(() => powerTargets(state, seat), [state, seat]);
  const shaking = snap.notice?.anchor.kind === 'control' && snap.notice.anchor.id === 'power';
  const label = info.playable ? 'Hero Power (P)' : `Hero Power: ${reasonLine(info.reason ?? 'INVALID_ACTION', info.params)}`;
  return (
    <Tooltip content={label}>
      <button
        key={shakeKey('power', shaking, snap.notice?.id)}
        type="button"
        className={`ww-ctrl ww-ctrl--power${info.playable ? '' : ' ww-ctrl--blocked'}${snap.selection.power ? ' ww-ctrl--on' : ''}${shaking ? ' ww-shake' : ''}`}
        aria-label={label}
        onClick={() => controller.selectPower()}
      >
        <HeroPowerIcon heroId={player?.hero ?? ''} used={player?.turn.powerUsed ?? false} cost={info.cost} size={40} />
      </button>
    </Tooltip>
  );
}

function TurnControls({ seat }: { seat: number | null }): ReactElement {
  const controller = useController();
  const snap = useGameSnapshot();
  const presentation = usePresentation();
  const { latest } = snap;
  const acting = seat !== null && latest.phase === 'players';
  const idle = !snap.animating;
  const nothingLeft = useMemo(() => acting && idle && seat !== null && !hasRemainingActions(latest, seat), [acting, idle, seat, latest]);
  const noticeId = snap.notice?.id;
  const anchored = (id: string): boolean => snap.notice?.anchor.kind === 'control' && snap.notice.anchor.id === id;
  const lastPointer = useRef('mouse');
  // Touch: the first tap shows the Snuff Strike preview and arms the seal, the second ends the turn (§15.7).
  const onEndTurn = (): void => {
    if (lastPointer.current === 'touch' && !snap.selection.previewEndTurn) {
      controller.setEndTurnPreview(true);
      return;
    }
    controller.endTurn();
  };
  return (
    <div className="ww-controls">
      {seat !== null && <PowerButton state={latest} seat={seat} />}
      <Tooltip content="Undo (Z)">
        <button
          key={shakeKey('undo', anchored('undo'), noticeId)}
          type="button"
          className={`ww-ctrl${anchored('undo') ? ' ww-shake' : ''}${latest.undo.depth > 0 ? '' : ' ww-ctrl--blocked'}`}
          aria-label="Undo"
          disabled={!acting}
          onClick={() => controller.undo()}
        >
          <UndoIcon size={26} />
        </button>
      </Tooltip>
      <Tooltip content="Hint (H)">
        <button key={shakeKey('hint', anchored('hint'), noticeId)} type="button" className="ww-ctrl" aria-label="Hint" disabled={!acting} onClick={() => controller.requestHint()}>
          <HintIcon size={26} />
        </button>
      </Tooltip>
      <button
        key={shakeKey('end', anchored('end_turn'), noticeId)}
        type="button"
        className={`ww-end-turn${anchored('end_turn') ? ' ww-shake' : ''}${acting ? '' : ' ww-end-turn--off'}`}
        aria-label="End Turn (Space)"
        data-testid="end-turn"
        disabled={!acting}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'touch') controller.setEndTurnPreview(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch') controller.setEndTurnPreview(false);
        }}
        onClick={onEndTurn}
      >
        <EndTurnSeal size={84} pulsing={nothingLeft} armed={snap.selection.previewEndTurn} animated={!presentation.reduced_motion} label={acting ? 'END TURN' : 'WAIT'} />
      </button>
    </div>
  );
}

/** The seat whose hand is shown: the acting local seat, else the first local seat, else whoever acts. */
function handSeat(state: GameState, uiSeat: number | null, controlled: readonly number[]): number | null {
  if (uiSeat !== null) return uiSeat;
  if (controlled.length > 0) return controlled[0];
  return state.activeSeat ?? (state.players.length > 0 ? 0 : null);
}

export function HandBar(): ReactElement {
  const snap = useGameSnapshot();
  const controller = useController();
  const { latest, uiSeat } = snap;
  const seat = handSeat(latest, uiSeat, snap.controlledSeats);
  const setup = latest.phase === 'night_setup' && uiSeat !== null;
  // The Flame a selected card or Power would spend pulses in the sconce row.
  const pending = snap.selection.card || snap.selection.power ? (controller.targetInfo()?.cost ?? 0) : 0;
  return (
    <footer className="ww-handbar">
      <div className="ww-handbar__left">
        <Piles state={snap.state} seat={seat} />
        <FlameSconces state={snap.state} seat={seat} pending={pending} />
      </div>
      <div className="ww-handbar__centre">
        {setup ? <NightSetupBar /> : <HandFan seat={seat} />}
      </div>
      <div className="ww-handbar__right">
        <TurnControls seat={uiSeat} />
      </div>
    </footer>
  );
}

/**
 * The Toll (GDD §13.4): at the start of a regular Night from Night 2, the chooser picks the
 * Blessing or the Curse (a Curse lets every seat take 2 cards at the next Chandlery). Only the
 * chooser sees the choice; everyone else sees who is choosing.
 */
import type { ReactElement } from 'react';
import type { TollDef } from '../../engine/types';
import { useController, useGameSnapshot, useRegistry } from './context';
import { GameDialog } from './GameDialog';

function TollCard({ toll, onPick }: { toll: TollDef; onPick: () => void }): ReactElement {
  const curse = toll.kind === 'curse';
  return (
    <button type="button" className={`ww-toll-card ww-toll-card--${toll.kind}`} onClick={onPick} data-toll={toll.id}>
      <span className="ww-toll-card__kind">{curse ? 'Curse' : 'Blessing'}</span>
      <span className="ww-toll-card__sigil" aria-hidden="true">
        {curse ? '✠' : '✦'}
      </span>
      <span className="ww-toll-card__name">{toll.name}</span>
      <span className="ww-toll-card__text">{toll.text}</span>
      {toll.flavor && <span className="ww-toll-card__flavor">{toll.flavor}</span>}
      {curse && <span className="ww-toll-card__reward">Reward: take 2 cards at the next Chandlery</span>}
    </button>
  );
}

export function TollModal(): ReactElement | null {
  const snap = useGameSnapshot();
  const controller = useController();
  const registry = useRegistry();
  const { latest } = snap;
  if (latest.phase !== 'toll' || latest.toll.active !== null || !latest.toll.offer || snap.animating) return null;
  const chooser = latest.toll.chooser;
  const blessing = registry.tolls.byId[latest.toll.offer.blessing];
  const curse = registry.tolls.byId[latest.toll.offer.curse];
  if (!blessing || !curse || chooser === null) return null;
  if (snap.uiSeat !== chooser) {
    return (
      <div className="ww-waiting-chip" role="status">
        {latest.players[chooser]?.name ?? 'A player'} is choosing the Toll…
      </div>
    );
  }
  const pick = (tollId: string): void => {
    controller.dispatch({ type: 'choose_toll', seat: chooser, tollId });
  };
  return (
    <GameDialog eyebrow={`Night ${latest.night} · The Toll`} title="The bell tolls. Choose the Night's omen." size="lg">
      <div className="ww-toll-choice">
        <TollCard toll={blessing} onPick={() => pick(blessing.id)} />
        <TollCard toll={curse} onPick={() => pick(curse.id)} />
      </div>
    </GameDialog>
  );
}

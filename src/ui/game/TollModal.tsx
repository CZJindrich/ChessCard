/**
 * The Toll reveal (GDD §13.4, §15.1): at the start of a regular Night from Night 2 the bell
 * tolls and two cards flip — a Blessing and a Curse. The chooser picks one for the whole Night;
 * a Curse lets every seat take 2 cards at the next Chandlery. Others see who is choosing.
 */
import type { CSSProperties, ReactElement } from 'react';
import type { TollDef } from '../../engine/types';
import { usePresentation } from '../app/services';
import { useController, useGameSnapshot, useRegistry } from './context';
import { GameDialog } from './GameDialog';

function TollCard({ toll, index, onPick }: { toll: TollDef; index: number; onPick: () => void }): ReactElement {
  const presentation = usePresentation();
  const curse = toll.kind === 'curse';
  const style = { '--ww-flip-delay': `${180 + index * 320}ms` } as CSSProperties;
  return (
    <button
      type="button"
      className={`ww-toll-card ww-toll-card--${toll.kind}${presentation.reduced_motion ? '' : ' ww-toll-card--flip'}`}
      style={style}
      onClick={onPick}
      data-toll={toll.id}
      aria-label={`${curse ? 'Curse' : 'Blessing'}: ${toll.name}. ${toll.text}${curse ? ' Reward: take 2 cards at the next Chandlery.' : ''}`}
    >
      <span className="ww-toll-card__inner">
        <span className="ww-toll-card__back" aria-hidden="true">
          <span className="ww-toll-card__back-bell" />
        </span>
        <span className="ww-toll-card__face">
          <span className="ww-toll-card__kind">{curse ? 'Curse' : 'Blessing'}</span>
          <span className="ww-toll-card__sigil" aria-hidden="true">
            {curse ? '✠' : '✦'}
          </span>
          <span className="ww-toll-card__name">{toll.name}</span>
          <span className="ww-toll-card__text">{toll.text}</span>
          {toll.flavor && <span className="ww-toll-card__flavor">{toll.flavor}</span>}
          {curse && <span className="ww-toll-card__reward">Reward: take 2 cards at the next Chandlery</span>}
        </span>
      </span>
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
  const chooserName = latest.players[chooser]?.name ?? 'A player';
  if (snap.uiSeat !== chooser) {
    return (
      <div className="ww-waiting-chip" role="status">
        {chooserName} is choosing the Toll…
      </div>
    );
  }
  const pick = (tollId: string): void => {
    controller.dispatch({ type: 'choose_toll', seat: chooser, tollId });
  };
  const several = latest.players.filter((p) => p.kind === 'human').length > 1;
  return (
    <GameDialog eyebrow={`Night ${latest.night} · The Toll`} title="The bell tolls" size="lg" className="ww-toll-dialog" testId="toll">
      <p className="ww-dialog__lead">{several ? `${chooserName} holds First Light and chooses the Night's omen.` : "Choose the Night's omen. It lasts until Dawn."}</p>
      <div className="ww-toll-choice">
        <TollCard toll={blessing} index={0} onPick={() => pick(blessing.id)} />
        <TollCard toll={curse} index={1} onPick={() => pick(curse.id)} />
      </div>
    </GameDialog>
  );
}

/**
 * The Pass screen (GDD §11.5, §15.1.7): Last Flame hot-seat with `hot_seat_privacy` on. Before
 * every human seat turn and every private draft a full veil hides the hands — "Pass the candle to
 * [Name]" — until that player reveals their seat.
 */
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { FlameIcon, HOUSES, HouseGlyph } from '../../art';
import { HOST_OPTION_DEFAULTS } from '../../config';
import type { GameState } from '../../engine/types';
import { usePresentation } from '../app/services';
import { Button } from '../components/Button';
import { useGameSnapshot } from './context';

/** The private moment the veil guards (a seat turn or a draft), or null when none needs one. */
export function privateMoment(state: GameState, seat: number | null, localHumans: number, privacy = HOST_OPTION_DEFAULTS.hot_seat_privacy): string | null {
  if (!privacy || seat === null || state.config.mode !== 'last_flame' || localHumans < 2 || state.result) return null;
  if (state.players[seat]?.eliminated) return null;
  if (state.phase === 'players') return `turn:${state.night}:${state.round}:${seat}`;
  if (state.phase === 'chandlery') return `draft:${state.night}:${seat}`;
  return null;
}

export function PassScreen({ privacy = HOST_OPTION_DEFAULTS.hot_seat_privacy }: { privacy?: boolean }): ReactElement | null {
  const snap = useGameSnapshot();
  const presentation = usePresentation();
  const [revealed, setRevealed] = useState<string | null>(null);
  const localHumans = snap.controlledSeats.filter((seat) => snap.latest.players[seat]?.kind === 'human').length;
  const moment = snap.animating ? null : privateMoment(snap.latest, snap.uiSeat, localHumans, privacy);
  const veiled = moment !== null && moment !== revealed;

  // While veiled, keys do nothing but Enter (reveal): no End Turn or card picks behind the veil.
  useEffect(() => {
    if (!veiled) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Enter') setRevealed(moment);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [veiled, moment]);

  if (!veiled || moment === null || snap.uiSeat === null) return null;
  const player = snap.latest.players[snap.uiSeat];
  if (!player) return null;
  const house = HOUSES[player.house];
  const draft = snap.latest.phase === 'chandlery';
  return (
    <div className="ww-pass" role="dialog" aria-label={`Pass the candle to ${player.name}`} data-testid="pass-screen" style={{ '--ww-house': house.color } as CSSProperties}>
      <div className="ww-pass__inner">
        <FlameIcon lit size={56} animated={!presentation.reduced_motion} />
        <span className="ww-pass__eyebrow">{draft ? 'A private draft' : 'Hands are hidden'}</span>
        <h2 className="ww-pass__title">Pass the candle to {player.name}</h2>
        <span className="ww-pass__house">
          <HouseGlyph house={player.house} disc size={22} /> {house.name}
        </span>
        <Button variant="primary" seal="flame" onClick={() => setRevealed(moment)}>
          I am {player.name}
        </Button>
      </div>
    </div>
  );
}

/**
 * Vigil co-op (GDD §11.3): when several local players still have to act and nobody has claimed
 * the turn, say so above the board. Claims are made on the plaques (or with C).
 */
import type { ReactElement } from 'react';
import { useGameSnapshot } from './context';
import { seatsToClaim } from './model';

export function ClaimPrompt(): ReactElement | null {
  const snap = useGameSnapshot();
  const { latest } = snap;
  if (snap.animating || snap.uiSeat !== null) return null;
  const waiting = seatsToClaim(latest).filter((seat) => snap.controlledSeats.includes(seat) && latest.players[seat]?.kind === 'human');
  if (waiting.length < 2) return null;
  return (
    <div className="ww-card-prompt ww-claim-prompt" role="status">
      <span className="ww-card-prompt__name">Who acts first?</span>
      <span className="ww-card-prompt__text">Press Take My Turn on a plaque (or C). AI allies act once every player has ended.</span>
    </div>
  );
}

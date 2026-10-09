/**
 * Co-op votes (GDD §13.1.7–13.1.8): Retry this Night and Concede need every human seat to agree
 * (AI allies always agree). While a vote runs, a bar under the top bar names who agreed and who
 * is still to answer, with Agree / Decline for this screen's seats that have not voted. Any
 * Decline cancels the vote; online the server also cancels it after 30 s.
 */
import type { ReactElement } from 'react';
import { voteStatus, type VoteKind } from '../../engine';
import type { GameState } from '../../engine/types';
import { useController, useGameSnapshot } from './context';

const VOTE_WORDS: Readonly<Record<VoteKind, { title: string; agree: string }>> = {
  retry: { title: 'Retry this Night?', agree: 'Agree to retry' },
  concede: { title: 'Concede the Vigil?', agree: 'Agree to concede' },
};

/** The running vote, if any (a vote has at least one agreeing seat). */
export function runningVote(state: GameState): VoteKind | null {
  if (!state.vigil) return null;
  if (state.vigil.retryVotes.length > 0) return 'retry';
  if (state.vigil.concedeVotes.length > 0 && !state.result) return 'concede';
  return null;
}

export function VoteBar(): ReactElement | null {
  const snap = useGameSnapshot();
  const controller = useController();
  const { latest } = snap;
  const kind = runningVote(latest);
  if (!kind) return null;
  const status = voteStatus(latest, kind);
  const words = VOTE_WORDS[kind];
  const name = (seat: number): string => latest.players[seat]?.name ?? `Seat ${seat + 1}`;
  const agreed = status.votes.map(name);
  const waiting = status.needed.filter((seat) => !status.votes.includes(seat));
  const mine = waiting.filter((seat) => snap.controlledSeats.includes(seat));
  // Hot-seat: name the player each button answers for.
  const named = snap.controlledSeats.length > 1;
  const answer = (seat: number, vote: boolean): void => {
    controller.dispatch(kind === 'retry' ? { type: 'retry_night', seat, vote } : { type: 'concede', seat, vote }, { kind: 'control', id: 'retry' });
  };
  return (
    <div className="ww-vote" role="status" aria-live="polite" data-testid="vote-bar">
      <span className="ww-vote__title">{words.title}</span>
      <span className="ww-vote__line">
        {agreed.length > 0 ? `${agreed.join(', ')} agreed` : 'Nobody agreed yet'}
        {waiting.length > 0 ? ` · waiting for ${waiting.map(name).join(', ')}` : ''}
      </span>
      {mine.map((seat) => (
        <span key={seat} className="ww-vote__answer">
          <button type="button" className="ww-card-prompt__btn ww-card-prompt__btn--go" onClick={() => answer(seat, true)}>
            {named ? `${name(seat)}: ${words.agree.toLowerCase()}` : words.agree}
          </button>
          <button type="button" className="ww-card-prompt__btn ww-card-prompt__btn--ghost" onClick={() => answer(seat, false)}>
            Decline
          </button>
        </span>
      ))}
    </div>
  );
}

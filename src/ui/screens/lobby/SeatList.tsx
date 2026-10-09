/**
 * The room's seats: House glyph and colour, the player (or bot) and hero, badges (Host, You,
 * Reconnecting, Bot), the Ready flame, and the one action a seat offers this player (take an
 * open seat, leave yours, take over a bot mid-game).
 */
import type { ReactElement } from 'react';
import { FlameIcon, HOUSE_ORDER, HOUSES, HouseGlyph, PieceArt } from '../../../art';
import type { ContentRegistry } from '../../../engine/types';
import type { RoomSnapshot } from '../../../net';
import { Button } from '../../components/Button';
import { seatLine, type SeatLine } from './lobbyModel';

export interface SeatListProps {
  room: RoomSnapshot;
  me: string | null;
  content: ContentRegistry;
  serverNow: number;
  onTake(seat: number): void;
  onLeaveSeat(): void;
}

function ReadyMark({ state }: { state: SeatLine['readyState'] }): ReactElement | null {
  if (state === 'playing' || state === 'open') return null;
  const ready = state === 'ready' || state === 'bot';
  const label = state === 'bot' ? 'Bots are always ready' : ready ? 'Ready' : 'Not ready';
  return (
    <span className={`ww-lobby__ready ww-lobby__ready--${state}`} title={label}>
      <FlameIcon lit={ready} size={18} animated={ready && state === 'ready'} title={label} />
      <span className="ww-lobby__ready-text">{state === 'bot' ? 'Bot' : ready ? 'Ready' : 'Not ready'}</span>
    </span>
  );
}

export function SeatList({ room, me, content, serverNow, onTake, onLeaveSeat }: SeatListProps): ReactElement {
  return (
    <ul className="ww-lobby__seats" aria-label="Seats">
      {room.seats.map((seat) => {
        const houseId = HOUSE_ORDER[seat.seat] ?? HOUSE_ORDER[0];
        const house = HOUSES[houseId];
        const line = seatLine(room, seat, me, content, serverNow);
        const classes = [
          'ww-lobby__seat',
          `ww-lobby__seat--${seat.status}`,
          `ww-lobby__seat--h${seat.seat}`,
          me !== null && seat.occupantId === me && 'ww-lobby__seat--mine',
          seat.pendingId !== null && 'ww-lobby__seat--pending',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li key={seat.seat} className={classes} data-testid={`seat-${seat.seat}`}>
            <HouseGlyph house={houseId} disc size={36} title={house.name} />
            <span className="ww-lobby__seat-text">
              <span className="ww-lobby__seat-name">
                <span className="ww-lobby__seat-label">{line.name}</span>
                {line.badges.map((b) => (
                  <span key={b.text} className={`ww-badge${b.tone === 'plain' ? '' : ` ww-badge--${b.tone}`}`}>
                    {b.text}
                  </span>
                ))}
              </span>
              <span className="ww-lobby__seat-sub">{line.detail}</span>
            </span>
            {seat.hero && (
              <span className="ww-lobby__hero" aria-hidden="true">
                <PieceArt defId={seat.hero} kind="hero" houseColor={house.color} size={40} showStats={false} showPips={false} animated={false} />
              </span>
            )}
            <ReadyMark state={line.readyState} />
            <span className="ww-lobby__seat-action">
              {line.action === 'take' && (
                <Button size="sm" variant="secondary" onClick={() => onTake(seat.seat)}>
                  Take seat
                </Button>
              )}
              {line.action === 'take_over' && (
                <Button size="sm" variant="secondary" onClick={() => onTake(seat.seat)}>
                  Take over
                </Button>
              )}
              {line.action === 'leave' && (
                <Button size="sm" variant="ghost" sound="back" onClick={onLeaveSeat}>
                  Leave seat
                </Button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Online lobby (GDD §15.1.4), placeholder UI: Host (open a room for the configured game) and
 * Join (4-letter room code), plus the seat list with ready lights. The online client plugs
 * in through `services.online` (LobbyActions); without it the buttons explain that online
 * play is not connected yet.
 */
import { useState, type ReactElement } from 'react';
import { FlameIcon, HOUSE_ORDER, HouseGlyph, PieceArt, HOUSES } from '../../../art';
import type { ContentRegistry, GameConfig } from '../../../engine/types';
import type { LobbyRoute } from '../../app/navigation';
import type { LobbyActions } from '../../app/online';
import { useContentState, useServices } from '../../app/services';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { heroFirstName } from '../../model/describe';
import { isValidRoomCode, normalizeRoomCode } from './roomCode';
import './lobby.css';

export function configSummary(config: GameConfig, content: ContentRegistry): string[] {
  const mode = config.mode === 'vigil' ? 'Vigil' : 'Last Flame';
  const length = content.lengths.byId[config.length]?.name ?? config.length;
  const difficulty = content.difficulty.byId[config.difficulty]?.name ?? config.difficulty;
  const boss = config.boss_choice === 'random' ? 'Random boss' : (content.bosses.byId[config.boss_choice]?.name ?? config.boss_choice);
  const seconds = config.turn_timer === 'off' ? null : content.rules.timers.turn[config.turn_timer];
  const timer = seconds === null ? 'No turn timer' : `Turn timer: ${config.turn_timer} (${seconds} s per seat turn)`;
  return [`${mode} · ${length} · ${difficulty}`, `${config.nights} Nights · ${boss}`, timer];
}

/** Seat 1 is the host's own seat; other human seats wait for someone to claim them. */
function seatRole(kind: GameConfig['seats'][number]['kind'], index: number): string {
  if (kind !== 'human') return 'Bot';
  return index === 0 ? 'You (host)' : 'Waiting for a player';
}

function SeatList({ config, content }: { config: GameConfig; content: ContentRegistry }): ReactElement {
  return (
    <ul className="ww-lobby__seats">
      {HOUSE_ORDER.map((houseId, index) => {
        const seat = config.seats[index];
        const house = HOUSES[houseId];
        return (
          <li key={houseId} className={seat ? 'ww-lobby__seat' : 'ww-lobby__seat ww-lobby__seat--empty'}>
            <HouseGlyph house={houseId} disc size={34} />
            <span className="ww-lobby__seat-text">
              <span className="ww-lobby__seat-name">{seat ? seat.name : 'Open seat'}</span>
              <span className="ww-lobby__seat-sub">
                {seat ? `${seatRole(seat.kind, index)} · ${heroFirstName(content, seat.hero)}` : house.name}
              </span>
            </span>
            {seat?.hero && <PieceArt defId={seat.hero} kind="hero" houseColor={house.color} size={36} showStats={false} showPips={false} animated={false} />}
            <span className="ww-lobby__ready" title={seat?.kind === 'human' ? 'Not ready' : seat ? 'Bots are always ready' : 'Empty'}>
              <FlameIcon lit={Boolean(seat && seat.kind !== 'human')} size={22} animated={false} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function LobbyScreen({ route, actions: given }: { route: LobbyRoute; actions?: LobbyActions }): ReactElement {
  const services = useServices();
  const actions = given ?? services.online;
  const { registry } = useContentState();
  const rules = registry.rules.roomCode;
  const [code, setCode] = useState(route.role === 'join' ? normalizeRoomCode(route.code ?? '', rules) : '');
  const validCode = isValidRoomCode(code, rules);

  const notConnected = (): void => {
    services.toasts.show({ title: 'Online play is not connected in this build', lines: ['Local games work offline: New Game, Quick Play and Quick Last Flame.'], tone: 'info' });
  };

  const join = (): void => {
    if (actions) actions.joinRoom(code);
    else notConnected();
  };

  return (
    <ScreenFrame title="Online" subtitle="Rooms use 4-letter codes. Any settings change clears every Ready." bodyClassName="ww-lobby">
      <Panel title="Host a room" drips="plum" dripOffset={20} className="ww-lobby__panel">
        {route.role === 'host' ? (
          <>
            <ul className="ww-lobby__summary">
              {configSummary(route.config, registry).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <SeatList config={route.config} content={registry} />
            <div className="ww-lobby__actions">
              <Button variant="primary" seal="door" sound="confirm" onClick={() => (actions ? actions.openRoom(route.config, route.selection) : notConnected())}>
                Open room
              </Button>
              <Button variant="ghost" size="sm" icon="quill" sound="back" onClick={() => services.nav.back()}>
                Edit settings
              </Button>
            </div>
          </>
        ) : (
          <div className="ww-lobby__empty">
            <p className="ww-dim">Set up seats and rules first, then open a room for your friends.</p>
            <Button seal="quill" onClick={() => services.nav.push({ screen: 'setup' })}>
              New Game
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Join a room" drips="plum" dripOffset={140} className="ww-lobby__panel">
        <form
          className="ww-lobby__join"
          onSubmit={(event) => {
            event.preventDefault();
            if (validCode) join();
          }}
        >
          <label className="ww-field">
            <span className="ww-field__label">Room code</span>
            <input
              className="ww-input ww-input--code ww-lobby__code"
              value={code}
              placeholder="KWTR"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              aria-describedby="ww-lobby-code-help"
              onChange={(event) => setCode(normalizeRoomCode(event.currentTarget.value, rules))}
            />
          </label>
          <p id="ww-lobby-code-help" className="ww-dim ww-lobby__help">
            Letters {rules.alphabet.split('').join(' ')}: no vowels, so no words.
          </p>
          <Button type="submit" variant="primary" seal="door" sound="confirm" disabledReason={validCode ? null : `Enter all ${rules.length} letters`}>
            Join
          </Button>
        </form>
        <p className="ww-lobby__note ww-flavor">Late joiners take over a bot seat at its next turn.</p>
      </Panel>
    </ScreenFrame>
  );
}

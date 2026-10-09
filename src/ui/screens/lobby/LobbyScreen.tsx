/**
 * Online lobby (GDD §15.1.4, §11.6).
 *
 * Host: Setup's "Host Online" lands here with a config; the room opens at once and shows its
 * 4-letter code (copy button and share hint), the seats with House glyphs, names, Ready flames
 * and "reconnecting" badges, and the Basic settings (any change clears every Ready). Start is
 * enabled when every claimed human seat is Ready.
 * Join: name and code, then take a seat and toggle Ready. A game under way offers its bot seats
 * to late joiners ("Take over" at that seat's next turn).
 *
 * Without an online client (`services.online` null, or a stub without a session) the screen
 * keeps the simple forms and hands Host/Join to whatever is there.
 */
import { useEffect, useState, type ReactElement } from 'react';
import type { ContentRegistry, GameConfig } from '../../../engine/types';
import type { OnlineSession, RoomSnapshot, SessionState } from '../../../net';
import { ROOM_CODE_LENGTH } from '../../../net/protocol';
import type { LobbyRoute } from '../../app/navigation';
import type { LobbyActions } from '../../app/online';
import { useContentState, useProfile, useServices } from '../../app/services';
import { useStore } from '../../app/store';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { ConnectionLine } from './ConnectionLine';
import { HostSettings } from './HostSettings';
import { readyCount, startLabel } from './lobbyModel';
import { isValidRoomCode, normalizeRoomCode } from './roomCode';
import { SeatList } from './SeatList';
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

/** Host routes already turned into a room (React StrictMode mounts effects twice). */
const openedRoutes = new WeakSet<LobbyRoute>();

export function LobbyScreen({ route, actions: given }: { route: LobbyRoute; actions?: LobbyActions }): ReactElement {
  const services = useServices();
  const actions = given ?? services.online;
  const session = actions?.session;
  if (actions && session) return <OnlineLobby route={route} actions={actions} session={session} />;
  return <OfflineLobby route={route} actions={actions ?? null} />;
}

// =============================================================================================
// The live lobby
// =============================================================================================

function useServerNow(session: OnlineSession, active: boolean): number {
  const [now, setNow] = useState(() => session.serverNow());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(session.serverNow()), 1000);
    return () => window.clearInterval(timer);
  }, [session, active]);
  return active ? now : session.serverNow();
}

function OnlineLobby({ route, actions, session }: { route: LobbyRoute; actions: LobbyActions; session: OnlineSession }): ReactElement {
  const services = useServices();
  const state = useStore(session);
  const profile = useProfile();
  const { registry } = useContentState();
  const room = state.room;

  // Host Online: open the room (or, coming back from Setup, update it) once per route.
  useEffect(() => {
    if (route.role !== 'host' || openedRoutes.has(route)) return;
    openedRoutes.add(route);
    if (!session.get().name) session.setName(route.config.seats.find((s) => s.kind === 'human')?.name ?? profile.playerName);
    actions.openRoom(route.config, route.selection);
  }, [route, actions, session, profile.playerName]);

  const leave = (): void => {
    session.leave();
    if (services.nav.canGoBack()) services.nav.back();
    else services.nav.reset();
  };

  const modeLine = room ? (room.config.mode === 'vigil' ? 'Vigil — team up against the Snuff' : 'Last Flame — every candle for itself') : null;
  return (
    <ScreenFrame
      title={room ? `Room ${room.code}` : 'Online'}
      subtitle={modeLine ?? 'Rooms use 4-letter codes. Any settings change clears every Ready.'}
      backLabel={room || state.pending ? 'Leave' : 'Back'}
      onBack={leave}
      bodyClassName={room ? 'ww-lobby ww-lobby--room' : 'ww-lobby'}
      footer={room ? <RoomFooter room={room} state={state} session={session} onLeave={leave} onEnterGame={() => actions.enterGame?.()} /> : undefined}
    >
      {room ? (
        <RoomView room={room} state={state} session={session} content={registry} modded={services.content.get().modded} />
      ) : route.role === 'host' ? (
        <OpeningPanel state={state} session={session} onRetry={() => actions.openRoom(route.config, route.selection)} />
      ) : (
        <JoinPanel initialCode={route.code ?? ''} state={state} session={session} actions={actions} defaultName={profile.playerName} />
      )}
    </ScreenFrame>
  );
}

function RoomView({ room, state, session, content, modded }: { room: RoomSnapshot; state: SessionState; session: OnlineSession; content: ContentRegistry; modded: boolean }): ReactElement {
  const services = useServices();
  const reconnecting = room.seats.some((s) => s.status === 'reconnecting');
  const serverNow = useServerNow(session, reconnecting);
  const isHost = state.clientId !== null && room.hostId === state.clientId;
  const watchers = room.members.filter((m) => m.seat === null && !room.seats.some((s) => s.pendingId === m.id));
  const counts = readyCount(room);
  const copy = (): void => {
    const done = (): void => {
      services.toasts.show({ title: `Room code ${room.code} copied`, tone: 'success' });
    };
    const clipboard = services.env.clipboard;
    if (!clipboard) {
      services.toasts.show({ title: `The room code is ${room.code}`, lines: ['Copying is not available here; read it out instead.'], tone: 'info' });
      return;
    }
    clipboard.writeText(room.code).then(done, () => services.toasts.show({ title: `The room code is ${room.code}`, lines: ['The clipboard refused; read it out instead.'], tone: 'info' }));
  };
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const seatsTitle = room.phase === 'lobby' ? (counts.total > 0 ? `Seats · ${counts.ready}/${counts.total} ready` : 'Seats') : 'Seats · game under way';

  return (
    <>
      <section className="ww-lobby__banner ww-filigree" aria-label="Room code">
        <div className="ww-roomcode" aria-label={`Room code ${room.code.split('').join(' ')}`} data-testid="room-code">
          {room.code.split('').map((ch, i) => (
            <span key={`${ch}${i}`} className="ww-roomcode__letter" aria-hidden="true">
              {ch}
            </span>
          ))}
        </div>
        <div className="ww-lobby__share">
          <p className="ww-lobby__share-line">
            Friends open <strong>{host || 'this page'}</strong>, choose <em>Join Online</em> and type the code.
          </p>
          <ConnectionLine session={session} state={state} />
        </div>
        <Button size="sm" icon="copy" onClick={copy} className="ww-lobby__copy">
          Copy code
        </Button>
      </section>

      <div className="ww-lobby__columns">
        <Panel title={seatsTitle} drips="plum" dripOffset={20} className="ww-lobby__panel ww-lobby__seats-panel">
          <SeatList room={room} me={state.clientId} content={content} serverNow={serverNow} onTake={(seat) => session.claimSeat(seat)} onLeaveSeat={() => session.releaseSeat()} />
          {watchers.length > 0 && (
            <p className="ww-lobby__watchers">
              <span className="ww-field__label">Without a seat</span> {watchers.map((m) => (m.id === state.clientId ? `${m.name} (you)` : m.name)).join(', ')}
            </p>
          )}
          {room.phase === 'playing' && (
            <p className="ww-lobby__fine">Late joiners take over a bot seat at the start of its next turn; a bot mid-turn finishes first.</p>
          )}
        </Panel>
        {isHost && room.phase === 'lobby' && room.selection ? (
          <HostSettings
            room={room}
            selection={room.selection}
            content={content}
            modded={modded}
            onChange={(config, selection, grace) => session.updateConfig(config, selection, grace === undefined ? undefined : { reconnect_grace: grace })}
            onEditAll={(selection) => services.nav.push({ screen: 'setup', selection })}
          />
        ) : (
          <Panel title="This game" drips="plum" dripOffset={90} className="ww-lobby__panel ww-lobby__settings">
            <ul className="ww-lobby__summary">
              {configSummary(room.config, content).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="ww-lobby__fine">
              {room.phase === 'lobby' ? 'The host picks the settings. Any change clears every Ready.' : 'The game is running. Take over a bot seat, or watch.'}
            </p>
            <p className="ww-lobby__fine">A disconnected player keeps their seat for {room.reconnectGrace} s, then a Warden bot plays it until they return.</p>
          </Panel>
        )}
      </div>
    </>
  );
}

function RoomFooter({
  room,
  state,
  session,
  onLeave,
  onEnterGame,
}: {
  room: RoomSnapshot;
  state: SessionState;
  session: OnlineSession;
  onLeave: () => void;
  onEnterGame: () => void;
}): ReactElement {
  const me = state.clientId;
  const isHost = me !== null && room.hostId === me;
  const mine = room.seats.find((s) => s.occupantId === me);
  const pending = room.seats.find((s) => s.pendingId === me);
  const leaveButton = (
    <Button size="sm" variant="ghost" icon="back" sound="back" onClick={onLeave}>
      Leave room
    </Button>
  );
  if (room.phase === 'playing') {
    return (
      <>
        {leaveButton}
        <span className="ww-spacer" />
        <span className="ww-lobby__footer-note">{pending ? 'You take your seat at its next turn.' : mine ? 'Your game is under way.' : 'A game is under way.'}</span>
        <Button variant="primary" size="lg" seal="play" sound="confirm" onClick={onEnterGame}>
          {mine || pending ? 'Return to the game' : 'Watch the game'}
        </Button>
      </>
    );
  }
  const ready = mine?.ready ?? false;
  return (
    <>
      {leaveButton}
      <span className="ww-spacer" />
      {mine ? (
        <Button
          variant={ready ? 'secondary' : 'primary'}
          size="lg"
          seal={ready ? 'check' : 'flame'}
          sound="confirm"
          aria-pressed={ready}
          className={ready ? 'ww-lobby__ready-btn ww-lobby__ready-btn--on' : 'ww-lobby__ready-btn'}
          onClick={() => session.setReady(!ready)}
          subtitle={ready ? 'Click to cancel' : undefined}
        >
          {ready ? 'Ready' : "I'm Ready"}
        </Button>
      ) : (
        <span className="ww-lobby__footer-note">Take a seat to play.</span>
      )}
      {isHost ? (
        <>
          {!room.canStart && room.startBlocker && <span className="ww-lobby__footer-note">{room.startBlocker}</span>}
          <Button variant="primary" size="lg" seal="door" sound="confirm" disabledReason={room.canStart ? null : room.startBlocker} onClick={() => session.startGame()} data-testid="start-game">
            {startLabel(room.config)}
          </Button>
        </>
      ) : (
        <span className="ww-lobby__footer-note">The host starts once every seated player is Ready.</span>
      )}
    </>
  );
}

function OpeningPanel({ state, session, onRetry }: { state: SessionState; session: OnlineSession; onRetry: () => void }): ReactElement {
  // Refused by the server (the toast says why), unreachable, or stopped for good.
  const refused = state.status === 'open' && state.pending === null;
  const trouble = refused || state.fatal !== null || state.status === 'reconnecting' || state.status === 'closed';
  return (
    <Panel title={trouble ? 'The room could not open' : 'Opening your room…'} drips="plum" dripOffset={20} className="ww-lobby__panel ww-lobby__single">
      {state.fatal ? (
        <p className="ww-warn-text">{state.fatal.message}</p>
      ) : refused ? (
        <p className="ww-dim">The server turned these settings down. Go back to change them, or try again.</p>
      ) : state.status === 'reconnecting' ? (
        <p className="ww-dim">
          The game server does not answer. Start it with <code>npm run server</code>, or point to another one below.
        </p>
      ) : (
        <p className="ww-dim">Lighting the lobby candles and asking the server for a room code.</p>
      )}
      <ConnectionLine session={session} state={state} />
      {trouble && (
        <div className="ww-lobby__actions">
          <Button variant="primary" seal="door" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </Panel>
  );
}

function JoinPanel({ initialCode, state, session, actions, defaultName }: { initialCode: string; state: SessionState; session: OnlineSession; actions: LobbyActions; defaultName: string }): ReactElement {
  const services = useServices();
  const { registry } = useContentState();
  const rules = registry.rules.roomCode;
  const [code, setCode] = useState(normalizeRoomCode(initialCode, rules));
  const [name, setName] = useState(state.name || defaultName || '');
  const validCode = isValidRoomCode(code, rules);
  const busy = state.pending === 'join' && state.status !== 'reconnecting' && !state.fatal;
  // Connect while the player types, so the status line shows whether the server answers.
  useEffect(() => {
    if (session.get().status === 'idle' || session.get().status === 'closed') session.connect();
  }, [session]);
  const join = (): void => {
    session.setName(name.trim() || defaultName || 'Lanternwarden');
    actions.joinRoom(code);
  };
  return (
    <div className="ww-lobby__join-layout">
      <Panel title="Join a room" drips="plum" dripOffset={20} className="ww-lobby__panel ww-lobby__single">
        <form
          className="ww-lobby__join"
          onSubmit={(event) => {
            event.preventDefault();
            if (validCode && !busy) join();
          }}
        >
          <label className="ww-field">
            <span className="ww-field__label">Your name</span>
            <input className="ww-input ww-lobby__name" value={name} maxLength={24} placeholder="Lanternwarden" autoComplete="nickname" onChange={(event) => setName(event.currentTarget.value)} />
          </label>
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
          <Button type="submit" variant="primary" seal="door" sound="confirm" disabledReason={busy ? 'Joining…' : validCode ? null : `Enter all ${ROOM_CODE_LENGTH} letters`}>
            Join
          </Button>
        </form>
        <ConnectionLine session={session} state={state} />
        {state.fatal && <p className="ww-warn-text">{state.fatal.message}</p>}
      </Panel>
      <Panel title="Host a room" drips="plum" dripOffset={140} className="ww-lobby__panel ww-lobby__aside">
        <p className="ww-dim">Set up seats and rules, then press Host Online. Friends join with the room code.</p>
        <Button seal="quill" onClick={() => services.nav.push({ screen: 'setup' })}>
          New Game
        </Button>
        <p className="ww-lobby__note ww-flavor">Late joiners take over a bot seat at its next turn.</p>
      </Panel>
    </div>
  );
}

// =============================================================================================
// No online client: the plain forms (tests, or builds without src/net wired in)
// =============================================================================================

function OfflineLobby({ route, actions }: { route: LobbyRoute; actions: LobbyActions | null }): ReactElement {
  const services = useServices();
  const { registry } = useContentState();
  const rules = registry.rules.roomCode;
  const [code, setCode] = useState(route.role === 'join' ? normalizeRoomCode(route.code ?? '', rules) : '');
  const validCode = isValidRoomCode(code, rules);
  const notConnected = (): void => {
    services.toasts.show({ title: 'Online play is not connected in this build', lines: ['Local games work offline: New Game, Quick Play and Quick Last Flame.'], tone: 'info' });
  };
  return (
    <ScreenFrame title="Online" subtitle="Rooms use 4-letter codes. Any settings change clears every Ready." bodyClassName="ww-lobby">
      <div className="ww-lobby__join-layout">
        <Panel title="Join a room" drips="plum" dripOffset={20} className="ww-lobby__panel ww-lobby__single">
          <form
            className="ww-lobby__join"
            onSubmit={(event) => {
              event.preventDefault();
              if (!validCode) return;
              if (actions) actions.joinRoom(code);
              else notConnected();
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
                onChange={(event) => setCode(normalizeRoomCode(event.currentTarget.value, rules))}
              />
            </label>
            <Button type="submit" variant="primary" seal="door" sound="confirm" disabledReason={validCode ? null : `Enter all ${rules.length} letters`}>
              Join
            </Button>
          </form>
        </Panel>
        <Panel title="Host a room" drips="plum" dripOffset={140} className="ww-lobby__panel ww-lobby__aside">
          {route.role === 'host' ? (
            <>
              <ul className="ww-lobby__summary">
                {configSummary(route.config, registry).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Button variant="primary" seal="door" sound="confirm" onClick={() => (actions ? actions.openRoom(route.config, route.selection) : notConnected())}>
                Open room
              </Button>
            </>
          ) : (
            <Button seal="quill" onClick={() => services.nav.push({ screen: 'setup' })}>
              New Game
            </Button>
          )}
        </Panel>
      </div>
    </ScreenFrame>
  );
}

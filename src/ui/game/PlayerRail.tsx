/**
 * The left rail (GDD §15.4, §11.3): one plaque per seat with the hero portrait, an HP wax
 * bar, Flame, the House glyph and the seat's turn state. In Vigil co-op a human plaque offers
 * "Take My Turn" and an AI ally's offers "Let them act". Last Flame adds Glory (it pops when it
 * changes), the First Light token, the Wanted seal on the sole Glory leader, and the out /
 * haunting states. Online, each plaque says who plays the seat: you, another player, a bot or
 * a stand-in, and a reconnecting badge with the grace left.
 */
import { useCallback, type CSSProperties, type ReactElement } from 'react';
import { FirstLightToken, FlameIcon, GloryIcon, HOUSES, HouseGlyph, PieceArt, WantedSeal } from '../../art';
import type { GameState, PlayerState } from '../../engine/types';
import { ordinal } from './titles';
import { useController, useGameSelector, useRegistry } from './context';
import { canClaim, PLAQUE_LABEL, plaqueState } from './model';
import { useOnlineSession, useOnlineState, useTicker } from './onlineContext';
import { onlineSeats, type OnlineSeatInfo } from './onlineModel';
import { PieceCard } from './PieceCard';
import { useCueMoment } from './useCue';

function HpBar({ hp, max }: { hp: number; max: number }): ReactElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return (
    <div className="ww-plaque__hp" role="meter" aria-label="Hero HP" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}>
      <span className="ww-plaque__hp-fill" style={{ width: `${pct}%` }} />
      <span className="ww-plaque__hp-text ww-num">
        {hp}/{max}
      </span>
    </div>
  );
}

function FlameRow({ player, state }: { player: PlayerState; state: GameState }): ReactElement {
  const max = Math.max(player.flame, state.config.flame_per_turn);
  return (
    <span className="ww-plaque__flame" aria-label={`${player.flame} Flame`}>
      {Array.from({ length: max }, (_, i) => (
        <FlameIcon key={i} lit={i < player.flame} size={11} animated={false} />
      ))}
    </span>
  );
}

/** Glory with a pop (and a floating "+n") when it changes (§16.11 `coin`). */
function GloryCount({ player }: { player: PlayerState }): ReactElement {
  const change = useCueMoment((e) => (e.type === 'glory_changed' && e.seat === player.seat ? e.to - e.from : null), 900);
  return (
    <span key={change ? `g${change.id}` : 'glory'} className={`ww-plaque__glory ww-num${change ? ' ww-plaque__glory--pop' : ''}`} aria-label={`${player.glory} Glory`} data-testid={`glory-${player.seat}`}>
      <GloryIcon size={16} />
      {player.glory}
      {change && <span className={`ww-plaque__glory-delta${change.value < 0 ? ' ww-plaque__glory-delta--loss' : ''}`}>{change.value > 0 ? `+${change.value}` : `−${-change.value}`}</span>}
    </span>
  );
}

function SeatTag({ player, online, local, lastFlame }: { player: PlayerState; online: OnlineSeatInfo | undefined; local: boolean; lastFlame: boolean }): ReactElement | null {
  if (online) {
    return (
      <span className={`ww-plaque__tag ww-plaque__tag--${online.role}`} title={online.detail} data-testid={`seat-tag-${player.seat}`}>
        {online.tag}
      </span>
    );
  }
  if (player.kind !== 'human') return <span className="ww-plaque__tag">{lastFlame ? 'Bot' : 'AI ally'}</span>;
  return local ? null : <span className="ww-plaque__tag">Remote</span>;
}

/** The status words: whose turn, or (Last Flame) out of the Trial / haunting. */
function statusWords(player: PlayerState, status: ReturnType<typeof plaqueState>): string {
  if (player.eliminated) {
    if (player.haunt.pending) return 'Haunting…';
    return player.eliminationBand !== null ? `Out · ${ordinal(player.eliminationBand)} to fall` : 'Out';
  }
  if (player.haunt.pending) return 'Haunting…';
  return PLAQUE_LABEL[status];
}

interface PlaqueProps {
  player: PlayerState;
  state: GameState;
  thinking: boolean;
  claimable: boolean;
  local: boolean;
  online: OnlineSeatInfo | undefined;
}

function Plaque({ player, state, thinking, claimable, local, online }: PlaqueProps): ReactElement {
  const registry = useRegistry();
  const controller = useController();
  const hero = state.pieces[player.heroPieceId];
  const house = HOUSES[player.house];
  const status = plaqueState(state, player.seat, thinking ? player.seat : null);
  const isBot = player.kind !== 'human';
  const lastFlame = state.config.mode === 'last_flame';
  const heroDef = registry.heroes.byId[player.hero];
  const wanted = lastFlame && state.lastFlame?.leader === player.seat && !player.eliminated;
  const claimLabel = isBot ? 'Let them act' : 'Take My Turn';
  const style = { '--ww-house': house.color } as CSSProperties;
  const words = statusWords(player, status);
  const classes = ['ww-plaque', `ww-plaque--${status}`, player.eliminated && 'ww-plaque--out', online?.role === 'reconnecting' && 'ww-plaque--reconnecting'].filter(Boolean).join(' ');
  return (
    <li className={classes} style={style} aria-label={`${player.name}, ${heroDef?.name ?? player.hero}`} data-testid={`plaque-${player.seat}`}>
      <div className="ww-plaque__portrait">
        <PieceArt
          defId={hero?.smoldering ? 'smoldering_wick' : player.hero}
          kind={hero?.smoldering ? 'wick' : 'hero'}
          houseColor={house.color}
          size={44}
          showStats={false}
          showPips={false}
          animated={status === 'acting'}
          mood={player.eliminated ? 'sleepy' : undefined}
          seed={`plaque${player.seat}`}
        />
        <span className="ww-plaque__house">
          <HouseGlyph house={player.house} disc size={18} />
        </span>
        {thinking && <span className="ww-plaque__wisp" aria-label="Thinking" />}
        {wanted && (
          <span className="ww-plaque__wanted" data-testid={`wanted-${player.seat}`}>
            <WantedSeal size={22} title="Wanted: the sole Glory leader (Bounty +3)" />
          </span>
        )}
      </div>
      <div className="ww-plaque__body">
        <div className="ww-plaque__name">
          <span className="ww-plaque__player">{player.name}</span>
          <span className="ww-plaque__hero">{heroDef?.name ?? player.hero}</span>
        </div>
        {hero && !player.eliminated && <HpBar hp={hero.hp} max={hero.maxHp} />}
        <div className="ww-plaque__row">
          {!player.eliminated && <FlameRow player={player} state={state} />}
          {lastFlame && <GloryCount player={player} />}
          {lastFlame && state.firstLight === player.seat && !player.eliminated && (
            <span className="ww-plaque__first-light" data-testid={`first-light-${player.seat}`}>
              <FirstLightToken size={16} title="First Light: acts first this round" />
            </span>
          )}
        </div>
        <div className="ww-plaque__state">
          <SeatTag player={player} online={online} local={local} lastFlame={lastFlame} />
          {words && <span className="ww-plaque__status">{words}</span>}
        </div>
        {claimable && (
          <button type="button" className={`ww-plaque__claim${isBot ? ' ww-plaque__claim--ally' : ''}`} onClick={() => controller.claim(player.seat)}>
            {claimLabel}
          </button>
        )}
      </div>
    </li>
  );
}

/** Per-seat online info (empty offline); reconnecting countdowns tick once a second. */
function useOnlineSeatInfo(): Map<number, OnlineSeatInfo> {
  const session = useOnlineSession();
  const state = useOnlineState();
  const reconnecting = state?.room?.seats.some((s) => s.status === 'reconnecting') ?? false;
  const serverNow = useCallback(() => session?.serverNow() ?? Date.now(), [session]);
  const now = useTicker(reconnecting, serverNow, 1000);
  return state ? onlineSeats(state, now) : new Map();
}

export function PlayerRail(): ReactElement {
  const snap = useGameSelector((s) => ({ state: s.state, latest: s.latest, animating: s.animating, thinkingSeat: s.thinkingSeat, controlledSeats: s.controlledSeats }));
  const online = useOnlineSeatInfo();
  const { state, latest } = snap;
  return (
    <aside className="ww-rail ww-rail--left" aria-label="Players">
      <ol className="ww-plaques">
        {state.players.map((player) => {
          const local = player.kind !== 'human' || snap.controlledSeats.includes(player.seat);
          const claimable = !snap.animating && canClaim(latest, player.seat, local);
          return <Plaque key={player.seat} player={player} state={state} thinking={snap.thinkingSeat === player.seat} claimable={claimable} local={local} online={online.get(player.seat)} />;
        })}
      </ol>
      <PieceCard />
    </aside>
  );
}

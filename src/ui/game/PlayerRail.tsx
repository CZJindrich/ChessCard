/**
 * The left rail (GDD §15.4, §11.3): one plaque per seat with the hero portrait, an HP wax
 * bar, Flame, the House glyph and the seat's turn state. In Vigil co-op a human plaque offers
 * "Take My Turn" and an AI ally's offers "Let them act"; Last Flame adds Glory, First Light
 * and the Wanted seal.
 */
import type { CSSProperties, ReactElement } from 'react';
import { FirstLightToken, FlameIcon, GloryIcon, HOUSES, HouseGlyph, PieceArt, WantedSeal } from '../../art';
import type { GameState, PlayerState } from '../../engine/types';
import { useController, useGameSnapshot, useRegistry } from './context';
import { canClaim, PLAQUE_LABEL, plaqueState } from './model';
import { PieceCard } from './PieceCard';

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

interface PlaqueProps {
  player: PlayerState;
  state: GameState;
  thinking: boolean;
  claimable: boolean;
  local: boolean;
}

function Plaque({ player, state, thinking, claimable, local }: PlaqueProps): ReactElement {
  const registry = useRegistry();
  const controller = useController();
  const hero = state.pieces[player.heroPieceId];
  const house = HOUSES[player.house];
  const status = plaqueState(state, player.seat, thinking ? player.seat : null);
  const isBot = player.kind !== 'human';
  const lastFlame = state.config.mode === 'last_flame';
  const heroDef = registry.heroes.byId[player.hero];
  const wanted = lastFlame && state.lastFlame?.leader === player.seat;
  const claimLabel = isBot ? 'Let them act' : 'Take My Turn';
  const style = { '--ww-house': house.color } as CSSProperties;
  return (
    <li className={`ww-plaque ww-plaque--${status}${player.eliminated ? ' ww-plaque--out' : ''}`} style={style} aria-label={`${player.name}, ${heroDef?.name ?? player.hero}`}>
      <div className="ww-plaque__portrait">
        <PieceArt
          defId={hero?.smoldering ? 'smoldering_wick' : player.hero}
          kind={hero?.smoldering ? 'wick' : 'hero'}
          houseColor={house.color}
          size={44}
          showStats={false}
          showPips={false}
          animated={status === 'acting'}
          seed={`plaque${player.seat}`}
        />
        <span className="ww-plaque__house">
          <HouseGlyph house={player.house} disc size={18} />
        </span>
        {thinking && <span className="ww-plaque__wisp" aria-label="Thinking" />}
      </div>
      <div className="ww-plaque__body">
        <div className="ww-plaque__name">
          <span className="ww-plaque__player">{player.name}</span>
          <span className="ww-plaque__hero">{heroDef?.name ?? player.hero}</span>
        </div>
        {hero && <HpBar hp={hero.hp} max={hero.maxHp} />}
        <div className="ww-plaque__row">
          <FlameRow player={player} state={state} />
          {lastFlame && (
            <span className="ww-plaque__glory ww-num">
              <GloryIcon size={16} /> {player.glory}
            </span>
          )}
          {lastFlame && state.firstLight === player.seat && <FirstLightToken size={16} title="First Light" />}
          {wanted && <WantedSeal size={18} title="Wanted: the Glory leader" />}
        </div>
        <div className="ww-plaque__state">
          {isBot ? <span className="ww-plaque__tag">{lastFlame ? 'Bot' : 'AI ally'}</span> : local ? null : <span className="ww-plaque__tag">Remote</span>}
          {PLAQUE_LABEL[status] && <span className="ww-plaque__status">{PLAQUE_LABEL[status]}</span>}
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

export function PlayerRail(): ReactElement {
  const snap = useGameSnapshot();
  const { state, latest } = snap;
  return (
    <aside className="ww-rail ww-rail--left" aria-label="Players">
      <ol className="ww-plaques">
        {state.players.map((player) => {
          const local = player.kind !== 'human' || snap.controlledSeats.includes(player.seat);
          const claimable = !snap.animating && canClaim(latest, player.seat, local);
          return <Plaque key={player.seat} player={player} state={state} thinking={snap.thinkingSeat === player.seat} claimable={claimable} local={local} />;
        })}
      </ol>
      <PieceCard />
    </aside>
  );
}

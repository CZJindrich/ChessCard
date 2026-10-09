/**
 * Placeholder for the game route until the game screen lands (src/ui/game is owned by the
 * game-screen engineer). It shows exactly what the route hands over: a resolved GameConfig
 * with a concrete seed, the selection that produced it, and the demo flag.
 */
import type { ReactElement } from 'react';
import { HOUSE_ORDER, HouseGlyph, PieceArt, HOUSES, SkyBackdrop } from '../../art';
import type { GameRoute } from '../app/navigation';
import { useContentState, usePresentation, useServices } from '../app/services';
import { Button } from '../components/Button';
import { Panel } from '../components/Panel';

export function GameScreenPlaceholder({ route }: { route: GameRoute }): ReactElement {
  const { nav } = useServices();
  const { registry } = useContentState();
  const presentation = usePresentation();
  const { config } = route;
  const mode = config.mode === 'vigil' ? 'Vigil' : 'Last Flame';
  return (
    <div className="ww-screen" data-testid="game-placeholder">
      <SkyBackdrop reducedMotion={presentation.reduced_motion} className="ww-screen__sky" />
      <div className="ww-screen__veil" aria-hidden="true" />
      <main className="ww-screen__body ww-placeholder">
        <Panel title={route.demo ? 'Demo' : config.tutorial ? 'Night 1 · First Vigil' : `${mode} · ${config.nights} Nights`} drips="tallow">
          <p className="ww-flavor">The board is still being carved. This game would begin with:</p>
          <ul className="ww-placeholder__seats">
            {config.seats.map((seat, i) => {
              const houseId = HOUSE_ORDER[i] ?? HOUSE_ORDER[0];
              return (
                <li key={i}>
                  <HouseGlyph house={houseId} disc size={30} />
                  {seat.hero && <PieceArt defId={seat.hero} kind="hero" houseColor={HOUSES[houseId].color} size={40} showStats={false} showPips={false} animated={false} />}
                  <span>
                    {seat.name} · {seat.hero ? (registry.heroes.byId[seat.hero]?.displayName ?? seat.hero) : 'random hero'}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="ww-dim ww-placeholder__meta">
            {registry.lengths.byId[config.length]?.name ?? config.length} · {registry.difficulty.byId[config.difficulty]?.name ?? config.difficulty} ·{' '}
            {config.boss_choice === 'random' ? 'random boss' : (registry.bosses.byId[config.boss_choice]?.name ?? config.boss_choice)} · seed{' '}
            <span className="ww-num">{config.seed}</span>
          </p>
          <div className="ww-placeholder__actions">
            <Button variant="primary" sound="back" onClick={() => nav.reset()}>
              Main Menu
            </Button>
            <Button variant="ghost" sound="back" onClick={() => nav.back()}>
              Back
            </Button>
          </div>
        </Panel>
      </main>
    </div>
  );
}

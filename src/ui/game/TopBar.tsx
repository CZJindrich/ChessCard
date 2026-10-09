/**
 * The top bar (GDD §15.4): Night and Round, the three-beat phase ribbon, the boss HP bar on
 * the Boss Night, the Moth Die face label, the active Toll, the Silencing Peal bell, the Hour
 * Candle (Vigil Dread) or the Gloam Bell (Last Flame), and the game menu.
 */
import { useState, type ReactElement } from 'react';
import { BossHpBar, GloamBellIcon, HourCandle, MothDieFaceIcon, MOTH_DIE_LABELS, PealBellIcon, mothDieFace } from '../../art';
import { dreadThresholdValues } from '../../engine';
import type { GameState } from '../../engine/types';
import { useServices } from '../app/services';
import { Tooltip } from '../components/Tooltip';
import { UiIcon } from '../components/icons';
import { useGameSnapshot, useRegistry } from './context';
import { BEATS, beatIndex, nightLabel, roundLabel, siteName } from './model';
import { GameMenu } from './GameMenu';

function PhaseRibbon({ state }: { state: GameState }): ReactElement {
  const lit = beatIndex(state.phase);
  return (
    <ol className="ww-ribbon" aria-label="Round beats">
      {BEATS.map((beat, i) => (
        <li key={beat} className={['ww-ribbon__beat', i === lit && 'ww-ribbon__beat--lit', i < lit && 'ww-ribbon__beat--done'].filter(Boolean).join(' ')} aria-current={i === lit ? 'step' : undefined}>
          <span className="ww-ribbon__mark" aria-hidden="true" />
          {beat}
        </li>
      ))}
    </ol>
  );
}

function DreadMeter({ state }: { state: GameState }): ReactElement | null {
  const registry = useRegistry();
  const vigil = state.vigil;
  if (!vigil) return null;
  const thresholds = dreadThresholdValues(vigil.dreadMax, registry);
  const pips = Array.from({ length: vigil.dreadMax }, (_, i) => i + 1);
  return (
    <Tooltip content={`Dread ${vigil.dread} of ${vigil.dreadMax}. Candle hits and fallen heroes add Dread; when it is full the Long Night falls.`}>
      <div className="ww-dread" role="meter" aria-label="Dread" aria-valuemin={0} aria-valuemax={vigil.dreadMax} aria-valuenow={vigil.dread}>
        <HourCandle value={vigil.dread} max={vigil.dreadMax} size={13} showValue={false} />
        <div className="ww-dread__track">
          {pips.map((n) => (
            <span
              key={n}
              className={['ww-dread__pip', n <= vigil.dread && 'ww-dread__pip--on', (n === thresholds.dimming || n === thresholds.deep_dark) && 'ww-dread__pip--mark'].filter(Boolean).join(' ')}
            />
          ))}
        </div>
        <span className="ww-dread__value ww-num">
          {vigil.dread}
          <small>/{vigil.dreadMax}</small>
        </span>
      </div>
    </Tooltip>
  );
}

function GloamBell({ state }: { state: GameState }): ReactElement | null {
  const lf = state.lastFlame;
  if (!lf) return null;
  const next = lf.gloam.schedule[lf.gloam.closingsDone];
  const rounds = next ? Math.max(0, (next.night - state.night) * state.config.turns_per_night + next.round - state.round) : undefined;
  return (
    <Tooltip content={next ? `The Gloam closes in ${rounds} round${rounds === 1 ? '' : 's'}.` : 'The Gloam has closed.'}>
      <span className="ww-topbar__chip">
        <GloamBellIcon rounds={rounds} size={26} />
      </span>
    </Tooltip>
  );
}

function OmenSlot({ state }: { state: GameState }): ReactElement | null {
  const registry = useRegistry();
  if (!state.config.moth_die || state.omen.face === null) return null;
  const omen = state.omen.omenId ? registry.omens.byId[state.omen.omenId] : undefined;
  const face = omen?.id ?? mothDieFace(state.omen.face);
  const label = omen?.label ?? MOTH_DIE_LABELS[mothDieFace(state.omen.face)];
  return (
    <Tooltip content={omen ? `Moth Die: ${omen.name}. ${omen.text}` : label}>
      <span className={`ww-topbar__chip ww-omen ww-omen--${omen?.tone ?? 'neutral'}`}>
        <MothDieFaceIcon face={face} size={24} />
        <span className="ww-omen__label">{label}</span>
      </span>
    </Tooltip>
  );
}

function TollSlot({ state }: { state: GameState }): ReactElement | null {
  const registry = useRegistry();
  const toll = state.toll.active ? registry.tolls.byId[state.toll.active] : undefined;
  if (!toll) return null;
  return (
    <Tooltip content={`${toll.kind === 'curse' ? 'Curse' : 'Blessing'} for this Night: ${toll.text}`}>
      <span className={`ww-topbar__chip ww-toll-chip ww-toll-chip--${toll.kind}`}>
        <span className="ww-toll-chip__kind" aria-hidden="true">
          {toll.kind === 'curse' ? '✠' : '✦'}
        </span>
        {toll.name}
      </span>
    </Tooltip>
  );
}

function PealSlot({ state }: { state: GameState }): ReactElement | null {
  const active = state.activeRules.some((r) => r.rule === 'card_limit' && r.source.kind === 'boss');
  if (!active) return null;
  return (
    <Tooltip content="Silencing Peal: each player may play only 1 card this turn.">
      <span className="ww-topbar__chip ww-peal">
        <PealBellIcon size={24} />
      </span>
    </Tooltip>
  );
}

function BossBar({ state }: { state: GameState }): ReactElement | null {
  const registry = useRegistry();
  const boss = state.boss;
  const piece = boss ? state.pieces[boss.pieceId] : undefined;
  if (!boss || !piece) return null;
  return (
    <div className="ww-topbar__boss">
      <span className="ww-topbar__boss-name">
        {registry.bosses.byId[boss.id]?.name ?? boss.id}
        <span className="ww-topbar__boss-phase ww-num">Phase {boss.phase}</span>
      </span>
      <BossHpBar bossId={boss.id} hp={piece.hp} maxHp={boss.maxHp} crowns={boss.crowns} width={240} />
    </div>
  );
}

export function TopBar(): ReactElement {
  const { state } = useGameSnapshot();
  const registry = useRegistry();
  const services = useServices();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="ww-topbar">
      <div className="ww-topbar__when">
        <span className="ww-topbar__night">{nightLabel(state)}</span>
        <span className="ww-topbar__round ww-num">{roundLabel(state)}</span>
        <span className="ww-topbar__site">{siteName(state, registry)}</span>
      </div>
      <PhaseRibbon state={state} />
      <div className="ww-topbar__middle">
        <BossBar state={state} />
      </div>
      <div className="ww-topbar__status">
        <OmenSlot state={state} />
        <TollSlot state={state} />
        <PealSlot state={state} />
        {state.config.mode === 'vigil' ? <DreadMeter state={state} /> : <GloamBell state={state} />}
      </div>
      <div className="ww-topbar__menu">
        <button
          type="button"
          className="ww-topbar__menu-btn"
          aria-label="Game menu"
          aria-expanded={menuOpen}
          onClick={() => {
            services.audio.play('uiClick');
            setMenuOpen((open) => !open);
          }}
        >
          <UiIcon name="gear" />
        </button>
        {menuOpen && <GameMenu onClose={() => setMenuOpen(false)} />}
      </div>
    </header>
  );
}

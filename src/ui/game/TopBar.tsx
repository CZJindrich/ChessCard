/**
 * The top bar (GDD §15.4): Night and Round, the three-beat phase ribbon, the boss HP bar on
 * the Boss Night, the Moth Die face label, the active Toll, the Silencing Peal bell, the Hour
 * Candle (Vigil Dread) or the Gloam Bell (Last Flame), and the game menu.
 */
import type { ReactElement } from 'react';
import { BossHpBar, GloamBellIcon, HourCandle, MothDie, MothDieFaceIcon, MOTH_DIE_LABELS, PealBellIcon, mothDieFace } from '../../art';
import { dreadThresholdValues } from '../../engine';
import type { GameState } from '../../engine/types';
import { usePresentation, useServices } from '../app/services';
import { Tooltip } from '../components/Tooltip';
import { UiIcon } from '../components/icons';
import { useGameSnapshot, useRegistry } from './context';
import { BEATS, beatIndex, nightLabel, roundLabel, siteName } from './model';
import { useGameUi } from './uiStore';
import { useCueMoment } from './useCue';

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
  const presentation = usePresentation();
  // Dread +1 (§16.9): the Hour Candle gutters while the vignette pulses.
  const gutter = useCueMoment((e) => (e.type === 'dread_changed' && e.to > e.from ? e.to : null), 600);
  const vigil = state.vigil;
  if (!vigil) return null;
  const thresholds = dreadThresholdValues(vigil.dreadMax, registry);
  const pips = Array.from({ length: vigil.dreadMax }, (_, i) => i + 1);
  return (
    <Tooltip content={`Dread ${vigil.dread} of ${vigil.dreadMax}. Candle hits and fallen heroes add Dread; when it is full the Long Night falls.`}>
      <div
        key={gutter ? `g${gutter.id}` : 'still'}
        className={`ww-dread${gutter ? ' ww-dread--gutter' : ''}`}
        role="meter"
        aria-label="Dread"
        aria-valuemin={0}
        aria-valuemax={vigil.dreadMax}
        aria-valuenow={vigil.dread}
      >
        <HourCandle value={vigil.dread} max={vigil.dreadMax} size={13} showValue={false} guttering={gutter !== null} animated={!presentation.reduced_motion} />
        <div className="ww-dread__track">
          {pips.map((n) => (
            <span
              key={n}
              className={[
                'ww-dread__pip',
                n <= vigil.dread && 'ww-dread__pip--on',
                gutter && n === gutter.value && 'ww-dread__pip--new',
                (n === thresholds.dimming || n === thresholds.deep_dark) && 'ww-dread__pip--mark',
              ]
                .filter(Boolean)
                .join(' ')}
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

/** The Moth Die (§13.5, §16.9): it tumbles in the top bar when rolled, then shows its face's effect. */
function OmenSlot({ state }: { state: GameState }): ReactElement | null {
  const registry = useRegistry();
  const presentation = usePresentation();
  const roll = useCueMoment((e) => (e.type === 'omen_rolled' ? e.face : null), 1000);
  if (!state.config.moth_die || state.omen.face === null) return null;
  const omen = state.omen.omenId ? registry.omens.byId[state.omen.omenId] : undefined;
  const face = omen?.id ?? mothDieFace(state.omen.face);
  const label = omen?.label ?? MOTH_DIE_LABELS[mothDieFace(state.omen.face)];
  const rolling = roll !== null && !presentation.reduced_motion;
  return (
    <Tooltip content={omen ? `Moth Die: ${omen.name}. ${omen.text}` : label}>
      <span className={`ww-topbar__chip ww-omen ww-omen--${omen?.tone ?? 'neutral'}${rolling ? ' ww-omen--rolling' : ''}`} data-testid="omen">
        {rolling ? <MothDie key={roll.id} face={mothDieFace(roll.value)} rollId={roll.id} size={20} className="ww-omen__die" /> : <MothDieFaceIcon face={face} size={24} />}
        <span key={rolling ? `l${roll.id}` : 'label'} className="ww-omen__label">
          {label}
        </span>
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

/** Silencing Peal (§10.5): the bell shows while it is locked (it tolls next turn) and while it limits cards. */
function PealSlot({ state }: { state: GameState }): ReactElement | null {
  const active = state.activeRules.some((r) => r.rule === 'card_limit' && r.source.kind === 'boss');
  const pending = !active && state.intents.some((i) => i.bossIntentId === 'silencing_peal');
  if (!active && !pending) return null;
  const text = active ? 'Silencing Peal: each player may play only 1 card this turn.' : 'Silencing Peal is locked: next turn each player may play only 1 card.';
  return (
    <Tooltip content={text}>
      <span className={`ww-topbar__chip ww-peal${active ? ' ww-peal--active' : ' ww-peal--pending'}`} data-testid="peal" aria-label={text}>
        <PealBellIcon size={24} />
        <span className="ww-peal__label">{active ? '1 card' : 'Next turn'}</span>
      </span>
    </Tooltip>
  );
}

function BossBar({ state }: { state: GameState }): ReactElement | null {
  const registry = useRegistry();
  const boss = state.boss;
  const bossPieceId = boss?.pieceId;
  const hit = useCueMoment((e) => (e.type === 'damage' && e.pieceId === bossPieceId && !e.blockedByWard ? e.amount : null), 420);
  const piece = boss ? state.pieces[boss.pieceId] : undefined;
  if (!boss || !piece) return null;
  return (
    <div key={hit ? `hit${hit.id}` : 'boss'} className={`ww-topbar__boss${hit ? ' ww-topbar__boss--hit' : ''}`} data-testid="boss-bar">
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
  const ui = useGameUi();
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
          onClick={() => {
            services.audio.play('uiClick');
            ui.toggle('pause');
          }}
        >
          <UiIcon name="gear" />
        </button>
      </div>
    </header>
  );
}

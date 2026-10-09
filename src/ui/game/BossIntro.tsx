/**
 * The boss intro (GDD §15.1.9): 4 seconds, skippable. The screen dims and a bell tolls, the
 * boss silhouette rises from smoke, its name in Cinzel Decorative and epithet in Cinzel, its
 * phase-1 intents as small pattern diagrams, then its special rule and a "Weakness:" line.
 * Playback holds while it shows, so the first round starts when it closes.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { BossIntroBackdrop, PALETTE, PealBellIcon } from '../../art';
import type { BossIntentDef, GameState } from '../../engine/types';
import { usePresentation, useServices } from '../app/services';
import { intentDiagram } from './bossDiagram';
import { useController, useGameSnapshot, useRegistry } from './context';
import { bossIntro } from './titles';

export const BOSS_INTRO_MS = 4000;
const CELL = 15;

function IntentPattern({ def }: { def: BossIntentDef }): ReactElement {
  const d = intentDiagram(def);
  const w = d.cols * CELL;
  const h = d.rows * CELL;
  const centre = (x: number, y: number): { x: number; y: number } => ({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
  const bossCentre = { x: (d.boss.x + 1) * CELL, y: (d.boss.y + 1) * CELL };
  return (
    <figure className="ww-boss-card__intent">
      <svg className="ww-art ww-boss-card__grid" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {Array.from({ length: d.rows }, (_, y) =>
          Array.from({ length: d.cols }, (_, x) => <rect key={`${x},${y}`} x={x * CELL + 0.5} y={y * CELL + 0.5} width={CELL - 1} height={CELL - 1} rx={2} fill={(x + y) % 2 ? '#2D2938' : '#24202D'} />),
        )}
        {d.global ? (
          <g transform={`translate(${w / 2 + 14} ${h / 2 - 16})`}>
            <PealBellIcon size={32} />
          </g>
        ) : (
          d.hits.map((c) => (
            <g key={`h${c.x},${c.y}`} transform={`translate(${c.x * CELL} ${c.y * CELL})`}>
              <rect x={1} y={1} width={CELL - 2} height={CELL - 2} rx={2} fill={PALETTE.bloodWax} fillOpacity={0.42} stroke={PALETTE.bloodWax} strokeWidth={1} />
              <path d={`M4,4L${CELL - 4},${CELL - 4}M${CELL - 4},4L4,${CELL - 4}`} stroke="#FFD5D0" strokeWidth={1.4} strokeLinecap="round" />
            </g>
          ))
        )}
        {d.arrows.map((a) => {
          const c = centre(a.x, a.y);
          return <path key={`a${a.x},${a.y}`} d={`M${c.x},${c.y}l${a.dx * 7},${a.dy * 7}`} stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" markerEnd="url(#ww-boss-intro-arrow)" />;
        })}
        {d.aim && <path d={`M${bossCentre.x},${bossCentre.y}L${centre(d.aim.x, d.aim.y).x},${centre(d.aim.x, d.aim.y).y}`} stroke={PALETTE.snuffRim} strokeWidth={1.4} strokeDasharray="3 3" fill="none" />}
        <rect x={d.boss.x * CELL + 1} y={d.boss.y * CELL + 1} width={CELL * 2 - 2} height={CELL * 2 - 2} rx={5} fill={PALETTE.snuffBodyBottom} stroke={PALETTE.snuffRim} strokeWidth={1.4} />
        <circle cx={bossCentre.x - 4} cy={bossCentre.y - 2} r={1.8} fill={PALETTE.snuffEye} />
        <circle cx={bossCentre.x + 4} cy={bossCentre.y - 2} r={1.8} fill={PALETTE.snuffEye} />
        <defs>
          <marker id="ww-boss-intro-arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0L6,3L0,6Z" fill="#FFFFFF" />
          </marker>
        </defs>
      </svg>
      <figcaption>
        <span className="ww-boss-card__intent-name">{def.name}</span>
        {def.damage > 0 && <span className="ww-boss-card__intent-dmg ww-num">{def.damage}</span>}
        <span className="ww-boss-card__intent-text">{def.text}</span>
      </figcaption>
    </figure>
  );
}

/** A key per Boss Night visit, so a Retry plays the intro again. */
function visitKey(s: GameState): string {
  return `${s.night}:${s.vigil?.retries ?? 0}`;
}

export function BossIntro(): ReactElement | null {
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const controller = useController();
  const services = useServices();
  const presentation = usePresentation();
  // Opened by the boss_intro beat's cue (it holds playback at once, even at instant speed), or
  // by a state that is already in the boss intro (a loaded game).
  const [open, setOpen] = useState<string | null>(() => (snap.latest.phase === 'boss_intro' ? visitKey(snap.latest) : null));
  const [dismissed, setDismissed] = useState<string | null>(null);
  const { latest } = snap;
  const def = latest.boss ? registry.bosses.byId[latest.boss.id] : undefined;
  const visible = open !== null && open !== dismissed && def !== undefined && latest.result === null;
  const skip = useRef<() => void>(() => undefined);
  skip.current = () => setDismissed(open);

  // A state that arrives already in the boss intro (a loaded game) opens it too.
  const arrivedKey = latest.phase === 'boss_intro' ? visitKey(latest) : null;
  useEffect(() => {
    if (arrivedKey !== null) setOpen((current) => current ?? arrivedKey);
  }, [arrivedKey]);

  useEffect(
    () =>
      controller.onCue((step) => {
        if (step.event.type !== 'phase_changed' || step.event.phase !== 'boss_intro') return;
        controller.hold('boss_intro');
        setOpen(visitKey(controller.getSnapshot().latest));
      }),
    [controller],
  );

  useEffect(() => {
    if (!visible) {
      controller.release('boss_intro');
      return undefined;
    }
    controller.hold('boss_intro');
    services.audio.play('bossAppear');
    const timer = window.setTimeout(() => skip.current(), BOSS_INTRO_MS);
    const onKey = (event: KeyboardEvent): void => {
      if (![' ', 'Enter', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      skip.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
      controller.release('boss_intro');
    };
  }, [visible, controller, services]);

  if (!visible || !def) return null;
  const intro = bossIntro(def, registry);
  return (
    <div className="ww-boss-intro-layer" role="dialog" aria-label={`${intro.name}, ${intro.epithet}`} data-testid="boss-intro" onClick={() => skip.current()} style={{ '--ww-intro-ms': `${BOSS_INTRO_MS}ms` } as CSSProperties}>
      <BossIntroBackdrop bossId={def.id} reducedMotion={presentation.reduced_motion} className="ww-boss-intro-layer__scene" />
      <div className={`ww-boss-card${presentation.reduced_motion ? ' ww-boss-card--still' : ''}`}>
        <span className="ww-boss-card__eyebrow">The Boss Night</span>
        <h2 className="ww-boss-card__name">{intro.name}</h2>
        <span className="ww-boss-card__epithet">{intro.epithet}</span>
        <div className="ww-boss-card__intents">
          {intro.intents.map((intent) => (
            <IntentPattern key={intent.id} def={intent} />
          ))}
        </div>
        <p className="ww-boss-card__special">{intro.special}</p>
        <p className="ww-boss-card__weakness">
          <strong>Weakness:</strong> {intro.weakness}
        </p>
        <span className="ww-boss-card__skip">Click or press Space to begin</span>
        <span className="ww-boss-card__timer" aria-hidden="true" />
      </div>
    </div>
  );
}

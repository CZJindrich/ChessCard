/**
 * Board-centre announcements driven by playback cues: the Night title card, the Snuff beats,
 * whose turn it is, the Moth Die tumbling to its face, the boss rising and its phases, CHECK,
 * Dawn, and the chosen Toll. P3b layers flashes and shockwaves on top; these carry the words.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { MothDie, mothDieFace } from '../../art';
import type { ContentRegistry, GameEvent, GameState } from '../../engine/types';
import type { PlaybackStep } from '../../game';
import { usePresentation } from '../app/services';
import { useController, useGameSnapshot, useRegistry } from './context';
import { siteName } from './model';

type BannerKind = 'night' | 'beat' | 'turn' | 'die' | 'boss' | 'phase' | 'dawn' | 'toll' | 'alarm';

interface Banner {
  id: number;
  kind: BannerKind;
  title: string;
  subtitle?: string;
  face?: number;
  duration: number;
}

function bannerFor(e: GameEvent, after: GameState, uiSeat: number | null, reg: ContentRegistry): Omit<Banner, 'id' | 'duration'> | null {
  switch (e.type) {
    case 'night_started':
      return { kind: 'night', title: e.isBossNight ? `Boss Night · Night ${e.night}` : `Night ${e.night}`, subtitle: siteName({ ...after, siteId: e.siteId }, reg) };
    case 'phase_changed':
      if (e.phase === 'snuff_move') return { kind: 'beat', title: 'Snuff Move', subtitle: 'The smoke stirs' };
      if (e.phase === 'snuff_strike') return { kind: 'beat', title: 'Snuff Strike', subtitle: 'The red tiles are hit' };
      return null;
    case 'turn_started': {
      const player = after.players[e.seat];
      if (!player) return null;
      const yours = uiSeat === e.seat || (player.kind === 'human' && after.players.filter((p) => p.kind === 'human').length === 1);
      return { kind: 'turn', title: yours ? 'Your turn' : `${player.name}'s turn`, subtitle: `${e.flame} Flame` };
    }
    case 'omen_rolled': {
      const omen = reg.omens.byId[e.effectiveId];
      return { kind: 'die', title: omen?.label ?? 'The Moth Die', subtitle: omen ? `Moth Die · ${omen.name}` : undefined, face: e.face };
    }
    case 'boss_spawned': {
      const boss = reg.bosses.byId[e.bossId];
      return { kind: 'boss', title: boss?.name ?? 'The boss rises', subtitle: boss?.epithet };
    }
    case 'boss_phase':
      return { kind: 'phase', title: `Phase ${e.phase}`, subtitle: reg.bosses.byId[e.bossId]?.phases[e.phase - 1]?.banner ?? undefined };
    case 'check':
      return { kind: 'alarm', title: 'CHECK!', subtitle: `Escapes: ${e.escapes}` };
    case 'checkmate':
      return { kind: 'alarm', title: 'CHECKMATE', subtitle: `−${e.damage}` };
    case 'dawn':
      return { kind: 'dawn', title: 'Dawn breaks', subtitle: `${e.candlesLit} Candle${e.candlesLit === 1 ? '' : 's'} still lit` };
    case 'toll_chosen': {
      const toll = reg.tolls.byId[e.tollId];
      return toll ? { kind: 'toll', title: toll.name, subtitle: toll.kind === 'curse' ? 'A Curse for the Night' : 'A Blessing for the Night' } : null;
    }
    case 'dread_changed':
      return e.threshold === 'deep_dark' ? { kind: 'alarm', title: 'The dark deepens', subtitle: `Dread ${e.to}` } : null;
    default:
      return null;
  }
}

const MIN_SHOW_MS = 700;
/** The title card when a game opens (GDD §15.1: "a 2-second title card plays"). */
const OPENING_MS = 2200;

export function Banners(): ReactElement | null {
  const controller = useController();
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const presentation = usePresentation();
  const [banner, setBanner] = useState<Banner | null>(null);
  const uiSeatRef = useRef(snap.uiSeat);
  const latestRef = useRef(snap.latest);
  uiSeatRef.current = snap.uiSeat;
  latestRef.current = snap.latest;

  useEffect(() => {
    const s = latestRef.current;
    if (s.phase !== 'night_setup' || s.round !== 0) return;
    const title = s.isBossNight ? `Boss Night · Night ${s.night}` : `Night ${s.night}`;
    setBanner({ id: 0, kind: 'night', title, subtitle: siteName(s, registry), duration: OPENING_MS });
    const timer = window.setTimeout(() => setBanner((b) => (b?.id === 0 ? null : b)), OPENING_MS);
    return () => window.clearTimeout(timer);
  }, [registry]);

  useEffect(() => {
    let timer: number | null = null;
    let nextId = 1;
    const off = controller.onCue((step: PlaybackStep) => {
      if (step.duration <= 0) return;
      const draft = bannerFor(step.event, latestRef.current, uiSeatRef.current, registry);
      if (!draft) return;
      const duration = Math.max(MIN_SHOW_MS, step.duration + (draft.kind === 'night' || draft.kind === 'boss' ? 400 : 120));
      if (timer !== null) window.clearTimeout(timer);
      setBanner({ ...draft, id: nextId++, duration });
      timer = window.setTimeout(() => setBanner(null), duration);
    });
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [controller, registry]);

  if (!banner) return null;
  return (
    <div key={banner.id} className={`ww-banner ww-banner--${banner.kind}`} style={{ '--ww-banner-dur': `${banner.duration}ms` } as CSSProperties} role="status" aria-live="polite">
      {banner.kind === 'die' && banner.face !== undefined && (
        <MothDie face={mothDieFace(banner.face)} rollId={banner.id} size={64} reducedMotion={presentation.reduced_motion} className="ww-banner__die" />
      )}
      <span className="ww-banner__title">{banner.title}</span>
      {banner.subtitle && <span className="ww-banner__subtitle">{banner.subtitle}</span>}
    </div>
  );
}

/**
 * Board-centre announcements driven by playback cues: the Snuff beats, whose turn it is, the
 * Moth Die's effect, the boss's phases and CHECKMATE (a Cinzel Decorative banner with a
 * shockwave; the flash and shake are FX), CHECK, Dawn and the chosen Toll. The Night title card,
 * the boss intro and the die itself are their own overlays.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { ContentRegistry, GameEvent, GameState } from '../../engine/types';
import type { PlaybackStep } from '../../game';
import { useController, useGameSnapshot, useRegistry } from './context';

type BannerKind = 'beat' | 'turn' | 'die' | 'phase' | 'dawn' | 'toll' | 'alarm' | 'checkmate' | 'gloam' | 'out';

interface Banner {
  id: number;
  kind: BannerKind;
  title: string;
  subtitle?: string;
  duration: number;
}

/** Phase-change and CHECKMATE banners hold for 1.5 s (§16.9). */
const BIG_BANNER_MS = 1500;

function bannerFor(e: GameEvent, after: GameState, uiSeat: number | null, reg: ContentRegistry): Omit<Banner, 'id' | 'duration'> | null {
  switch (e.type) {
    case 'phase_changed':
      if (e.phase === 'snuff_move') return { kind: 'beat', title: 'Snuff Move', subtitle: 'The smoke stirs' };
      if (e.phase === 'snuff_strike') return { kind: 'beat', title: 'Snuff Strike', subtitle: 'The red tiles are hit' };
      return null;
    case 'turn_started': {
      const player = after.players[e.seat];
      if (!player) return null;
      const yours = uiSeat === e.seat || (player.kind === 'human' && after.players.filter((p) => p.kind === 'human').length === 1);
      const truce = after.lastFlame?.truce ? ' · Truce: no fighting rivals' : '';
      return { kind: 'turn', title: yours ? 'Your turn' : `${player.name}'s turn`, subtitle: `${e.flame} Flame${truce}` };
    }
    case 'omen_rolled': {
      const omen = reg.omens.byId[e.effectiveId];
      return { kind: 'die', title: omen?.label ?? 'The Moth Die', subtitle: omen ? `Moth Die · ${omen.name}` : undefined };
    }
    case 'boss_phase': {
      const boss = reg.bosses.byId[e.bossId];
      return { kind: 'phase', title: `Phase ${e.phase}`, subtitle: boss?.phases[e.phase - 1]?.banner ?? boss?.name };
    }
    case 'check':
      return { kind: 'alarm', title: 'CHECK!', subtitle: `Escapes: ${e.escapes}` };
    case 'checkmate':
      return { kind: 'checkmate', title: 'CHECKMATE', subtitle: `The King is boxed in · −${e.damage} · crown ${e.crowns}/3` };
    case 'dawn':
      return { kind: 'dawn', title: 'Dawn breaks', subtitle: `${e.candlesLit} Candle${e.candlesLit === 1 ? '' : 's'} still lit` };
    case 'toll_chosen': {
      const toll = reg.tolls.byId[e.tollId];
      return toll ? { kind: 'toll', title: toll.name, subtitle: toll.kind === 'curse' ? 'A Curse for the Night' : 'A Blessing for the Night' } : null;
    }
    case 'dread_changed':
      return e.threshold === 'deep_dark' ? { kind: 'alarm', title: 'The dark deepens', subtitle: `Dread ${e.to}` } : null;
    case 'gloam_warning':
      return { kind: 'gloam', title: 'The Gloam stirs', subtitle: 'The violet ring closes at this round’s Tally' };
    case 'gloam_closed':
      return { kind: 'gloam', title: 'The Gloam closes', subtitle: `The open board is ${e.openSize}×${e.openSize}` };
    case 'player_eliminated': {
      const player = after.players[e.seat];
      if (!player) return null;
      const you = uiSeat === e.seat || (player.kind === 'human' && after.players.filter((p) => p.kind === 'human').length === 1);
      return { kind: 'out', title: you ? 'You are out of the Trial' : `${player.name} is out`, subtitle: after.config.haunting ? 'From the smoke, they may haunt the living' : `Elimination band ${e.band}` };
    }
    default:
      return null;
  }
}

const MIN_SHOW_MS = 700;

function showFor(kind: BannerKind, stepMs: number): number {
  if (kind === 'phase' || kind === 'checkmate' || kind === 'out') return Math.max(BIG_BANNER_MS, stepMs);
  if (kind === 'gloam') return Math.max(1300, stepMs + 200);
  if (kind === 'die') return Math.max(1500, stepMs + 300);
  return Math.max(MIN_SHOW_MS, stepMs + 120);
}

export function Banners(): ReactElement | null {
  const controller = useController();
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const [banner, setBanner] = useState<Banner | null>(null);
  const uiSeatRef = useRef(snap.uiSeat);
  const latestRef = useRef(snap.latest);
  uiSeatRef.current = snap.uiSeat;
  latestRef.current = snap.latest;

  useEffect(() => {
    let timer: number | null = null;
    let nextId = 1;
    const off = controller.onCue((step: PlaybackStep) => {
      if (step.duration <= 0) return;
      const draft = bannerFor(step.event, latestRef.current, uiSeatRef.current, registry);
      if (!draft) return;
      const duration = showFor(draft.kind, step.duration);
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
  const big = banner.kind === 'phase' || banner.kind === 'checkmate' || banner.kind === 'out';
  return (
    <div key={banner.id} className={`ww-banner ww-banner--${banner.kind}`} style={{ '--ww-banner-dur': `${banner.duration}ms` } as CSSProperties} role="status" aria-live="polite" data-testid="banner">
      {big && <span className="ww-banner__shockwave" aria-hidden="true" />}
      <span className="ww-banner__title">{banner.title}</span>
      {banner.subtitle && <span className="ww-banner__subtitle">{banner.subtitle}</span>}
    </div>
  );
}

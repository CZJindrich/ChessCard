/**
 * BossArt — the three bosses (§16.8) drawn in a 3×3-tile box over their 2×2 footprint.
 * See `bossArtPlacement()` for positioning against the board.
 */
import { useMemo, type ReactElement } from 'react';
import { PALETTE } from '../palette';
import { smoothClosedPath, wobbleOutline, ellipsePoints } from '../util/path';
import { seededRandom } from '../util/random';
import { cx, useSvgIds } from '../util/svg';
import { BossDefs, BossEye, BOSS_VIEWBOX, GroundShadow, type BossKit } from './common';
import { GutteredKingArt } from './GutteredKing';
import { HushHierophantArt } from './HushHierophant';
import { NocturnaArt } from './Nocturna';
import '../art.css';

export const BOSS_IDS = ['hush_hierophant', 'guttered_king', 'nocturna'] as const;

export const BOSS_NAMES: Readonly<Record<string, { name: string; epithet: string }>> = {
  hush_hierophant: { name: 'Hush Hierophant', epithet: 'The Bell That Swallows Song' },
  guttered_king: { name: 'The Guttered King', epithet: 'Monarch of Melted Wax' },
  nocturna: { name: 'Nocturna', epithet: 'Daughter of the Moth-Moon' },
};

export interface BossArtProps {
  bossId: string;
  /** 1–3; out-of-range values are clamped. */
  phase?: number;
  /** Guttered King: filled crown sockets (0–3). */
  crowns?: number;
  /** Nocturna: abdomen brightens while Hunger is active. */
  hungry?: boolean;
  /** Rendered width/height in px of the 3×3-tile art box (3 × tile size). */
  size?: number;
  animated?: boolean;
  /** Flat dark silhouette with a violet rim (boss intro). */
  silhouette?: boolean;
  seed?: string;
  className?: string;
  title?: string;
}

function clampPhase(phase: number | undefined): 1 | 2 | 3 {
  if (phase === undefined || phase <= 1) return 1;
  return phase >= 3 ? 3 : 2;
}

/** Fallback for unknown (modded) bosses: a looming smoke mass with ember eyes. */
function GenericBossArt({ kit }: { kit: BossKit }): ReactElement {
  const d = useMemo(
    () => smoothClosedPath(wobbleOutline(ellipsePoints(64, 44, 74, 70, 16, Math.PI / 2), seededRandom(`${kit.seed}gen`), 6, 3), 0.9),
    [kit.seed],
  );
  return (
    <g>
      <GroundShadow ids={kit.ids} />
      <path d={d} fill={kit.ids.url('snuff')} stroke={PALETTE.snuffRim} strokeWidth={2.4} />
      <BossEye ids={kit.ids} x={40} y={30} w={11} tilt={12} />
      <BossEye ids={kit.ids} x={88} y={30} w={11} tilt={-12} />
    </g>
  );
}

export function BossArt({ bossId, phase, crowns = 0, hungry = false, size = 192, animated = true, silhouette = false, seed, className, title }: BossArtProps): ReactElement {
  const ids = useSvgIds('boss');
  const live = animated && !silhouette;
  const kit: BossKit = { ids, animated: live, seed: seed ?? `${bossId}`, phase: clampPhase(phase) };
  const label = title ?? BOSS_NAMES[bossId]?.name ?? bossId;
  let art: ReactElement;
  switch (bossId) {
    case 'hush_hierophant':
      art = <HushHierophantArt kit={kit} />;
      break;
    case 'guttered_king':
      art = <GutteredKingArt kit={kit} crowns={crowns} />;
      break;
    case 'nocturna':
      art = <NocturnaArt kit={kit} hungry={hungry} />;
      break;
    default:
      art = <GenericBossArt kit={kit} />;
  }
  return (
    <svg
      className={cx('ww-art ww-boss', !live && 'ww-still', silhouette && 'ww-boss-silhouette', className)}
      width={size}
      height={size}
      viewBox={BOSS_VIEWBOX}
      role="img"
      aria-label={label}
    >
      <defs>
        <BossDefs ids={ids} />
        {silhouette && (
          <filter id={ids.id('sil')} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.04  0 0 0 0 0.08  0 0 0 1 0" />
          </filter>
        )}
      </defs>
      {silhouette ? <g filter={ids.url('sil')}>{art}</g> : art}
    </svg>
  );
}

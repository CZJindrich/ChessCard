// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BoardArt, tileOrigin } from '../../../src/art/board/BoardArt';
import { IntentTile, MoveDot, PushArrow, StrikeRing } from '../../../src/art/board/marks';
import { GloamFog, GloamWarningBand, LitShrineGlyph, SmokePlumeToken, TileOverlaySvg } from '../../../src/art/board/overlays';
import { TileArt, TILE_IDS } from '../../../src/art/board/tiles';
import { BossArt, BOSS_IDS } from '../../../src/art/bosses/BossArt';
import { BossHpBar, phaseNotches } from '../../../src/art/bosses/BossHpBar';
import { bossArtPlacement } from '../../../src/art/bosses/common';
import { SUNRISE_GOLD } from './fixtures';

afterEach(cleanup);

describe('BossArt', () => {
  it('renders every boss in every phase, plus silhouettes', () => {
    for (const id of BOSS_IDS) {
      for (const phase of [1, 2, 3]) {
        const { container, unmount } = render(<BossArt bossId={id} phase={phase} crowns={phase - 1} hungry={phase === 2} />);
        expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('-32 -64 192 192');
        unmount();
      }
      expect(() => render(<BossArt bossId={id} silhouette />)).not.toThrow();
    }
  });

  it('fills Guttered King crown sockets by Checkmate count', () => {
    const count = (crowns: number): number => {
      const { container, unmount } = render(<BossArt bossId="guttered_king" crowns={crowns} />);
      const n = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('fill') === SUNRISE_GOLD).length;
      unmount();
      return n;
    };
    expect(count(0)).toBe(0);
    expect(count(2)).toBe(2);
    expect(count(9)).toBe(3);
  });

  it('removes the Hierophant clapper in phase 3', () => {
    const p1 = render(<BossArt bossId="hush_hierophant" phase={1} />);
    const hasCoal = (el: HTMLElement): boolean => [...el.querySelectorAll('circle')].some((c) => (c.getAttribute('fill') ?? '').includes('coal-') || (c.getAttribute('fill') ?? '').includes('coal)'));
    expect(hasCoal(p1.container)).toBe(true);
    p1.unmount();
    const p3 = render(<BossArt bossId="hush_hierophant" phase={3} />);
    expect(hasCoal(p3.container)).toBe(false);
  });

  it('draws a fallback for unknown bosses', () => {
    expect(() => render(<BossArt bossId="mod_boss" />)).not.toThrow();
  });

  it('places the 3×3 art box half a tile left and one tile above the footprint', () => {
    expect(bossArtPlacement(48)).toEqual({ offsetX: -24, offsetY: -48, size: 144 });
  });

  it('puts HP bar phase notches at ⌊2/3⌋ and ⌊1/3⌋ of max HP (§10.1)', () => {
    expect(phaseNotches(35)).toEqual([23 / 35, 11 / 35]);
    expect(phaseNotches(0)).toEqual([]);
    for (const id of [...BOSS_IDS, 'mod_boss']) expect(() => render(<BossHpBar bossId={id} hp={10} maxHp={30} crowns={2} />)).not.toThrow();
  });
});

describe('board and tiles', () => {
  it('maps engine coordinates to board space with rank 1 at the bottom', () => {
    expect(tileOrigin({ x: 0, y: 0 }, 8, 8)).toEqual({ x: 0, y: 448 });
    expect(tileOrigin({ x: 7, y: 7 }, 8, 8)).toEqual({ x: 448, y: 0 });
    expect(tileOrigin({ x: 0, y: 0 }, 8, 8, true)).toEqual({ x: 448, y: 0 });
  });

  it('renders a framed board with Cinzel coordinates and every tile kind', () => {
    const { container } = render(
      <BoardArt
        cols={10}
        rows={10}
        tiles={{ '1,1': 'pillar', '2,2': 'rubble', '3,3': { id: 'votive_shrine', lit: true }, '4,4': { id: 'chimney', pair: 1 }, '5,5': 'hot_wax', '6,6': 'mod_tile' }}
        gloam={['0,0']}
        gloamWarning={['1,0']}
      />,
    );
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toContain('a');
    expect(labels).toContain('j');
    expect(labels).toContain('10');
    expect(container.querySelectorAll('.ww-tile-chimney')).toHaveLength(1);
    expect(container.querySelector('.ww-gloam')).not.toBeNull();
    expect(container.querySelector('.ww-gloam-warning')).not.toBeNull();
  });

  it('splits floor and glyph layers (§15.5 render order)', () => {
    const floor = render(<BoardArt cols={4} rows={4} layer="floor" tiles={{ '1,1': 'hot_wax' }} />);
    expect(floor.container.querySelector('.ww-tile-hot_wax')).toBeNull();
    floor.unmount();
    const glyph = render(<BoardArt cols={4} rows={4} layer="glyph" frame={false} tiles={{ '1,1': 'hot_wax' }} />);
    expect(glyph.container.querySelector('.ww-tile-hot_wax')).not.toBeNull();
    expect(glyph.container.querySelector('.ww-board-frame')).toBeNull();
  });

  it('renders every tile, overlay and mark standalone', () => {
    for (const id of [...TILE_IDS, 'unknown_tile']) expect(() => render(<TileArt tileId={id} lit pairIndex={5} />)).not.toThrow();
    const { container } = render(
      <TileOverlaySvg title="all">
        <GloamFog />
        <GloamWarningBand />
        <SmokePlumeToken enemyId="drip_hulk" />
        <SmokePlumeToken enemyId="mod_enemy" />
        <LitShrineGlyph />
        <IntentTile damage={3} queue={1} push={{ dx: 1, dy: 0 }} />
        <PushArrow dir={{ dx: 0, dy: -1 }} bump />
        <MoveDot danger={2} chimney hotWax />
        <StrikeRing damage={2} lethal />
      </TileOverlaySvg>,
    );
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['3', '1', 'bump 1', '!', '−1', '−2']));
    expect(container.querySelector('.ww-skull')).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PieceArt } from '../../../src/art/pieces/PieceArt';
import { ALL_PIECE_IDS, ENEMY_IDS, getPieceSpec, hasPieceArt, HERO_IDS, STRUCTURE_IDS, UNIT_IDS } from '../../../src/art/pieces/registry';
import { HOUSES } from '../../../src/art/palette';

afterEach(cleanup);

describe('piece registry', () => {
  it('covers every GDD piece id', () => {
    expect(HERO_IDS).toHaveLength(4);
    expect(UNIT_IDS).toHaveLength(13);
    expect(ENEMY_IDS).toHaveLength(13);
    expect(STRUCTURE_IDS).toEqual(['vigil_candle', 'smoldering_wick']);
    for (const id of ALL_PIECE_IDS) expect(hasPieceArt(id), id).toBe(true);
  });

  it('gives each piece a unique figure', () => {
    const figures = new Set(ALL_PIECE_IDS.map((id) => getPieceSpec(id).Figure));
    expect(figures.size).toBe(ALL_PIECE_IDS.length);
  });

  it('engraves the GDD runes (§5.2)', () => {
    expect(getPieceSpec('lampwright')).toMatchObject({ rune: 'rune_tower', pips: 3, strike: 'rune_bolt' });
    expect(getPieceSpec('wick_mortar')).toMatchObject({ rune: 'rune_anchor', strike: 'rune_arc' });
    expect(getPieceSpec('velvet_moth')).toMatchObject({ rune: 'rune_star', pips: 2, flying: true });
    expect(getPieceSpec('taper').rune).toBe('rune_pawn');
    expect(getPieceSpec('snuffer_knight').rune).toBe('rune_horse');
  });

  it('falls back by faction for unknown ids', () => {
    expect(getPieceSpec('mod_thing', 'snuff').faction).toBe('snuff');
    expect(getPieceSpec('mod_thing').faction).toBe('wick');
  });
});

describe('PieceArt', () => {
  it('renders every piece in every House colour and as Snuff without throwing', () => {
    for (const id of ALL_PIECE_IDS) {
      for (const house of Object.values(HOUSES)) {
        const { container, unmount } = render(<PieceArt defId={id} houseColor={house.color} hp={3} maxHp={4} atk={2} ward burn={2} dazed charm="cocoon" />);
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('role')).toBe('img');
        expect(svg?.getAttribute('aria-label')).toBe(getPieceSpec(id).name);
        unmount();
      }
    }
  });

  it('shows HP and ATK numbers and status badges', () => {
    const { container } = render(<PieceArt defId="sconce_paladin" hp={7} maxHp={8} atk={2} ward burn={2} dazed charm="riposte" />);
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('7');
    expect(texts).toContain('2');
    expect(container.querySelector('.ww-status')).not.toBeNull();
    expect(container.querySelector('.ww-charm')).not.toBeNull();
    expect(container.querySelector('.ww-hero-halo')).not.toBeNull();
  });

  it('hides stats when asked and never shows pips on Snuff', () => {
    const { container } = render(<PieceArt defId="sootling" hp={1} atk={1} showStats={false} />);
    expect(container.querySelector('.ww-hp')).toBeNull();
    expect(container.querySelector('.ww-atk')).toBeNull();
    expect(container.querySelector('.ww-pips')).toBeNull();
  });

  it('draws extra action pips for extra Moves', () => {
    const { container } = render(<PieceArt defId="taper" movesLeft={2} strikesLeft={1} />);
    expect(container.querySelectorAll('.ww-pips path').length).toBeGreaterThanOrEqual(3);
  });

  it('pre-bakes identical smoke for the same seed', () => {
    const a = render(<PieceArt defId="smokehound" seed="p7" animated={false} />);
    const first = a.container.querySelector('.ww-sway path')?.getAttribute('d');
    a.unmount();
    const b = render(<PieceArt defId="smokehound" seed="p7" animated={false} />);
    expect(b.container.querySelector('.ww-sway path')?.getAttribute('d')).toBe(first);
  });

  it('clamps the eye glance to 1.5 units', () => {
    const { container } = render(<PieceArt defId="taper" lookAt={{ dx: 30, dy: 40 }} />);
    const glance = container.querySelector<SVGGElement>('.ww-glance');
    expect(glance?.style.transform).toBe('translate(0.9px, 1.2px)');
  });

  it('freezes motion when not animated', () => {
    const { container } = render(<PieceArt defId="cinderling" animated={false} />);
    expect(container.querySelector('svg')?.classList.contains('ww-still')).toBe(true);
    expect(container.querySelector('.ww-flicker')).toBeNull();
  });

  it('renders the Vigil Candle HP band and the Smoldering Wick for kind overrides', () => {
    const candle = render(<PieceArt defId="vigil_candle" hp={2} maxHp={3} />);
    expect(candle.container.querySelectorAll('.ww-candle-hp rect').length).toBeGreaterThanOrEqual(4);
    candle.unmount();
    const wick = render(<PieceArt defId="moth_witch" kind="wick" />);
    expect(wick.container.querySelector('.ww-pips')).toBeNull();
  });

  it('never crashes on unknown ids (mods)', () => {
    expect(() => render(<PieceArt defId="modded_unit" rune="rune_star" hp={2} atk={1} />)).not.toThrow();
    expect(() => render(<PieceArt defId="modded_enemy" kind="enemy" rune="not_a_rune" />)).not.toThrow();
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLASS_FLAMES, HOUSES, houseColorForSeat, PALETTE } from '../../../src/art/palette';
import { contrastRatio } from '../../../src/art/util/color';

const css = readFileSync(resolve(__dirname, '../../../src/art/art.css'), 'utf8');
const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])([0-9])/g, '$1-$2').toLowerCase();

describe('palette tokens', () => {
  it('mirrors every PALETTE token as a CSS custom property with the same value', () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      const re = new RegExp(`--ww-${kebab(name)}:\\s*${value};`, 'i');
      expect(css, `--ww-${kebab(name)}`).toMatch(re);
    }
  });

  it('uses the GDD §16.2 hex values for key tokens', () => {
    expect(PALETTE.nightInk).toBe('#0D0B12');
    expect(PALETTE.bloodWax).toBe('#E5383B');
    expect(PALETTE.snuffBodyTop).toBe('#7E6EA0');
    expect(PALETTE.snuffRim).toBe('#B79CFF');
    expect(PALETTE.moonfire).toBe('#7FC8FF');
  });

  it('defines the four House colours in seat order (§1.2)', () => {
    expect(houseColorForSeat(1)).toBe('#E09A2D');
    expect(houseColorForSeat(2)).toBe('#E6D9B8');
    expect(houseColorForSeat(3)).toBe('#7FAF5A');
    expect(houseColorForSeat(4)).toBe('#5B8DEF');
    expect(houseColorForSeat(9)).toBe(HOUSES.house_beeswax.color);
    for (const h of Object.values(HOUSES)) expect(css).toContain(h.color);
  });

  it('keeps class flames off the Snuff red', () => {
    for (const flame of Object.values(CLASS_FLAMES)) {
      expect(flame.edge.toUpperCase()).not.toBe(PALETTE.bloodWax);
      expect(flame.edge.toUpperCase()).not.toBe(PALETTE.snuffEye);
    }
  });

  it('meets the documented contrast of Snuff and text against the board / panels', () => {
    expect(contrastRatio(PALETTE.snuffBodyTop, PALETTE.flagstoneA)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(PALETTE.snuffRim, PALETTE.flagstoneB)).toBeGreaterThanOrEqual(6);
    expect(contrastRatio(PALETTE.tallowText, PALETTE.cryptPlum)).toBeGreaterThanOrEqual(13);
    expect(contrastRatio(PALETTE.ashText, PALETTE.cryptPlum)).toBeGreaterThanOrEqual(7);
  });
});

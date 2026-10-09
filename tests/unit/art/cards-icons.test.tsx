// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardBack, CardFace, CardMini, rulesFontSize, type CardArtData } from '../../../src/art/cards/CardFace';
import { normalizeSigil, SigilIcon } from '../../../src/art/cards/SigilArt';
import { resolveGlyphId, SIGIL_GLYPH_IDS } from '../../../src/art/cards/sigils';
import { MOTH_DIE_FACES, MothDie, MothDieFaceIcon, mothDieFace, mothDieValue } from '../../../src/art/dice/MothDie';
import { CardTypeGlyph } from '../../../src/art/icons/cardTypes';
import { HouseGlyph } from '../../../src/art/icons/houses';
import * as Hud from '../../../src/art/icons/hud';
import { RUNE_IDS, RuneIcon } from '../../../src/art/icons/runes';
import { StatusIcon, STATUS_IDS } from '../../../src/art/icons/status';
import { HOUSE_ORDER } from '../../../src/art/palette';
import { BossIntroBackdrop, DefeatEyespots, SkyBackdrop, VictorySunrise } from '../../../src/art/scenes/Backdrops';
import { TitleScene } from '../../../src/art/scenes/TitleScene';

afterEach(cleanup);

const SPARK: CardArtData = { id: 'spark', name: 'Spark', type: 'rite', cost: 1, rarity: 'common', text: 'Deal 1 damage to an enemy or Smoke Plume within 3.', art: { sigil: ['spark'], accent: '#E8742C' } };

describe('cards', () => {
  it('renders name, cost, type ribbon and rules text', () => {
    const { container, getByText } = render(<CardFace card={SPARK} />);
    expect(getByText('Spark')).toBeTruthy();
    expect(getByText('RITE')).toBeTruthy();
    expect(getByText(SPARK.text)).toBeTruthy();
    expect([...container.querySelectorAll('.ww-card-cost text')].map((t) => t.textContent)).toEqual(['1']);
  });

  it('marks tempered cards with "+" and disabled cards with their reason', () => {
    const tempered = render(<CardFace card={{ ...SPARK, tempered: true, cost: 0 }} />);
    expect(tempered.container.textContent).toContain('Spark+');
    tempered.unmount();
    const disabled = render(<CardFace card={{ ...SPARK, disabled: true, reason: 'Need 1 Flame' }} />);
    expect(disabled.getByText('Need 1 Flame')).toBeTruthy();
    expect(disabled.container.querySelector('svg')?.classList.contains('ww-card-disabled')).toBe(true);
  });

  it('draws the summoned unit for Summon cards', () => {
    const { container } = render(<CardFace card={{ ...SPARK, id: 'light_a_taper', type: 'summon', summonUnitId: 'taper' }} />);
    expect(container.querySelector('.ww-piece-graphic')).not.toBeNull();
  });

  it('renders every rarity, mini cards, backs and modded data without throwing', () => {
    for (const rarity of ['common', 'rare', 'mythic', 'legendary']) {
      expect(() => render(<CardFace card={{ ...SPARK, rarity }} />)).not.toThrow();
      expect(() => render(<CardMini card={{ ...SPARK, rarity }} />)).not.toThrow();
    }
    expect(() => render(<CardFace card={{ ...SPARK, type: 'ritual', art: undefined }} />)).not.toThrow();
    expect(() => render(<CardBack />)).not.toThrow();
  });

  it('steps rules text size down with length but never below 13 px', () => {
    expect(rulesFontSize('Summon a Taper.')).toBe(16);
    expect(rulesFontSize('x'.repeat(200))).toBe(13);
  });
});

describe('sigils', () => {
  it('ships a library of at least 30 glyphs that all render', () => {
    expect(SIGIL_GLYPH_IDS.length).toBeGreaterThanOrEqual(30);
    for (const id of SIGIL_GLYPH_IDS) expect(() => render(<SigilIcon sigil={id} />)).not.toThrow();
  });

  it('resolves aliases and falls back for unknown names', () => {
    expect(resolveGlyphId('Flame')).toBe('flame');
    expect(resolveGlyphId('drop')).toBe('wax_drop');
    expect(resolveGlyphId('cauldron')).toBeNull();
    expect(() => render(<SigilIcon sigil={['cauldron', 'newt', 'flame', 'moon']} />)).not.toThrow();
    expect(normalizeSigil('moth')).toEqual(['moth']);
    expect(normalizeSigil(undefined)).toEqual([]);
  });
});

describe('icons', () => {
  it('renders every rune, status, House and card-type glyph', () => {
    for (const id of [...RUNE_IDS, 'rune_unknown']) expect(() => render(<RuneIcon id={id} pips={3} />)).not.toThrow();
    for (const id of [...STATUS_IDS, 'mystery']) expect(() => render(<StatusIcon id={id} count={2} />)).not.toThrow();
    for (const id of [...HOUSE_ORDER, 'bee', 'unknown_house']) expect(() => render(<HouseGlyph house={id} disc />)).not.toThrow();
    for (const t of ['summon', 'rite', 'charm', 'other']) expect(() => render(<CardTypeGlyph type={t} />)).not.toThrow();
  });

  it('renders the HUD set', () => {
    const { container } = render(
      <div>
        <Hud.FlameIcon />
        <Hud.FlameIcon lit={false} />
        <Hud.HourCandle value={5} max={12} guttering />
        <Hud.HourCandle value={20} max={12} />
        <Hud.GloamBellIcon rounds={2} />
        <Hud.PealBellIcon />
        <Hud.GloryIcon value={12} />
        <Hud.CrownSocketIcon filled />
        <Hud.FirstLightToken />
        <Hud.WantedSeal />
        <Hud.EndTurnSeal pulsing />
        <Hud.UndoIcon />
        <Hud.HintIcon />
        <Hud.DeckIcon count={7} />
        <Hud.DiscardIcon count={3} />
        <Hud.HeroPowerIcon heroId="lampwright" cost={1} />
        <Hud.HeroPowerIcon heroId="mod_hero" used />
      </div>,
    );
    expect(container.querySelectorAll('svg').length).toBe(17);
    expect(container.textContent).toContain('12/12');
  });

  it('computes Dread thresholds per §13.1.2', () => {
    expect(Hud.dreadThresholds(12)).toEqual({ dimming: 4, deepDark: 8, longNight: 12 });
    expect(Hud.dreadThresholds(14)).toEqual({ dimming: 4, deepDark: 9, longNight: 14 });
  });
});

describe('Moth Die', () => {
  it('maps values to faces (§13.5) and clamps', () => {
    expect(MOTH_DIE_FACES.map((_, i) => mothDieFace(i + 1))).toEqual(['eclipse', 'smoke', 'stillness', 'long_shadows', 'kindling', 'bright_wings']);
    expect(mothDieFace(0)).toBe('eclipse');
    expect(mothDieFace(9)).toBe('bright_wings');
    expect(mothDieValue('kindling')).toBe(5);
  });

  it('tumbles only when rolled and not under reduced motion', () => {
    const rolled = render(<MothDie value={4} rollId={1} />);
    expect(rolled.container.querySelector('.ww-die-rolling')).not.toBeNull();
    expect(rolled.container.querySelector('.ww-die')?.getAttribute('aria-label')).toBe('Moth Die: Slow Snuff');
    rolled.unmount();
    const calm = render(<MothDie value={4} rollId={1} reducedMotion />);
    expect(calm.container.querySelector('.ww-die-rolling')).toBeNull();
    calm.unmount();
    const onLanded = vi.fn();
    const live = render(<MothDie value={6} rollId={2} onLanded={onLanded} />);
    const cube = live.container.querySelector('.ww-die-cube');
    // jsdom has no AnimationEvent, so React listens for the vendor-prefixed name there.
    if (cube) fireEvent(cube, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(onLanded).toHaveBeenCalledTimes(1);
    live.unmount();
    const instant = vi.fn();
    render(<MothDie value={2} rollId={3} reducedMotion onLanded={instant} />);
    expect(instant).toHaveBeenCalledTimes(1);
    for (const f of MOTH_DIE_FACES) expect(() => render(<MothDieFaceIcon face={f} />)).not.toThrow();
  });
});

describe('scenes', () => {
  it('render in a DOM without a pointer', () => {
    expect(() => render(<TitleScene />)).not.toThrow();
    expect(() => render(<TitleScene reducedMotion />)).not.toThrow();
    expect(() => render(<SkyBackdrop dread={0.5} />)).not.toThrow();
    expect(() => render(<VictorySunrise />)).not.toThrow();
    expect(() => render(<DefeatEyespots reducedMotion />)).not.toThrow();
    expect(() => render(<BossIntroBackdrop bossId="nocturna" />)).not.toThrow();
  });
});

describe('content sigil coverage', () => {
  it('resolves every sigil name used by the GDD-era cards.json draft', () => {
    const used = ['arrow', 'bellows', 'blade', 'burst', 'censer', 'cocoon', 'crown', 'drop', 'ember', 'eye', 'flame', 'gear', 'hand', 'heart', 'horse', 'lantern', 'lens', 'mitre', 'moon', 'mortar', 'moth', 'pawn', 'ram', 'ring', 'seal', 'shield', 'spark', 'spiral', 'star', 'sun', 'sunrise', 'swap', 'tower', 'twin_blades', 'web', 'wick', 'wing'];
    for (const name of used) expect(resolveGlyphId(name), name).not.toBeNull();
  });
});

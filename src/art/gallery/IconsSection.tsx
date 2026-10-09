/** Gallery: runes, statuses, HUD icons, House and card-type glyphs. */
import type { ReactElement, ReactNode } from 'react';
import { CardTypeGlyph } from '../icons/cardTypes';
import { HouseGlyph } from '../icons/houses';
import {
  CrownSocketIcon,
  DeckIcon,
  DiscardIcon,
  EndTurnSeal,
  FirstLightToken,
  FlameIcon,
  GloamBellIcon,
  GloryIcon,
  HeroPowerIcon,
  HintIcon,
  HourCandle,
  PealBellIcon,
  UndoIcon,
  WantedSeal,
} from '../icons/hud';
import { RUNE_IDS, RUNE_NAMES, RuneIcon } from '../icons/runes';
import { StatusIcon, STATUS_IDS } from '../icons/status';
import { HOUSE_ORDER } from '../palette';
import { HERO_IDS } from '../pieces/registry';

function Item({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="gal-item">
      {children}
      <div className="gal-label">{label}</div>
    </div>
  );
}

export function IconsSection(): ReactElement {
  return (
    <section className="gal-section">
      <h3>Runes (48 px and 20 px)</h3>
      <div className="gal-row">
        {RUNE_IDS.map((id) => (
          <Item key={id} label={RUNE_NAMES[id]}>
            <div className="gal-row" style={{ gap: 6, alignItems: 'center' }}>
              <RuneIcon id={id} size={48} pips={id === 'rune_tower' ? 3 : id === 'rune_mitre' ? 2 : 0} />
              <RuneIcon id={id} size={20} disc={false} />
            </div>
          </Item>
        ))}
        <Item label="unknown rune">
          <RuneIcon id="rune_mod" size={48} />
        </Item>
      </div>
      <h3>Statuses</h3>
      <div className="gal-row">
        {STATUS_IDS.map((id) => (
          <Item key={id} label={id}>
            <StatusIcon id={id} size={40} count={id === 'burn' ? 2 : undefined} />
          </Item>
        ))}
      </div>
      <h3>Flame, dread &amp; tokens</h3>
      <div className="gal-row">
        <Item label="Flame ×3 + spent ×2">
          <div className="gal-row" style={{ gap: 2 }}>
            <FlameIcon />
            <FlameIcon pending />
            <FlameIcon color="#F09AD0" />
            <FlameIcon lit={false} />
            <FlameIcon lit={false} />
          </div>
        </Item>
        <Item label="Hour Candle 0/12">
          <HourCandle value={0} max={12} />
        </Item>
        <Item label="4/12 (dimming)">
          <HourCandle value={4} max={12} />
        </Item>
        <Item label="9/14 guttering">
          <HourCandle value={9} max={14} guttering />
        </Item>
        <Item label="12/12">
          <HourCandle value={12} max={12} />
        </Item>
        <Item label="Gloam Bell">
          <GloamBellIcon rounds={2} size={40} />
        </Item>
        <Item label="Silencing Peal">
          <PealBellIcon size={40} />
        </Item>
        <Item label="Glory">
          <GloryIcon size={40} />
        </Item>
        <Item label="Glory 12">
          <GloryIcon size={40} value={12} />
        </Item>
        <Item label="Crown socket">
          <div className="gal-row" style={{ gap: 4 }}>
            <CrownSocketIcon size={32} />
            <CrownSocketIcon size={32} filled />
          </div>
        </Item>
        <Item label="First Light">
          <FirstLightToken size={40} />
        </Item>
        <Item label="Wanted">
          <WantedSeal size={56} />
        </Item>
      </div>
      <h3>Hand bar</h3>
      <div className="gal-row">
        <Item label="Deck">
          <DeckIcon size={44} count={7} />
        </Item>
        <Item label="Discard">
          <DiscardIcon size={44} count={3} />
        </Item>
        {HERO_IDS.map((id) => (
          <Item key={id} label={`Power: ${id}`}>
            <HeroPowerIcon heroId={id} size={52} cost={id === 'lampwright' || id === 'ember_duelist' ? 1 : 2} />
          </Item>
        ))}
        <Item label="Power used">
          <HeroPowerIcon heroId="moth_witch" size={52} used cost={2} />
        </Item>
        <Item label="Undo">
          <UndoIcon size={40} />
        </Item>
        <Item label="Hint">
          <HintIcon size={40} />
        </Item>
        <Item label="End Turn">
          <EndTurnSeal size={96} />
        </Item>
        <Item label="End Turn (pulsing)">
          <EndTurnSeal size={96} pulsing />
        </Item>
        <Item label="armed">
          <EndTurnSeal size={96} armed label="CONFIRM" />
        </Item>
      </div>
      <h3>Houses &amp; card types</h3>
      <div className="gal-row">
        {HOUSE_ORDER.map((id) => (
          <Item key={id} label={id}>
            <div className="gal-row" style={{ gap: 6 }}>
              <HouseGlyph house={id} size={44} />
              <HouseGlyph house={id} size={44} disc />
            </div>
          </Item>
        ))}
        {['summon', 'rite', 'charm'].map((t) => (
          <Item key={t} label={t}>
            <CardTypeGlyph type={t} size={44} />
          </Item>
        ))}
      </div>
    </section>
  );
}

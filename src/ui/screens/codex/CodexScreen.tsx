/**
 * Codex (GDD §15.1.12): every hero, unit, card, Snuff, boss, Toll, Moth Die face, tile,
 * Heirloom and Boon, rendered live from the active content registry, with search and the
 * "Load mod (JSON)" loader.
 */
import { useState, type ReactElement } from 'react';
import { CODEX_TABS, type CodexTab } from '../../app/navigation';
import { useContentState, usePresentation } from '../../app/services';
import { Button } from '../../components/Button';
import { UiIcon } from '../../components/icons';
import { ScreenFrame } from '../../components/ScreenFrame';
import { panelId, tabId, Tabs } from '../../components/Tabs';
import type { ContentRegistry } from '../../../engine/types';
import { CardsSection } from './cardSections';
import { ModLoader } from './ModLoader';
import { BossesSection, HeroesSection, SnuffSection, UnitsSection, type SectionProps } from './pieceSections';
import { HeirloomsSection, MothDieSection, TilesSection, TollsSection } from './worldSections';
import './codex.css';

const TAB_LABELS: Readonly<Record<CodexTab, string>> = {
  heroes: 'Heroes',
  units: 'Units',
  cards: 'Cards',
  snuff: 'Snuff',
  bosses: 'Bosses',
  tolls: 'Tolls',
  moth_die: 'Moth Die',
  tiles: 'Tiles',
  heirlooms: 'Heirlooms & Boons',
};

const SECTIONS: Readonly<Record<CodexTab, (props: SectionProps) => ReactElement>> = {
  heroes: HeroesSection,
  units: UnitsSection,
  cards: CardsSection,
  snuff: SnuffSection,
  bosses: BossesSection,
  tolls: TollsSection,
  moth_die: MothDieSection,
  tiles: TilesSection,
  heirlooms: HeirloomsSection,
};

export function tabCount(tab: CodexTab, content: ContentRegistry): number {
  switch (tab) {
    case 'heroes':
      return content.heroes.list.length;
    case 'units':
      return content.units.list.length;
    case 'cards':
      return content.cards.list.length;
    case 'snuff':
      return content.enemies.list.length;
    case 'bosses':
      return content.bosses.list.length;
    case 'tolls':
      return content.tolls.list.length;
    case 'moth_die':
      return content.omens.list.length;
    case 'tiles':
      return content.tiles.list.length + content.overlays.list.length + content.tokens.list.length + content.statuses.list.length;
    case 'heirlooms':
      return content.heirlooms.list.length + content.boons.list.length;
  }
}

const ID_PREFIX = 'codex';

export function CodexScreen({ initialTab = 'heroes' }: { initialTab?: CodexTab }): ReactElement {
  const content = useContentState();
  const presentation = usePresentation();
  const [tab, setTab] = useState<CodexTab>(initialTab);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const Section = SECTIONS[tab];
  const registry = content.registry;

  return (
    <ScreenFrame
      title="Codex"
      subtitle={content.modded ? `Modded content (${content.modLabel ?? 'mod'}) · hash ${content.hash}` : 'Everything in Sconcewick, from the content files'}
      bodyClassName="ww-codex"
      headerExtra={
        <>
          <label className="ww-codex__search">
            <UiIcon name="search" />
            <input className="ww-input" type="search" value={query} placeholder="Search" aria-label="Search the Codex" onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
          <Button size="sm" variant="ghost" icon="upload" onClick={() => setLoading(true)}>
            Load mod (JSON)
          </Button>
        </>
      }
    >
      <div className="ww-codex__bar">
        <Tabs
          items={CODEX_TABS.map((id) => ({ id, label: TAB_LABELS[id], count: tabCount(id, registry) }))}
          value={tab}
          onChange={setTab}
          label="Codex sections"
          idPrefix={ID_PREFIX}
        />
      </div>
      <div role="tabpanel" id={panelId(ID_PREFIX, tab)} aria-labelledby={tabId(ID_PREFIX, tab)} className="ww-codex__panel">
        <Section content={registry} query={query.trim()} animated={!presentation.reduced_motion} />
      </div>
      {loading && <ModLoader onClose={() => setLoading(false)} />}
    </ScreenFrame>
  );
}

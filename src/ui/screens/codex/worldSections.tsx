/** Codex sections for the world: Tolls, the Moth Die, tiles (with overlays, tokens, statuses), Heirlooms and Boons. */
import { useState, type ReactElement, type ReactNode } from 'react';
import {
  CrownSocketIcon,
  FirstLightToken,
  GloamFog,
  GloamWarningBand,
  LitShrineGlyph,
  MothDie,
  MothDieFaceIcon,
  PieceArt,
  SmokePlumeToken,
  StatusIcon,
  TileArt,
  TileOverlaySvg,
  WantedSeal,
} from '../../../art';
import type { TileDef } from '../../../engine/types';
import { useServices } from '../../app/services';
import { Button } from '../../components/Button';
import { matchesQuery } from '../../model/describe';
import { CodexEntry, EmptyResult, Fact, Facts } from './CodexEntry';
import type { SectionProps } from './pieceSections';

const REQUIRES: Readonly<Record<string, string>> = {
  moth_die: 'Needs the Moth Die on',
  plumes: 'Needs Plumes (neutrals not off)',
  pillar: 'Needs at least 1 Pillar',
  chimney_pair: 'Needs a Chimney pair',
};

export function TollsSection({ content, query }: SectionProps): ReactElement {
  const tolls = content.tolls.list.filter((t) => matchesQuery(query, [t.name, t.text, t.flavor, t.kind]));
  if (tolls.length === 0) return <EmptyResult query={query} />;
  const column = (kind: 'blessing' | 'curse', title: string, note: string): ReactElement => (
    <section className="ww-codex__column" aria-label={title}>
      <h3 className="ww-codex__column-title">{title}</h3>
      <p className="ww-codex__column-note">{note}</p>
      {tolls
        .filter((t) => t.kind === kind)
        .map((toll) => (
          <article key={toll.id} className={`ww-toll ww-toll--${kind}`}>
            <header className="ww-toll__head">
              <h4 className="ww-toll__name">{toll.name}</h4>
              {toll.requires.map((r) => (
                <span key={r} className="ww-badge">
                  {REQUIRES[r] ?? r}
                </span>
              ))}
            </header>
            <p className="ww-toll__text">{toll.text}</p>
            {toll.flavor && <p className="ww-toll__flavor">{toll.flavor}</p>}
          </article>
        ))}
    </section>
  );
  return (
    <div className="ww-codex__columns">
      {column('blessing', 'Blessings', 'Effects for the whole Night.')}
      {column('curse', 'Curses', 'Choosing a Curse lets every seat take 2 cards at the next Chandlery.')}
    </div>
  );
}

const TONE_BADGE: Readonly<Record<string, string>> = { bad: 'ww-badge ww-badge--ember', neutral: 'ww-badge', good: 'ww-badge ww-badge--verdigris' };

export function MothDieSection({ content, query, animated }: SectionProps): ReactElement {
  const { audio } = useServices();
  const [roll, setRoll] = useState<{ value: number; id: number }>({ value: 3, id: 0 });
  const omens = content.omens.list.filter((o) => matchesQuery(query, [o.name, o.label, o.text]));
  const rollDie = (): void => {
    audio.play('diceRoll');
    setRoll((r) => ({ value: 1 + Math.floor(Math.random() * 6), id: r.id + 1 }));
  };
  const landed = (): void => {
    const pitch = roll.value >= 5 ? 1.26 : roll.value >= 3 ? 1 : 0.71;
    audio.play('diceLand', { pitch });
  };
  return (
    <div className="ww-codex__die">
      <div className="ww-codex__die-stage">
        <MothDie value={roll.value} rollId={roll.id > 0 ? roll.id : undefined} size={84} reducedMotion={!animated} onLanded={landed} />
        <Button size="sm" icon="play" onClick={rollDie}>
          Roll the Moth Die
        </Button>
      </div>
      {omens.length === 0 ? (
        <EmptyResult query={query} />
      ) : (
        <ul className="ww-codex__faces">
          {omens.map((omen) => (
            <li key={omen.id} className={roll.id > 0 && roll.value === omen.face ? 'ww-face ww-face--rolled' : 'ww-face'}>
              <MothDieFaceIcon face={omen.id} size={52} />
              <div className="ww-face__text">
                <p className="ww-face__head">
                  <span className="ww-num">{omen.face}</span> · {omen.name}
                  <span className={TONE_BADGE[omen.tone] ?? 'ww-badge'}>{omen.label}</span>
                </p>
                <p className="ww-dim">{omen.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function TileFacts({ tile }: { tile: TileDef }): ReactElement {
  return (
    <Facts>
      <Fact label="Enterable">{yesNo(tile.enterable)}</Fact>
      {tile.enterable && <Fact label="Ends slides">{yesNo(tile.endsSlide)}</Fact>}
      <Fact label="Blocks line of sight">{yesNo(tile.blocksLos)}</Fact>
      {tile.aiCost !== null && <Fact label="Snuff path cost">{tile.aiCostImmune !== null ? `${tile.aiCost} (${tile.aiCostImmune} if immune)` : tile.aiCost}</Fact>}
      {tile.lightRadius > 0 && <Fact label="Light">{tile.litLightRadius ? `${tile.lightRadius} tiles (${tile.litLightRadius} when lit)` : `${tile.lightRadius} tiles`}</Fact>}
    </Facts>
  );
}

const OVERLAY_ART: Readonly<Record<string, ReactNode>> = {
  gloam: (
    <TileOverlaySvg title="Gloam" size={72}>
      <GloamFog />
    </TileOverlaySvg>
  ),
  gloam_warning: (
    <TileOverlaySvg title="Gloam warning" size={72}>
      <GloamWarningBand />
    </TileOverlaySvg>
  ),
  vigil_candle: <PieceArt defId="vigil_candle" kind="candle" size={72} hp={3} maxHp={3} />,
  smoldering_wick: <PieceArt defId="smoldering_wick" kind="wick" size={72} />,
};

const TOKEN_ART: Readonly<Record<string, ReactNode>> = {
  smoke_plume: (
    <TileOverlaySvg title="Smoke Plume" size={72}>
      <SmokePlumeToken enemyId="sootling" seed="codex" />
    </TileOverlaySvg>
  ),
  lit_shrine: (
    <TileOverlaySvg title="Lit Shrine" size={72}>
      <LitShrineGlyph />
    </TileOverlaySvg>
  ),
  first_light: <FirstLightToken size={60} />,
  crown_socket: <CrownSocketIcon filled size={52} />,
  bounty_seal: <WantedSeal size={60} />,
};

export function TilesSection({ content, query, animated }: SectionProps): ReactElement {
  const tiles = content.tiles.list.filter((t) => matchesQuery(query, [t.name, t.text]));
  const overlays = content.overlays.list.filter((o) => matchesQuery(query, [o.name, o.text]));
  const tokens = content.tokens.list.filter((t) => matchesQuery(query, [t.name, t.text]));
  const statuses = content.statuses.list.filter((s) => matchesQuery(query, [s.name, s.text]));
  if (tiles.length + overlays.length + tokens.length + statuses.length === 0) return <EmptyResult query={query} />;
  return (
    <div className="ww-codex__stack">
      {tiles.length > 0 && (
        <section aria-label="Tiles">
          <h3 className="ww-codex__subhead">Tiles</h3>
          <div className="ww-codex__grid">
            {tiles.map((tile) => (
              <CodexEntry key={tile.id} art={<TileArt tileId={tile.id} lit={false} size={72} animated={animated} title={tile.name} />} title={tile.name}>
                <p className="ww-entry__text">{tile.text}</p>
                <TileFacts tile={tile} />
              </CodexEntry>
            ))}
          </div>
        </section>
      )}
      {overlays.length > 0 && (
        <section aria-label="Overlays and structures">
          <h3 className="ww-codex__subhead">Overlays and structures</h3>
          <div className="ww-codex__grid">
            {overlays.map((o) => (
              <CodexEntry key={o.id} art={OVERLAY_ART[o.id]} title={o.name} subtitle={o.kind === 'structure' ? 'Structure' : 'Overlay'}>
                <p className="ww-entry__text">{o.text}</p>
              </CodexEntry>
            ))}
          </div>
        </section>
      )}
      {tokens.length > 0 && (
        <section aria-label="Tokens">
          <h3 className="ww-codex__subhead">Tokens</h3>
          <div className="ww-codex__grid">
            {tokens.map((t) => (
              <CodexEntry key={t.id} art={TOKEN_ART[t.id]} title={t.name}>
                <p className="ww-entry__text">{t.text}</p>
              </CodexEntry>
            ))}
          </div>
        </section>
      )}
      {statuses.length > 0 && (
        <section aria-label="Statuses">
          <h3 className="ww-codex__subhead">Statuses</h3>
          <div className="ww-codex__grid">
            {statuses.map((s) => (
              <CodexEntry key={s.id} art={<StatusIcon id={s.id} size={52} />} title={s.name} subtitle={`Shape: ${s.shape}`}>
                <p className="ww-entry__text">{s.text}</p>
              </CodexEntry>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const HEIRLOOM_KIND: Readonly<Record<string, string>> = { passive: 'Passive', triggered: 'Each Night', free_action: 'Free action' };

export function HeirloomsSection({ content, query }: SectionProps): ReactElement {
  const heirlooms = content.heirlooms.list.filter((h) => matchesQuery(query, [h.name, h.text, h.flavor]));
  const boons = content.boons.list.filter((b) => matchesQuery(query, [b.name, b.text]));
  if (heirlooms.length + boons.length === 0) return <EmptyResult query={query} />;
  return (
    <div className="ww-codex__columns">
      <section className="ww-codex__column" aria-label="Heirlooms">
        <h3 className="ww-codex__column-title">Heirlooms</h3>
        <p className="ww-codex__column-note">Owned by your hero for the rest of the game.</p>
        {heirlooms.map((h) => (
          <article key={h.id} className="ww-toll ww-toll--heirloom">
            <header className="ww-toll__head">
              <h4 className="ww-toll__name">{h.name}</h4>
              <span className="ww-badge ww-badge--gold">{HEIRLOOM_KIND[h.kind] ?? h.kind}</span>
            </header>
            <p className="ww-toll__text">{h.text}</p>
            {h.flavor && <p className="ww-toll__flavor">{h.flavor}</p>}
          </article>
        ))}
      </section>
      <section className="ww-codex__column" aria-label="Boons">
        <h3 className="ww-codex__column-title">Boons</h3>
        <p className="ww-codex__column-note">Choose one at every Chandlery (when Boons are on).</p>
        {boons.map((b) => (
          <article key={b.id} className="ww-toll ww-toll--boon">
            <header className="ww-toll__head">
              <h4 className="ww-toll__name">{b.name}</h4>
            </header>
            <p className="ww-toll__text">{b.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

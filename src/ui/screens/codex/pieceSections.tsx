/** Codex sections for pieces: heroes, Wickfolk units, the Snuff and the bosses. */
import { useState, type ReactElement } from 'react';
import { BossArt, HOUSES, PieceArt, RuneIcon } from '../../../art';
import type { BossDef, BossIntentDef, ContentRegistry, EnemyDef, RankId } from '../../../engine/types';
import { Chip } from '../../components/Chip';
import { StatPills } from '../../components/StatPills';
import { attackSummary, bossCoopIntentText, bossHpSummary, heroView, matchesQuery, moveSummary, patternSummary, rankName, traitNames } from '../../model/describe';
import { CodexEntry, EmptyResult, Fact, Facts } from './CodexEntry';

export interface SectionProps {
  content: ContentRegistry;
  query: string;
  animated: boolean;
}

const HOUSE = HOUSES.house_beeswax.color;

function Runes({ rune, pips, strikeRune }: { rune: string; pips: number | null; strikeRune: string | null }): ReactElement {
  return (
    <span className="ww-entry__runes">
      <RuneIcon id={rune} pips={pips ?? 0} size={26} />
      {strikeRune && <RuneIcon id={strikeRune} size={26} />}
    </span>
  );
}

export function HeroesSection({ content, query, animated }: SectionProps): ReactElement {
  const heroes = content.heroes.list.filter((h) => matchesQuery(query, [h.displayName, h.pitch, h.flavor, h.trait, h.power]));
  if (heroes.length === 0) return <EmptyResult query={query} />;
  return (
    <div className="ww-codex__list">
      {heroes.map((hero) => {
        const view = heroView(content, hero);
        const starters = hero.starters.map((id) => content.cards.byId[id]?.name ?? id);
        return (
          <CodexEntry
            key={hero.id}
            className="ww-entry--wide"
            art={<PieceArt defId={hero.id} kind="hero" houseColor={HOUSE} size={112} showStats={false} showPips={false} animated={animated} />}
            title={view.firstName}
            subtitle={view.title}
            badges={
              <>
                <StatPills hp={view.hp} atk={view.atk} />
                <Runes rune={hero.rune} pips={hero.pips} strikeRune={hero.strikeRune} />
              </>
            }
            flavor={hero.flavor}
          >
            <p className="ww-entry__pitch">{view.pitch}</p>
            <Facts>
              <Fact label="Move">{view.move}</Fact>
              <Fact label="Strike">{view.strike}</Fact>
              <Fact label="Trait">
                <span className="ww-fact__name">{view.traitName}.</span> {view.traitText}
              </Fact>
              <Fact label="Power">
                <span className="ww-fact__name">
                  {view.powerName} · {view.powerCost} Flame.
                </span>{' '}
                {view.powerText}
              </Fact>
              <Fact label="Class starters">{starters.join(', ')} (×2 each)</Fact>
            </Facts>
          </CodexEntry>
        );
      })}
    </div>
  );
}

export function UnitsSection({ content, query, animated }: SectionProps): ReactElement {
  const units = content.units.list.filter((u) => matchesQuery(query, [u.name, u.text, u.flavor, ...traitNames(content, u)]));
  if (units.length === 0) return <EmptyResult query={query} />;
  return (
    <div className="ww-codex__grid">
      {units.map((unit) => {
        const card = unit.card ? content.cards.byId[unit.card] : undefined;
        return (
          <CodexEntry
            key={unit.id}
            art={<PieceArt defId={unit.id} kind="unit" houseColor={HOUSE} size={80} showStats={false} showPips={false} animated={animated} />}
            title={unit.name}
            subtitle={unit.structure ? 'Structure' : 'Unit'}
            badges={
              <>
                <StatPills hp={unit.hp} atk={unit.atk} />
                <Runes rune={unit.rune} pips={unit.pips} strikeRune={unit.strikeRune} />
              </>
            }
            flavor={unit.flavor}
          >
            <Facts>
              <Fact label="Move">{moveSummary(content, unit)}</Fact>
              <Fact label="Strike">{attackSummary(content, unit.attack)}</Fact>
              {unit.traits.map((t) => (
                <Fact key={t} label={content.traits.byId[t]?.name ?? t}>
                  {content.traits.byId[t]?.text ?? ''}
                </Fact>
              ))}
              {unit.text && <Fact label="Note">{unit.text}</Fact>}
              {card && (
                <Fact label="Summoned by">
                  {card.name} ({card.cost} Flame)
                </Fact>
              )}
            </Facts>
          </CodexEntry>
        );
      })}
    </div>
  );
}

const PREFERS: Readonly<Record<string, string>> = {
  candles: 'Vigil Candles',
  heroes: 'Heroes',
  light: 'Lights (Shrines, Lanterns, Candles)',
  clusters: 'Clusters of Wickfolk',
  nearest: 'The nearest Wickfolk',
};

function weightsText(enemy: EnemyDef): string {
  if (enemy.summonOnly) return 'Never drawn: placed by bosses or sites';
  return `Tier 1: ${enemy.weight['1']} · Tier 2: ${enemy.weight['2']} · Tier 3: ${enemy.weight['3']}`;
}

export function SnuffSection({ content, query, animated }: SectionProps): ReactElement {
  const ranks: RankId[] = ['minion', 'soldier', 'elite', 'structure'];
  const [rank, setRank] = useState<RankId | 'all'>('all');
  const enemies = content.enemies.list.filter(
    (e) => (rank === 'all' || e.rank === rank) && matchesQuery(query, [e.name, e.text, e.flavor, e.rank, ...traitNames(content, e)]),
  );
  return (
    <>
      <div className="ww-codex__filters">
        <div className="ww-chip-row" role="group" aria-label="Filter by rank">
          <Chip selected={rank === 'all'} onSelect={() => setRank('all')}>
            All ranks
          </Chip>
          {ranks.map((r) => (
            <Chip key={r} selected={rank === r} onSelect={() => setRank(r)}>
              {rankName(content, r)}
            </Chip>
          ))}
        </div>
      </div>
      {enemies.length === 0 ? (
        <EmptyResult query={query || rankName(content, rank)} />
      ) : (
        <div className="ww-codex__grid">
          {enemies.map((enemy) => (
            <CodexEntry
              key={enemy.id}
              art={<PieceArt defId={enemy.id} side="snuff" kind="enemy" size={80} showStats={false} animated={animated} />}
              title={enemy.name}
              subtitle={`${rankName(content, enemy.rank)} · ${enemy.glory} Glory`}
              badges={
                <>
                  <StatPills hp={enemy.hp} atk={enemy.atk} />
                  <Runes rune={enemy.rune} pips={enemy.pips} strikeRune={enemy.strikeRune} />
                </>
              }
              flavor={enemy.flavor}
            >
              <Facts>
                <Fact label="Move">{moveSummary(content, enemy)}</Fact>
                <Fact label="Attack">{attackSummary(content, enemy.attack)}</Fact>
                {enemy.ai.prefers && <Fact label="Prefers">{PREFERS[enemy.ai.prefers] ?? enemy.ai.prefers}</Fact>}
                {enemy.traits.map((t) => (
                  <Fact key={t} label={content.traits.byId[t]?.name ?? t}>
                    {content.traits.byId[t]?.text ?? ''}
                  </Fact>
                ))}
                {enemy.text && <Fact label="Note">{enemy.text}</Fact>}
                <Fact label="Draw weight">{weightsText(enemy)}</Fact>
              </Facts>
            </CodexEntry>
          ))}
        </div>
      )}
    </>
  );
}

function enterText(enterAt: [number, number] | null): string {
  if (!enterAt) return 'From the start';
  return `HP ≤ ${enterAt[0]}/${enterAt[1]}`;
}

function IntentLine({ intent }: { intent: BossIntentDef | undefined }): ReactElement | null {
  if (!intent) return null;
  return (
    <li>
      <span className="ww-boss__intent-name">{intent.name}</span> {intent.text}
    </li>
  );
}

function BossEntry({ boss, content, animated }: { boss: BossDef; content: ContentRegistry; animated: boolean }): ReactElement {
  const intentIds = [...new Set(boss.phases.flatMap((p) => p.intents))];
  const hp = bossHpSummary(content, boss);
  const coop = bossCoopIntentText(content, boss);
  return (
    <CodexEntry
      className="ww-entry--wide ww-entry--boss"
      art={<BossArt bossId={boss.id} size={190} animated={animated} />}
      title={boss.name}
      subtitle={boss.epithet}
      badges={
        <span className="ww-badge ww-badge--gold">
          HP {hp.vigil} (Vigil) · {hp.lastFlame} (Last Flame)
        </span>
      }
      flavor={boss.flavor}
    >
      <Facts>
        <Fact label="Special">{boss.specialText}</Fact>
        <Fact label="Weakness">{boss.weaknessText}</Fact>
        {coop && <Fact label="Co-op">{coop}, every Snuff Move.</Fact>}
        <Fact label="Immune">{boss.immune.map((i) => i.replace(/_/g, ' ')).join(', ')}</Fact>
      </Facts>
      <ol className="ww-boss__phases">
        {boss.phases.map((phase, i) => (
          <li key={i} className="ww-boss__phase">
            <span className="ww-boss__phase-num ww-num">{i + 1}</span>
            <div>
              <p className="ww-boss__phase-head">
                Phase {i + 1} · {enterText(phase.enterAt)} · {patternSummary(phase.move)}
              </p>
              <p className="ww-dim">{phase.intents.map((id) => content.bossIntents.byId[id]?.name ?? id).join(' · ')}</p>
              {phase.banner && <p className="ww-flavor">{phase.banner}</p>}
            </div>
          </li>
        ))}
      </ol>
      <ul className="ww-boss__intents">
        {intentIds.map((id) => (
          <IntentLine key={id} intent={content.bossIntents.byId[id]} />
        ))}
      </ul>
    </CodexEntry>
  );
}

export function BossesSection({ content, query, animated }: SectionProps): ReactElement {
  const bosses = content.bosses.list.filter((b) =>
    matchesQuery(query, [b.name, b.epithet, b.specialText, b.weaknessText, b.flavor, ...b.phases.flatMap((p) => p.intents.map((i) => content.bossIntents.byId[i]?.name))]),
  );
  if (bosses.length === 0) return <EmptyResult query={query} />;
  return (
    <div className="ww-codex__list">
      {bosses.map((boss) => (
        <BossEntry key={boss.id} boss={boss} content={content} animated={animated} />
      ))}
    </div>
  );
}

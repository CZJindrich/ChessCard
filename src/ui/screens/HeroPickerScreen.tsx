/**
 * "Choose your Lanternwarden" (GDD §15.1.2): four large hero cards; one click resolves the
 * Quick Play / Quick Last Flame / tutorial config through the presets and opens the game.
 */
import type { CSSProperties, ReactElement } from 'react';
import { HOUSES, PieceArt, RuneIcon } from '../../art';
import { resolveConfig } from '../../config';
import type { ConfigSelection } from '../../config';
import type { ContentRegistry } from '../../engine/types';
import { heroPickSelection, prepareLaunch } from '../app/launch';
import type { HeroPickMode } from '../app/navigation';
import { useContentState, usePresentation, useProfile, useServices, useUiSound } from '../app/services';
import { ScreenFrame } from '../components/ScreenFrame';
import { StatPills } from '../components/StatPills';
import { WaxDrips } from '../components/WaxDrips';
import { heroView, type HeroView } from '../model/describe';
import { MODE_SUBTITLES } from './TitleScreen';
import './heroPicker.css';

const LAST_FLAME_PRIMER = [
  'The most Glory wins.',
  'The Gloam ring closes in as the Nights pass.',
  'No fighting rivals on Night 1.',
] as const;

const DIFFICULTY_WORD: Readonly<Record<string, string>> = { candlelit: 'Candlelit', dusk: 'Dusk', midnight: 'Midnight', witching_hour: 'Witching Hour' };

/** One line on what the click will start, derived from the resolved preset. */
export function launchSummary(selection: ConfigSelection, content: ContentRegistry): string {
  const { config, derived } = resolveConfig(selection, { content });
  const nights = `${config.nights} Nights`;
  const difficulty = DIFFICULTY_WORD[config.difficulty] ?? config.difficulty;
  if (selection.mode === 'last_flame') {
    const bots = config.seats.filter((s) => s.kind !== 'human').length;
    return `You and ${bots} Warden bots · ${derived.boardSize.replace('x', '×')} · ${nights} · ${difficulty}`;
  }
  if (selection.flags.firstGame) return 'Night 1 · First Vigil — Survive 4 rounds. Keep the Candles lit.';
  const boss = config.boss_choice === 'random' ? 'a random boss' : (content.bosses.byId[config.boss_choice]?.name ?? config.boss_choice);
  return `Solo Vigil · ${nights} · ${difficulty} · ${boss} waits on the last Night`;
}

const MODE_TITLES: Readonly<Record<HeroPickMode, string>> = {
  quick_play: MODE_SUBTITLES.vigil,
  quick_last_flame: MODE_SUBTITLES.last_flame,
  tutorial: 'The First Vigil — a guided first Night',
};

function HeroCard({ hero, animated, onPick }: { hero: HeroView; animated: boolean; onPick: () => void }): ReactElement {
  const play = useUiSound();
  return (
    <button
      type="button"
      className="ww-hero-card"
      aria-label={`Play as ${hero.displayName}`}
      style={{ '--ww-hero-flame': hero.flame } as CSSProperties}
      onPointerEnter={() => play('hover')}
      onClick={onPick}
    >
      <WaxDrips tone="tallow" offset={hero.id.length * 23} className="ww-hero-card__drips" />
      <span className="ww-hero-card__art" aria-hidden="true">
        <span className="ww-hero-card__glow" />
        <PieceArt defId={hero.id} kind="hero" houseColor={HOUSES.house_beeswax.color} size={168} showStats={false} showPips={false} animated={animated} />
      </span>
      <span className="ww-hero-card__name">
        <span className="ww-hero-card__first">{hero.firstName}</span>
        <span className="ww-hero-card__title">{hero.title}</span>
      </span>
      <span className="ww-hero-card__stats">
        <span className="ww-hero-card__rune" title={hero.move}>
          <RuneIcon id={hero.rune} pips={hero.pips} size={30} />
          {hero.strikeRune && <RuneIcon id={hero.strikeRune} size={30} />}
          <span className="ww-hero-card__moves">
            <span>{hero.move}</span>
            {hero.strikeName && <span className="ww-hero-card__strike">Strikes: {hero.strikeName}</span>}
          </span>
        </span>
        <StatPills hp={hero.hp} atk={hero.atk} />
      </span>
      <span className="ww-hero-card__pitch">{hero.pitch}</span>
      <span className="ww-hero-card__power">
        <span className="ww-hero-card__power-name">
          {hero.powerName}
          <span className="ww-hero-card__cost">
            {hero.powerCost} Flame
          </span>
        </span>
        <span className="ww-hero-card__power-text">{hero.powerText}</span>
      </span>
      <span className="ww-hero-card__cta" aria-hidden="true">
        Light the vigil
      </span>
    </button>
  );
}

export function HeroPickerScreen({ mode }: { mode: HeroPickMode }): ReactElement {
  const services = useServices();
  const profile = useProfile();
  const presentation = usePresentation();
  const content = useContentState();
  const heroes = content.registry.heroes.list.map((h) => heroView(content.registry, h));
  const sample = heroPickSelection(mode, profile, heroes[0]?.id ?? '', content.registry);
  const showPrimer = mode === 'quick_last_flame' && !profile.firstLastFlameDone;

  const pick = (heroId: string): void => {
    services.audio.play('uiConfirm');
    const selection = heroPickSelection(mode, profile, heroId, content.registry);
    const result = prepareLaunch(selection, {
      content: content.registry,
      modded: content.modded,
      now: services.env.now(),
      randomSeed: services.env.randomSeed,
    });
    if (!result.ok) {
      services.toasts.show({ title: 'This game cannot start', lines: result.issues.map((i) => i.message), tone: 'warning' });
      return;
    }
    services.nav.push({ screen: 'game', config: result.config, selection: result.selection });
  };

  return (
    <ScreenFrame title="Choose your Lanternwarden" subtitle={MODE_TITLES[mode]} bodyClassName="ww-hero-pick">
      <p className="ww-hero-pick__summary">{launchSummary(sample, content.registry)}</p>
      {showPrimer && (
        <ul className="ww-hero-pick__primer" aria-label="Last Flame in three lines">
          {LAST_FLAME_PRIMER.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <div className="ww-hero-pick__grid">
        {heroes.map((hero) => (
          <HeroCard key={hero.id} hero={hero} animated={!presentation.reduced_motion} onPick={() => pick(hero.id)} />
        ))}
      </div>
      <p className="ww-hero-pick__foot">One click lights the first Night.</p>
    </ScreenFrame>
  );
}

/**
 * Title (GDD §15.1): the Moth-Moon over Sconcewick, the WICKWATCH logo, and the menu from
 * largest to smallest: QUICK PLAY (gold, pulsing), Quick Last Flame, New Game, Join Online,
 * How to Play, Codex, Settings.
 */
import type { ReactElement } from 'react';
import { TitleScene } from '../../art';
import { ENGINE_VERSION } from '../../engine/types';
import { usePresentation, useProfile, useServices } from '../app/services';
import { Button, IconButton } from '../components/Button';
import { Logo } from '../components/Logo';
import './title.css';

export const MODE_SUBTITLES = {
  vigil: 'Vigil — team up against the Snuff',
  last_flame: 'Last Flame — every candle for itself',
} as const;

export function TitleScreen(): ReactElement {
  const { nav, presentation: presentationStore } = useServices();
  const presentation = usePresentation();
  const profile = useProfile();
  const firstGame = profile.gamesCompleted === 0;

  return (
    <TitleScene reducedMotion={presentation.reduced_motion} className="ww-title-screen">
      <div className="ww-title">
        <header className="ww-title__brand">
          <Logo />
          <p className="ww-title__tagline">Living candles hold back the smoke until dawn.</p>
        </header>

        <nav className="ww-title__menu" aria-label="Main menu">
          <Button
            variant="primary"
            size="xl"
            seal="flame"
            pulse
            drips
            sound="confirm"
            className="ww-title__quick"
            subtitle={MODE_SUBTITLES.vigil}
            onClick={() => nav.push({ screen: 'hero_pick', mode: 'quick_play' })}
          >
            Quick Play
          </Button>
          {firstGame && <p className="ww-title__hint">Your first Night is a guided one: the First Vigil.</p>}
          <Button
            size="lg"
            seal="swords"
            sound="confirm"
            className="ww-title__lastflame"
            subtitle={MODE_SUBTITLES.last_flame}
            onClick={() => nav.push({ screen: 'hero_pick', mode: 'quick_last_flame' })}
          >
            Quick Last Flame
          </Button>
          <div className="ww-title__pair">
            <Button size="md" seal="quill" subtitle="Seats, rules and presets" onClick={() => nav.push({ screen: 'setup' })}>
              New Game
            </Button>
            <Button size="md" seal="door" subtitle="Enter a room code" onClick={() => nav.push({ screen: 'lobby', role: 'join' })}>
              Join Online
            </Button>
          </div>
          <div className="ww-title__minor">
            <Button size="sm" variant="ghost" icon="book" onClick={() => nav.push({ screen: 'how_to_play' })}>
              How to Play
            </Button>
            <Button size="sm" variant="ghost" icon="scroll" onClick={() => nav.push({ screen: 'codex' })}>
              Codex
            </Button>
            <Button size="sm" variant="ghost" icon="gear" onClick={() => nav.push({ screen: 'settings' })}>
              Settings
            </Button>
          </div>
        </nav>

        <footer className="ww-title__footer">
          <span className="ww-title__version">v{ENGINE_VERSION}</span>
          <IconButton
            icon={presentation.mute ? 'mute' : 'sound'}
            label={presentation.mute ? 'Unmute sound' : 'Mute sound'}
            onClick={() => presentationStore.set({ mute: !presentation.mute })}
          />
        </footer>
      </div>
    </TitleScene>
  );
}

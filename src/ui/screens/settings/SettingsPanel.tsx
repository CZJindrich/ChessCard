/**
 * Presentation settings (GDD §14.4), applied live. Visual keys go through the presentation
 * store; volumes go straight to the audio mixer via useAudioSettings (it persists them under
 * `chesscard.audio`, and the presentation store mirrors them).
 */
import type { ReactElement, ReactNode } from 'react';
import { HOUSES, PieceArt } from '../../../art';
import { useAudioSettings } from '../../../audio';
import { ANIMATION_SPEEDS, CONFIRM_END_TURN, ENEMY_TURN_SPEEDS, PRESENTATION_LABELS, TUTORIAL_HINTS, UI_SCALE } from '../../../config';
import type { PresentationSettings } from '../../../config';
import { usePresentation, useServices } from '../../app/services';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { Slider } from '../../components/Slider';
import { Stepper } from '../../components/Stepper';
import { Toggle } from '../../components/Toggle';
import './settings.css';

type Key = keyof PresentationSettings;

const OPTION_TEXT: Readonly<Record<string, string>> = {
  normal: 'Normal',
  fast: 'Fast ×2',
  instant: 'Instant',
  smart: 'Smart',
  always: 'Always',
  never: 'Never',
  auto: 'Auto',
  on: 'On',
  off: 'Off',
};

function Setting({ k, children, note }: { k: Key; children: ReactNode; note?: string | null }): ReactElement {
  const meta = PRESENTATION_LABELS[k];
  return (
    <div className="ww-setting">
      <div className="ww-setting__text">
        <span className="ww-setting__label">{meta.label}</span>
        <span className="ww-setting__help">{note ?? meta.help}</span>
      </div>
      <div className="ww-setting__control">{children}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="ww-settings__group" aria-label={title}>
      <h3 className="ww-settings__title">{title}</h3>
      {children}
    </section>
  );
}

const percent = (v: number): string => `${v}%`;

export function SettingsPanel({ showPreview = true }: { showPreview?: boolean }): ReactElement {
  const { presentation: store } = useServices();
  const settings = usePresentation();
  const [audio, setAudio] = useAudioSettings();
  const set = (patch: Partial<PresentationSettings>): void => store.set(patch);
  const vol = (level: number): number => Math.round(level * 100);

  return (
    <div className="ww-settings">
      <div className="ww-settings__columns">
        <div className="ww-settings__column">
          <Group title="Motion">
            <Setting k="animation_speed">
              <Segmented
                label="Animation speed"
                value={settings.animation_speed}
                options={ANIMATION_SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
                onChange={(animation_speed) => set({ animation_speed })}
              />
            </Setting>
            <Setting k="enemy_turn_speed">
              <Segmented
                label="Enemy turn speed"
                value={settings.enemy_turn_speed}
                options={ENEMY_TURN_SPEEDS.map((s) => ({ value: s, label: OPTION_TEXT[s] ?? s }))}
                onChange={(enemy_turn_speed) => set({ enemy_turn_speed })}
              />
            </Setting>
            <Setting k="reduced_motion">
              <Toggle label="Reduced motion" checked={settings.reduced_motion} onChange={(reduced_motion) => set({ reduced_motion })} />
            </Setting>
            <Setting k="screen_shake" note={settings.reduced_motion ? 'Off while Reduced motion is on.' : null}>
              <Toggle
                label="Screen shake"
                checked={settings.screen_shake && !settings.reduced_motion}
                disabledReason={settings.reduced_motion ? 'Reduced motion turns shake off' : null}
                onChange={(screen_shake) => set({ screen_shake })}
              />
            </Setting>
          </Group>
          <Group title="Readability">
            <Setting k="readable_font">
              <Toggle label="Readable font" checked={settings.readable_font} onChange={(readable_font) => set({ readable_font })} />
            </Setting>
            <Setting k="bold_outlines">
              <Toggle label="Bold outlines" checked={settings.bold_outlines} onChange={(bold_outlines) => set({ bold_outlines })} />
            </Setting>
            <Setting k="ui_scale">
              <Stepper label="UI scale" value={settings.ui_scale} min={UI_SCALE.min} max={UI_SCALE.max} step={UI_SCALE.step} format={percent} onChange={(ui_scale) => set({ ui_scale })} />
            </Setting>
          </Group>
        </div>
        <div className="ww-settings__column">
          <Group title="Play">
            <Setting k="confirm_end_turn">
              <Segmented
                label="Confirm End Turn"
                value={settings.confirm_end_turn}
                options={CONFIRM_END_TURN.map((s) => ({ value: s, label: OPTION_TEXT[s] ?? s }))}
                onChange={(confirm_end_turn) => set({ confirm_end_turn })}
              />
            </Setting>
            <Setting k="tutorial_hints">
              <Segmented
                label="Tutorial hints"
                value={settings.tutorial_hints}
                options={TUTORIAL_HINTS.map((s) => ({ value: s, label: OPTION_TEXT[s] ?? s }))}
                onChange={(tutorial_hints) => set({ tutorial_hints })}
              />
            </Setting>
          </Group>
          <Group title="Sound">
            <Setting k="master_volume">
              <Slider label="Master volume" value={vol(audio.master)} min={0} max={100} format={percent} disabled={audio.muted} onChange={(v) => setAudio({ master: v / 100 })} />
            </Setting>
            <Setting k="sfx_volume">
              <Slider label="Sound effects" value={vol(audio.sfx)} min={0} max={100} format={percent} disabled={audio.muted} onChange={(v) => setAudio({ sfx: v / 100 })} />
            </Setting>
            <Setting k="music_volume">
              <Slider label="Music" value={vol(audio.music)} min={0} max={100} format={percent} disabled={audio.muted} onChange={(v) => setAudio({ music: v / 100 })} />
            </Setting>
            <Setting k="mute">
              <Toggle label="Mute" checked={audio.muted} onChange={(muted) => setAudio({ muted })} />
            </Setting>
          </Group>
          {showPreview && <SettingsPreview settings={settings} />}
        </div>
      </div>
      <div className="ww-settings__actions">
        <Button size="sm" variant="ghost" icon="reset" sound="back" onClick={() => store.reset()}>
          Restore defaults
        </Button>
      </div>
    </div>
  );
}

/** A live sample so font and outline changes are visible at once. */
function SettingsPreview({ settings }: { settings: PresentationSettings }): ReactElement {
  return (
    <div className="ww-settings__preview" aria-label="Preview">
      <PieceArt defId="sconce_paladin" kind="hero" houseColor={HOUSES.house_beeswax.color} size={64} hp={8} maxHp={8} atk={2} ready animated={!settings.reduced_motion} />
      <PieceArt defId="sootling" side="snuff" kind="enemy" size={56} hp={1} atk={1} animated={!settings.reduced_motion} />
      <div className="ww-settings__sample">
        <p className="ww-settings__sample-title">Shield Bash</p>
        <p className="ww-settings__sample-rules">Deal 2 damage to an enemy adjacent to your hero and push it 2 tiles away.</p>
        <p className="ww-flavor">A pillar of good tallow does not bend.</p>
      </div>
    </div>
  );
}

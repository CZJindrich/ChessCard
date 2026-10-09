/**
 * Preset chips (§14.3): Short, Standard, Long, Daily and the three local Custom presets.
 * An empty Custom chip saves the current settings into its slot; a filled one loads them.
 * "Manage" renames, overwrites or clears slots.
 */
import { useState, type ReactElement } from 'react';
import { CUSTOM_PRESET_SLOTS, setCustomPreset } from '../../../config';
import type { CustomPreset, LocalProfile, PresetChip } from '../../../config';
import type { ContentRegistry, LengthId } from '../../../engine/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Modal } from '../../components/Modal';
import { customChip } from './setupModel';

export interface PresetChipsProps {
  content: ContentRegistry;
  profile: LocalProfile;
  active: PresetChip;
  /** Reason the Daily chip is unavailable (mods), or null. */
  dailyReason: string | null;
  dailyHint: string;
  currentCode: string;
  onLength: (length: LengthId) => void;
  onDaily: () => void;
  onLoadCustom: (preset: CustomPreset) => void;
  onProfile: (next: LocalProfile, message: string) => void;
}

function slotName(slot: number): string {
  return `Custom ${slot + 1}`;
}

function ManagePresets({ open, onClose, props }: { open: boolean; onClose: () => void; props: PresetChipsProps }): ReactElement {
  const { profile } = props;
  const [names, setNames] = useState<string[]>(() => profile.customPresets.map((p, i) => p?.name ?? slotName(i)));
  const save = (slot: number): void => {
    const name = names[slot]?.trim() || slotName(slot);
    props.onProfile(setCustomPreset(profile, slot, { name, code: props.currentCode }), `Saved to ${name}`);
  };
  const clear = (slot: number): void => props.onProfile(setCustomPreset(profile, slot, null), `${slotName(slot)} cleared`);
  return (
    <Modal open={open} title="Custom presets" onClose={onClose} size="sm" footer={<Button onClick={onClose}>Done</Button>}>
      <p className="ww-dim ww-presets__intro">Presets are saved on this device as settings codes. Seat names stay local.</p>
      <ul className="ww-presets__slots">
        {Array.from({ length: CUSTOM_PRESET_SLOTS }, (_, slot) => {
          const preset = profile.customPresets[slot];
          return (
            <li key={slot} className="ww-presets__slot">
              <input
                className="ww-input"
                value={names[slot] ?? ''}
                maxLength={24}
                aria-label={`${slotName(slot)} name`}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setNames((list) => list.map((n, i) => (i === slot ? value : n)));
                }}
              />
              <Button size="sm" icon="save" onClick={() => save(slot)}>
                {preset ? 'Overwrite' : 'Save here'}
              </Button>
              <Button size="sm" variant="ghost" icon="close" sound="back" disabledReason={preset ? null : 'Empty slot'} onClick={() => clear(slot)}>
                Clear
              </Button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export function PresetChips(props: PresetChipsProps): ReactElement {
  const [managing, setManaging] = useState(false);
  const { content, profile, active } = props;
  return (
    <div className="ww-presets" role="group" aria-label="Presets">
      <div className="ww-chip-row">
        {content.lengths.list.map((length) => (
          <Chip key={length.id} selected={active === length.id} hint={length.targetTime} onSelect={() => props.onLength(length.id)}>
            {length.name}
          </Chip>
        ))}
        <Chip selected={active === 'daily'} disabledReason={props.dailyReason} hint={props.dailyHint} onSelect={props.onDaily}>
          Daily
        </Chip>
        <span className="ww-presets__divider" aria-hidden="true" />
        {profile.customPresets.map((preset, slot) =>
          preset ? (
            <Chip key={slot} selected={active === customChip(slot)} hint={`Load “${preset.name}”`} onSelect={() => props.onLoadCustom(preset)}>
              {preset.name}
            </Chip>
          ) : (
            <Chip
              key={slot}
              className="ww-chip--empty"
              hint="Empty: click to save the current settings here"
              onSelect={() => props.onProfile(setCustomPreset(profile, slot, { name: slotName(slot), code: props.currentCode }), `Saved to ${slotName(slot)}`)}
            >
              + {slotName(slot)}
            </Chip>
          ),
        )}
        <button type="button" className="ww-link-btn ww-presets__manage" onClick={() => setManaging(true)}>
          Manage
        </button>
      </div>
      {managing && <ManagePresets open={managing} onClose={() => setManaging(false)} props={props} />}
    </div>
  );
}

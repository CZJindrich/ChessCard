/**
 * The host's settings in the lobby: the Basic options from Setup (difficulty, length, boss,
 * board), the turn timer and the reconnect grace. Every change goes to the server, which
 * clears every Ready flag. "All settings" goes back to Setup with the room kept open.
 */
import type { ReactElement } from 'react';
import { RECONNECT_GRACE_RANGE, resolveConfig } from '../../../config';
import type { ConfigSelection } from '../../../config';
import type { ContentRegistry, GameConfig, TurnTimer } from '../../../engine/types';
import type { RoomSnapshot } from '../../../net';
import { prepareLaunch } from '../../app/launch';
import { useServices } from '../../app/services';
import { Button } from '../../components/Button';
import { Segmented, type SegmentOption } from '../../components/Chip';
import { Panel } from '../../components/Panel';
import { InfoTip } from '../../components/Tooltip';
import { BasicOptions } from '../setup/BasicOptions';
import { setDifficulty, setLength, setOverride } from '../setup/setupModel';

export interface HostSettingsProps {
  room: RoomSnapshot;
  selection: ConfigSelection;
  content: ContentRegistry;
  modded: boolean;
  onChange(config: GameConfig, selection: ConfigSelection, reconnectGrace?: number): void;
  onEditAll(selection: ConfigSelection): void;
}

const TIMERS: readonly TurnTimer[] = ['off', 'slow', 'normal', 'fast'];
const GRACES: readonly number[] = [60, 120, 300];

function Row({ label, help, children }: { label: string; help: string; children: ReactElement }): ReactElement {
  return (
    <div className="ww-option">
      <div className="ww-option__label">
        <span>{label}</span>
        <InfoTip text={help} label={`About ${label}`} />
      </div>
      {children}
    </div>
  );
}

export function HostSettings({ room, selection, content, modded, onChange, onEditAll }: HostSettingsProps): ReactElement {
  const services = useServices();
  const resolved = resolveConfig(selection, { online: true, content });
  const seats = room.config.seats;

  const apply = (next: ConfigSelection, grace?: number): void => {
    const result = prepareLaunch(next, { content, modded, now: services.env.now(), randomSeed: services.env.randomSeed, online: true });
    if (!result.ok) {
      services.toasts.show({ title: 'Those settings do not work together', lines: result.issues.map((i) => i.message), tone: 'warning' });
      return;
    }
    onChange(result.config, result.selection, grace);
  };

  const timerOptions: Array<SegmentOption<TurnTimer>> = TIMERS.map((t) => ({
    value: t,
    label: t === 'off' ? 'Off' : `${t[0].toUpperCase()}${t.slice(1)} · ${content.rules.timers.turn[t]} s`,
    hint: t === 'off' ? 'No limit; a player idle for 3 minutes is treated as disconnected.' : `${content.rules.timers.turn[t]} s per seat turn.`,
  }));
  const graceOptions: Array<SegmentOption<number>> = GRACES.map((g) => ({
    value: g,
    label: g < 120 ? `${g} s` : `${g / 60} min`,
    hint: `A disconnected player keeps their seat for ${g} s (at most ${RECONNECT_GRACE_RANGE.activeTurnCap} s during their own turn).`,
  }));

  return (
    <Panel
      title="Settings"
      drips="plum"
      dripOffset={90}
      className="ww-lobby__panel ww-lobby__settings"
      actions={
        <Button size="sm" variant="ghost" icon="quill" onClick={() => onEditAll(selection)}>
          All settings
        </Button>
      }
    >
      <BasicOptions
        content={content}
        config={resolved.config}
        derived={resolved.derived}
        validation={resolved.validation}
        dailyLock={null}
        onDifficulty={(d) => apply(setDifficulty(selection, d, seats, content))}
        onLength={(l) => apply(setLength(selection, l, seats))}
        onBoss={(b) => apply(setOverride(selection, 'boss_choice', b))}
        onBoardSize={(b) => apply(setOverride(selection, 'board_size', b))}
      />
      <div className="ww-basic">
        <Row label="Turn timer" help="Per seat turn. Online the Vigil uses it times the number of seats for the whole players phase.">
          <Segmented label="Turn timer" options={timerOptions} value={resolved.config.turn_timer} onChange={(t) => apply(setOverride(selection, 'turn_timer', t))} />
        </Row>
        <Row label="Reconnect grace" help="How long a disconnected player keeps their seat before a Warden bot takes it.">
          <Segmented
            label="Reconnect grace"
            options={graceOptions}
            value={GRACES.includes(room.reconnectGrace) ? room.reconnectGrace : 120}
            onChange={(g) => apply(selection, g)}
          />
        </Row>
      </div>
      <p className="ww-lobby__fine">Any change clears every Ready.</p>
    </Panel>
  );
}

/** "This game" at a glance: the values the presets and rules resolve to (board, Nights, Dread or Gloam). */
import type { ReactElement } from 'react';
import type { DerivedConfig } from '../../../config';
import type { ContentRegistry, GameConfig, GloamClosing } from '../../../engine/types';
import { Panel } from '../../components/Panel';

function onOff(value: boolean): string {
  return value ? 'on' : 'off';
}

function closingText(c: GloamClosing, bossNight: number): string {
  const when = c.night === bossNight ? `boss round ${c.round}` : `Dawn of Night ${c.night}`;
  return `${when} → ${c.openSize}×${c.openSize}`;
}

export interface SummaryLine {
  label: string;
  value: string;
}

/** The summary as plain lines (also used by tests). */
export function summaryLines(config: GameConfig, derived: DerivedConfig, content: ContentRegistry): SummaryLine[] {
  const regular = derived.regularNights;
  const lines: SummaryLine[] = [
    { label: 'Board', value: derived.boardSize.replace('x', '×') },
    { label: 'Nights', value: `${config.nights}: ${regular} regular + the Boss Night · ${config.turns_per_night} rounds each` },
    { label: 'Night tiers', value: derived.tiers.length > 0 ? `${derived.tiers.join(', ')}, then 3 on the Boss Night` : 'Boss Night only (tier 3)' },
  ];
  if (derived.dreadThresholds) {
    const t = derived.dreadThresholds;
    lines.push({ label: 'Dread', value: `starts at ${config.starting_dread} of ${config.dread_max} · dims at ${t.dimming}, deep dark at ${t.deep_dark}` });
    lines.push({ label: 'Retry this Night', value: onOff(config.retry_night) });
  }
  if (derived.gloam) {
    lines.push({ label: 'Boss rounds', value: String(config.boss_rounds) });
    lines.push({ label: 'Gloam closes', value: derived.gloam.schedule.map((c) => closingText(c, config.nights)).join(' · ') });
    lines.push({ label: 'Truce', value: derived.truceNights.length > 0 ? `Night ${derived.truceNights.join(' and ')}` : 'none' });
  }
  const boss = config.boss_choice === 'random' ? 'random' : (content.bosses.byId[config.boss_choice]?.name ?? config.boss_choice);
  lines.push({ label: 'Boss', value: boss });
  lines.push({ label: 'Systems', value: `Tolls ${onOff(config.tolls)} · Moth Die ${onOff(config.moth_die)} · Boons ${onOff(config.boons)}` });
  lines.push({ label: 'Turn timer', value: derived.turnTimerSeconds === null ? 'off' : `${derived.turnTimerSeconds} s per seat turn` });
  return lines;
}

export function SummaryPanel({ config, derived, content }: { config: GameConfig; derived: DerivedConfig; content: ContentRegistry }): ReactElement {
  return (
    <Panel title="This game" drips="plum" dripOffset={170} className="ww-setup__summary">
      <dl className="ww-summary">
        {summaryLines(config, derived, content).map((line) => (
          <div key={line.label} className="ww-summary__row">
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

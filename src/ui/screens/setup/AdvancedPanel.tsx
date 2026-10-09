/**
 * The Advanced panel (§14.1): every parameter the current mode shows, each with its tooltip,
 * the layer it comes from, a reset for user overrides, and greyed options with reasons.
 */
import { useState, type ReactElement } from 'react';
import { RULE_PARAMS } from '../../../config';
import type { ConfigSelection, ConfigValidation, ParamSource, RuleParamDef } from '../../../config';
import type { ContentRegistry, GameConfig, RuleKey, RuleValues } from '../../../engine/types';
import { IconButton } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { Collapsible } from '../../components/Collapsible';
import { Stepper } from '../../components/Stepper';
import { Toggle } from '../../components/Toggle';
import { InfoTip } from '../../components/Tooltip';
import { advancedGroups, formatNumber, optionLabel, sourceLabel } from './paramLabels';

export interface AdvancedPanelProps {
  content: ContentRegistry;
  selection: ConfigSelection;
  config: GameConfig;
  sources: Record<RuleKey, ParamSource>;
  validation: ConfigValidation;
  /** Keys the Daily locks, with the reason. */
  lockedKeys: ReadonlyMap<RuleKey, string>;
  onSet: <K extends RuleKey>(key: K, value: RuleValues[K]) => void;
  onReset: (key: RuleKey) => void;
}

function SeedInput({ value, onCommit, lockReason }: { value: string; onCommit: (seed: string) => void; lockReason: string | null }): ReactElement {
  const [draft, setDraft] = useState(value === 'random' ? '' : value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value === 'random' ? '' : value);
  }
  const commit = (): void => onCommit(draft.trim() === '' ? 'random' : draft);
  return (
    <input
      className="ww-input ww-param__seed"
      value={draft}
      placeholder="random"
      maxLength={32}
      disabled={lockReason !== null}
      title={lockReason ?? undefined}
      aria-label="Seed"
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

function ParamControl({ def, props }: { def: RuleParamDef; props: AdvancedPanelProps }): ReactElement | null {
  const { config, validation, lockedKeys } = props;
  const key = def.key;
  const lock = lockedKeys.get(key) ?? null;
  const spec = def.spec;
  const value: unknown = config[key];
  switch (spec.kind) {
    case 'int':
    case 'float':
      return (
        <Stepper
          label={def.label}
          value={typeof value === 'number' ? value : 0}
          min={spec.min}
          max={spec.max}
          step={spec.kind === 'float' ? spec.step : 1}
          format={(n) => formatNumber(key, n)}
          disabledReason={lock}
          onChange={(n) => props.onSet(key, n as RuleValues[typeof key])}
        />
      );
    case 'bool':
      return <Toggle label={def.label} checked={value === true} disabledReason={lock} onChange={(on) => props.onSet(key, on as RuleValues[typeof key])} />;
    case 'enum': {
      const disabled = validation.disabled[key] ?? [];
      return (
        <Segmented
          label={def.label}
          value={String(value)}
          disabledReason={lock}
          options={spec.options.map((option) => ({
            value: option,
            label: optionLabel(key, option),
            disabledReason: disabled.find((d) => d.value === option)?.message ?? null,
          }))}
          onChange={(option) => props.onSet(key, option as RuleValues[typeof key])}
        />
      );
    }
    case 'seed':
      return <SeedInput value={String(value)} lockReason={lock} onCommit={(seed) => props.onSet('seed', seed)} />;
    case 'boss':
    case 'seats':
      return null;
  }
}

function ParamRow({ def, props }: { def: RuleParamDef; props: AdvancedPanelProps }): ReactElement {
  const source = props.sources[def.key];
  const issues = props.validation.issues.filter((i) => i.key === def.key);
  const overridden = source === 'override';
  const wide = def.spec.kind === 'enum' || def.spec.kind === 'seed';
  return (
    <div className={['ww-param', wide && 'ww-param--wide', overridden && 'ww-param--custom'].filter(Boolean).join(' ')}>
      <div className="ww-param__label">
        <span>{def.label}</span>
        <InfoTip text={def.tooltip} label={`About ${def.label}`} />
      </div>
      <div className="ww-param__control">
        <ParamControl def={def} props={props} />
      </div>
      <div className="ww-param__source">
        <span className={overridden ? 'ww-badge ww-badge--gold' : 'ww-badge'}>{sourceLabel(source, props.selection, props.content)}</span>
        {overridden && !props.lockedKeys.has(def.key) && <IconButton icon="reset" label={`Reset ${def.label}`} sound="back" className="ww-param__reset" onClick={() => props.onReset(def.key)} />}
      </div>
      {issues.length > 0 && (
        <ul className="ww-issues ww-param__issues">
          {issues.map((issue) => (
            <li key={issue.reason}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How many parameters the player changed by hand (seats are counted by the seat cards). */
export function overrideCount(sources: Record<RuleKey, ParamSource>, keys: readonly RuleKey[]): number {
  return keys.filter((k) => sources[k] === 'override').length;
}

export function AdvancedPanel(props: AdvancedPanelProps): ReactElement {
  const groups = advancedGroups(props.config.mode);
  const changed = overrideCount(props.sources, groups.flatMap((g) => g.params.map((p) => p.key)));
  return (
    <Collapsible title="Advanced" summary={changed > 0 ? `${changed} changed` : `${groups.reduce((n, g) => n + g.params.length, 0)} rules`} className="ww-advanced">
      {groups.map((group) => (
        <section key={group.title} className="ww-advanced__group" aria-label={group.title}>
          <h3 className="ww-advanced__title">{group.title}</h3>
          <div className="ww-advanced__rows">
            {group.params.map((def) => (
              <ParamRow key={def.key} def={RULE_PARAMS[def.key] as RuleParamDef} props={props} />
            ))}
          </div>
        </section>
      ))}
    </Collapsible>
  );
}

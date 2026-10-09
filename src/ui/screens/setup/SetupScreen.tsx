/**
 * New Game (GDD §15.1.3). Left: mode toggle with subtitles and up to 4 seat cards. Right:
 * preset chips, Basic options and the collapsible Advanced panel. Bottom: Start, Host Online,
 * Copy settings code and Paste code. Everything is one ConfigSelection resolved on each render.
 */
import { useMemo, useState, type ReactElement } from 'react';
import { bossForSeed, dailySeed, decodeSettingsCode, encodeSettingsCode, HOST_OPTION_DEFAULTS, resolveConfig, utcDateString } from '../../../config';
import type { ConfigSelection, CustomPreset, LocalProfile } from '../../../config';
import { reasonText } from '../../../engine/content';
import type { ModeId, RuleKey, RuleValues, SeatConfig, SeatKind } from '../../../engine/types';
import { prepareLaunch } from '../../app/launch';
import { useContentState, useProfile, useServices } from '../../app/services';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { InfoTip } from '../../components/Tooltip';
import { Toggle } from '../../components/Toggle';
import { Modal } from '../../components/Modal';
import { Panel } from '../../components/Panel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { MODE_SUBTITLES } from '../TitleScreen';
import { AdvancedPanel } from './AdvancedPanel';
import { BasicOptions } from './BasicOptions';
import { codeNotices } from './codeNotices';
import { SummaryPanel } from './SummaryPanel';
import { PresetChips } from './PresetChips';
import { SeatCard } from './SeatCard';
import {
  addSeat,
  activeChip,
  clearOverride,
  dailyFor,
  heroTakenBy,
  initialSetupSelection,
  MAX_SEATS,
  removeSeat,
  setDifficulty,
  setLength,
  setMode,
  setOverride,
  setSeatHero,
  setSeatKind,
  setSeatName,
  withSeats,
} from './setupModel';
import './setup.css';

/** Keys the Daily fixes (§14.3), beyond the ones validateConfig reports. */
const DAILY_LOCKED_KEYS: readonly RuleKey[] = ['retry_night', 'seed'];

function PasteCodeDialog({ onClose, onApply }: { onClose: () => void; onApply: (code: string) => string | null }): ReactElement {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = (): void => setError(onApply(code));
  return (
    <Modal
      open
      title="Paste a settings code"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" sound="back" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" sound="confirm" disabledReason={code.trim() ? null : 'Paste a code first'} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <label className="ww-field">
        <span className="ww-field__label">Settings code</span>
        <textarea className="ww-textarea" value={code} placeholder="WAX1:…" spellCheck={false} onChange={(event) => setCode(event.currentTarget.value)} />
      </label>
      {error && (
        <ul className="ww-issues ww-setup__paste-error">
          <li>{error}</li>
        </ul>
      )}
    </Modal>
  );
}

function CopyFallbackDialog({ code, onClose }: { code: string; onClose: () => void }): ReactElement {
  return (
    <Modal open title="Settings code" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <p className="ww-dim">Copy this code and share it; pasting it rebuilds these settings.</p>
      <textarea className="ww-textarea ww-setup__code" readOnly value={code} onFocus={(event) => event.currentTarget.select()} aria-label="Settings code" />
    </Modal>
  );
}

export function SetupScreen({ initial }: { initial?: ConfigSelection }): ReactElement {
  const services = useServices();
  const profile = useProfile();
  const content = useContentState();
  const registry = content.registry;
  const [selection, setSelection] = useState<ConfigSelection>(() => initial ?? initialSetupSelection(profile.playerName));
  const [dialog, setDialog] = useState<null | { kind: 'paste' } | { kind: 'copy'; code: string }>(null);
  const [privacy, setPrivacy] = useState(HOST_OPTION_DEFAULTS.hot_seat_privacy);

  const resolved = useMemo(() => resolveConfig({ ...selection, flags: { ...selection.flags, modded: content.modded } }, { content: registry }), [selection, content.modded, registry]);
  const { config, derived, sources, validation } = resolved;
  const seats = config.seats;
  const daily = selection.flags.daily;
  const dailyLock = daily ? reasonText('CFG_DAILY_LOCKED', {}, registry) : null;
  const currentCode = encodeSettingsCode(selection, content.hash, registry);
  const chip = activeChip(selection, profile, content.hash, registry);

  const updateSeats = (next: SeatConfig[]): void => setSelection((sel) => withSeats(sel, next));
  const seatDisabled = (value: string): string | null => validation.disabled.seats?.find((d) => d.value === value)?.message ?? null;
  const lockedKeys = new Map<RuleKey, string>(daily && dailyLock ? DAILY_LOCKED_KEYS.map((k) => [k, dailyLock]) : []);

  const today = utcDateString(services.env.now());
  const dailyBoss = registry.bosses.byId[bossForSeed(dailySeed(today), registry)]?.name ?? 'a boss';
  const dailyReason = content.modded ? 'Mods disable the Daily' : null;

  const launch = (online: boolean): void => {
    const result = prepareLaunch(selection, { content: registry, modded: content.modded, now: services.env.now(), randomSeed: services.env.randomSeed, online });
    if (!result.ok) {
      services.toasts.show({ title: 'Fix these first', lines: result.issues.map((i) => i.message), tone: 'warning' });
      return;
    }
    services.nav.replace({ screen: 'setup', selection });
    if (online) services.nav.push({ screen: 'lobby', role: 'host', config: result.config, selection: result.selection });
    else services.nav.push({ screen: 'game', config: result.config, selection: result.selection, hostOptions: { hot_seat_privacy: privacy } });
  };

  const copyCode = (): void => {
    const clipboard = services.env.clipboard;
    if (!clipboard) {
      setDialog({ kind: 'copy', code: currentCode });
      return;
    }
    clipboard.writeText(currentCode).then(
      () => services.toasts.show({ title: 'Settings code copied', lines: [currentCode], tone: 'success' }),
      () => setDialog({ kind: 'copy', code: currentCode }),
    );
  };

  const applyCode = (code: string): string | null => {
    const decoded = decodeSettingsCode(code, { contentHash: content.hash, content: registry });
    if (!decoded.ok) return decoded.error;
    setSelection(decoded.value.selection);
    setDialog(null);
    const notices = codeNotices(decoded.value);
    services.toasts.show({ title: 'Settings code applied', lines: notices, tone: notices.length > 0 ? 'warning' : 'success' });
    return null;
  };

  const loadCustom = (preset: CustomPreset): void => {
    const decoded = decodeSettingsCode(preset.code, { contentHash: content.hash, content: registry });
    if (!decoded.ok) {
      services.toasts.show({ title: `${preset.name} could not be loaded`, lines: [decoded.error], tone: 'warning' });
      return;
    }
    setSelection(decoded.value.selection);
    const notices = codeNotices(decoded.value);
    if (notices.length > 0) services.toasts.show({ title: `${preset.name} loaded with changes`, lines: notices, tone: 'warning' });
  };

  const saveProfile = (next: LocalProfile, message: string): void => {
    services.profile.update(() => next);
    services.toasts.show({ title: message, tone: 'success' });
  };

  const addKind: SeatKind = 'bot_warden';
  const addLabel = config.mode === 'vigil' ? 'Add AI ally' : 'Add bot';
  const otherIssues = validation.issues.filter((i) => i.key === 'seats' || i.key === 'board_size' || i.key === 'mode' || i.key === 'length' || i.key === 'difficulty');
  const startReason = validation.ok ? null : validation.issues.map((i) => i.message).join(' · ');
  const hotSeat = config.mode === 'last_flame' && seats.filter((s) => s.kind === 'human').length >= 2;

  return (
    <ScreenFrame
      title="New Game"
      subtitle="Seats, presets and every rule"
      bodyClassName="ww-setup"
      footer={
        <>
          <Button variant="primary" size="lg" seal="flame" sound="confirm" disabledReason={startReason} onClick={() => launch(false)}>
            Start
          </Button>
          <Button size="md" seal="door" disabledReason={startReason} onClick={() => launch(true)}>
            Host Online
          </Button>
          <span className="ww-spacer" />
          {!validation.ok && (
            <ul className="ww-issues ww-setup__issues" aria-live="polite">
              {validation.issues.slice(0, 2).map((issue, i) => (
                <li key={`${issue.key}${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" icon="copy" onClick={copyCode}>
            Copy settings code
          </Button>
          <Button size="sm" variant="ghost" icon="paste" onClick={() => setDialog({ kind: 'paste' })}>
            Paste code
          </Button>
        </>
      }
    >
      <div className="ww-setup__left">
        <Panel title="Mode" drips="plum" dripOffset={12}>
          <ModeToggle mode={config.mode} lock={dailyLock} onMode={(mode) => setSelection((sel) => setMode(sel, mode, seats, registry))} />
        </Panel>
        <Panel
          title={`Seats · ${seats.length}/${MAX_SEATS}`}
          drips="plum"
          dripOffset={88}
          actions={
            <>
              <Button size="sm" variant="ghost" icon="plus" disabledReason={seatDisabled('add')} onClick={() => updateSeats(addSeat(seats, 'human', registry))}>
                Add player
              </Button>
              <Button size="sm" variant="ghost" icon="plus" disabledReason={seatDisabled('add')} onClick={() => updateSeats(addSeat(seats, addKind, registry))}>
                {addLabel}
              </Button>
            </>
          }
        >
          <div className="ww-setup__seats">
            {seats.map((seat, index) => (
              <SeatCard
                key={index}
                index={index}
                seat={seat}
                mode={config.mode}
                content={registry}
                takenBy={(hero) => heroTakenBy(seats, hero, index)}
                removeReason={seats.length <= 1 ? 'The last seat stays' : seatDisabled('remove')}
                kindLockReason={daily ? dailyLock : null}
                onKind={(kind) => updateSeats(setSeatKind(seats, index, kind, registry))}
                onHero={(hero) => updateSeats(setSeatHero(seats, index, hero))}
                onName={(name) => updateSeats(setSeatName(seats, index, name))}
                onRemove={() => updateSeats(removeSeat(seats, index, registry))}
              />
            ))}
          </div>
          {hotSeat && <PrivacyOption checked={privacy} onChange={setPrivacy} />}
          {otherIssues.length > 0 && (
            <ul className="ww-issues ww-setup__seat-issues">
              {otherIssues.map((issue, i) => (
                <li key={`${issue.reason}${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}
        </Panel>
        <SummaryPanel config={config} derived={derived} content={registry} />
      </div>

      <div className="ww-setup__right">
        <Panel title="Presets" drips="plum" dripOffset={140}>
          <PresetChips
            content={registry}
            profile={profile}
            active={chip}
            dailyReason={dailyReason}
            dailyHint={`Today (${today}): Standard · Dusk · solo Vigil · ${dailyBoss}. No Retry.`}
            currentCode={currentCode}
            onLength={(length) => setSelection((sel) => setLength(sel, length, seats))}
            onDaily={() => setSelection(dailyFor(services.env.now(), seats, registry))}
            onLoadCustom={loadCustom}
            onProfile={saveProfile}
          />
        </Panel>
        <Panel title="Basics" drips="plum" dripOffset={57}>
          <BasicOptions
            content={registry}
            config={config}
            derived={derived}
            validation={validation}
            dailyLock={dailyLock}
            onDifficulty={(difficulty) => setSelection((sel) => setDifficulty(sel, difficulty, seats, registry))}
            onLength={(length) => setSelection((sel) => setLength(sel, length, seats))}
            onBoss={(boss) => setSelection((sel) => setOverride(sel, 'boss_choice', boss))}
            onBoardSize={(size) => setSelection((sel) => setOverride(sel, 'board_size', size))}
          />
        </Panel>
        <AdvancedPanel
          content={registry}
          selection={selection}
          config={config}
          sources={sources}
          validation={validation}
          lockedKeys={lockedKeys}
          onSet={<K extends RuleKey>(key: K, value: RuleValues[K]) => setSelection((sel) => setOverride(sel, key, value))}
          onReset={(key) => setSelection((sel) => clearOverride(sel, key))}
        />
      </div>

      {dialog?.kind === 'paste' && <PasteCodeDialog onClose={() => setDialog(null)} onApply={applyCode} />}
      {dialog?.kind === 'copy' && <CopyFallbackDialog code={dialog.code} onClose={() => setDialog(null)} />}
    </ScreenFrame>
  );
}

/** Host option (§14.5): Last Flame hot-seat Pass screens hide each player's hand from the others. */
function PrivacyOption({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }): ReactElement {
  return (
    <div className="ww-param ww-setup__host-option" data-testid="hot-seat-privacy">
      <div className="ww-param__label">
        <span>Hot-seat privacy</span>
        <InfoTip text="A Pass screen hides the hands before every seat turn and every private draft, so players sharing this screen can't see each other's cards." label="About hot-seat privacy" />
      </div>
      <div className="ww-param__control">
        <Toggle label="Hot-seat privacy" checked={checked} onChange={onChange} />
      </div>
      <div className="ww-param__source">
        <span className="ww-badge">Host option</span>
      </div>
    </div>
  );
}

function ModeToggle({ mode, lock, onMode }: { mode: ModeId; lock: string | null; onMode: (mode: ModeId) => void }): ReactElement {
  return (
    <Segmented
      label="Mode"
      value={mode}
      onChange={onMode}
      disabledReason={lock}
      className="ww-mode-toggle"
      options={[
        {
          value: 'vigil',
          ariaLabel: MODE_SUBTITLES.vigil,
          label: (
            <span className="ww-mode-toggle__option">
              <span className="ww-mode-toggle__name">Vigil</span>
              <span className="ww-mode-toggle__sub">team up against the Snuff</span>
            </span>
          ),
        },
        {
          value: 'last_flame',
          ariaLabel: MODE_SUBTITLES.last_flame,
          label: (
            <span className="ww-mode-toggle__option">
              <span className="ww-mode-toggle__name">Last Flame</span>
              <span className="ww-mode-toggle__sub">every candle for itself</span>
            </span>
          ),
        },
      ]}
    />
  );
}

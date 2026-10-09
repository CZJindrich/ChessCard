/** Basic options (§15.1.3): difficulty candle chips, length, boss and (Last Flame) board size. */
import type { ReactElement } from 'react';
import { BossArt, FlameIcon } from '../../../art';
import type { ConfigValidation, DerivedConfig } from '../../../config';
import type { ContentRegistry, DifficultyId, GameConfig, LengthId } from '../../../engine/types';
import { Segmented, type SegmentOption } from '../../components/Chip';
import { InfoTip } from '../../components/Tooltip';
import { optionLabel } from './paramLabels';

export interface BasicOptionsProps {
  content: ContentRegistry;
  config: GameConfig;
  derived: DerivedConfig;
  validation: ConfigValidation;
  /** Reason the Daily locks length, difficulty and boss, or null. */
  dailyLock: string | null;
  onDifficulty: (difficulty: DifficultyId) => void;
  onLength: (length: LengthId) => void;
  onBoss: (boss: string) => void;
  onBoardSize: (size: GameConfig['board_size']) => void;
}

function Candles({ count }: { count: number }): ReactElement {
  return (
    <span className="ww-candles" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <FlameIcon key={i} size={14} animated={false} />
      ))}
    </span>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: ReactElement }): ReactElement {
  return (
    <div className="ww-option">
      <div className="ww-option__label">
        <span>{label}</span>
        {help && <InfoTip text={help} label={`About ${label}`} />}
      </div>
      {children}
    </div>
  );
}

export function BasicOptions(props: BasicOptionsProps): ReactElement {
  const { content, config, derived, validation, dailyLock } = props;
  const isVigil = config.mode === 'vigil';

  const difficulty: Array<SegmentOption<DifficultyId>> = content.difficulty.list.map((d) => ({
    value: d.id,
    ariaLabel: `${d.name}, ${d.chip}`,
    hint: d.text,
    label: (
      <span className="ww-difficulty-chip">
        <Candles count={d.candles} />
        <span>{d.chip.split('·').pop()?.trim() ?? d.name}</span>
      </span>
    ),
  }));

  const lengths: Array<SegmentOption<LengthId>> = content.lengths.list.map((l) => {
    const nights = isVigil ? l.vigil.nights : l.last_flame.nights;
    return { value: l.id, label: `${l.name} · ${nights}`, ariaLabel: `${l.name}, ${nights} Nights`, hint: `${nights} Nights (the last is the Boss Night). ${l.targetTime}.` };
  });

  const bosses: Array<SegmentOption<string>> = [
    { value: 'random', label: 'Random', hint: 'A boss drawn from the seed' },
    ...content.bosses.list.map((b) => ({
      value: b.id,
      ariaLabel: b.name,
      hint: `${b.name} — ${b.epithet}`,
      label: (
        <span className="ww-boss-chip">
          <BossArt bossId={b.id} size={30} animated={false} />
          <span>{b.name.replace(/^The /, '')}</span>
        </span>
      ),
    })),
  ];

  const boardDisabled = validation.disabled.board_size ?? [];
  const boardSizes: Array<SegmentOption<GameConfig['board_size']>> = (['auto', '10x10', '12x12'] as const).map((size) => ({
    value: size,
    label: size === 'auto' ? `Auto (${derived.boardSize.replace('x', '×')})` : optionLabel('board_size', size),
    disabledReason: boardDisabled.find((d) => d.value === size)?.message ?? null,
  }));

  const difficultyText = content.difficulty.byId[config.difficulty]?.text;

  return (
    <div className="ww-basic">
      <Row label="Difficulty" help="Sets starting Dread, enemy numbers and toughness, healing and Retry.">
        <div className="ww-option__stack">
          <Segmented label="Difficulty" options={difficulty} value={config.difficulty} onChange={props.onDifficulty} disabledReason={dailyLock} />
          {difficultyText && <p className="ww-option__note">{difficultyText}</p>}
        </div>
      </Row>
      <Row label="Length" help="Nights in the run; the last one is always the Boss Night.">
        <Segmented label="Length" options={lengths} value={config.length} onChange={props.onLength} disabledReason={dailyLock} />
      </Row>
      <Row label="Boss" help="Which boss waits on the final Night.">
        <Segmented label="Boss" options={bosses} value={config.boss_choice} onChange={props.onBoss} disabledReason={dailyLock} />
      </Row>
      {!isVigil && (
        <Row label="Board" help="10×10 for 2–3 seats, 12×12 for 3–4 seats.">
          <Segmented label="Board size" options={boardSizes} value={config.board_size} onChange={props.onBoardSize} />
        </Row>
      )}
    </div>
  );
}

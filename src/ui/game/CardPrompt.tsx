/**
 * The targeting prompt above the hand while a card or the Hero Power is selected: what to
 * pick next, "choose one" modes, Play (board-wide cards), Skip (optional picks) and Cancel.
 */
import type { ReactElement } from 'react';
import { canSkipRest, modeChoices, needsMode, reasonLine } from '../../game';
import { useController, useGameSnapshot, useRegistry } from './context';

export function CardPrompt(): ReactElement | null {
  const snap = useGameSnapshot();
  const controller = useController();
  const registry = useRegistry();
  const { card, power } = snap.selection;
  if (snap.uiSeat === null || (!card && !power) || snap.animating) return null;
  const info = controller.targetInfo();
  if (!info) return null;
  const player = snap.latest.players[snap.uiSeat];
  const instance = card ? player?.hand.find((c) => c.uid === card.uid) : undefined;
  const def = instance ? registry.cards.byId[instance.id] : undefined;
  const powerDef = power && player ? registry.powers.byId[registry.heroes.byId[player.hero]?.power ?? ''] : undefined;
  const name = def?.name ?? powerDef?.name ?? 'Hero Power';
  const picks = card?.picks.length ?? power?.picks.length ?? 0;
  const choosingMode = card !== null && needsMode(info, card);
  const boardWide = info.steps === 0;
  const canSkip = canSkipRest(info, card?.picks ?? power?.picks ?? []);
  let text: string;
  if (choosingMode) text = 'Choose one:';
  else if (boardWide) text = def?.text ?? powerDef?.text ?? '';
  else if (info.targets.length === 0) text = info.reason ? reasonLine(info.reason, info.params) : 'No valid target';
  else text = info.steps > 1 ? `Pick target ${picks + 1} of ${info.steps} — click a glowing tile` : 'Click a glowing tile, or drag the card onto it';
  return (
    <div className="ww-card-prompt" role="status">
      <span className="ww-card-prompt__name">{name}</span>
      <span className="ww-card-prompt__text">{text}</span>
      {choosingMode &&
        modeChoices(info).map((mode, i) => (
          <button
            key={mode.label}
            type="button"
            className={`ww-card-prompt__btn${mode.playable ? '' : ' ww-card-prompt__btn--off'}`}
            title={mode.playable ? mode.text : reasonLine(mode.reason ?? 'INVALID_ACTION', mode.params)}
            onClick={() => (mode.playable ? controller.chooseMode(i) : controller.showNotice(reasonLine(mode.reason ?? 'INVALID_ACTION', mode.params), { kind: 'board' }, 'error'))}
          >
            {mode.label}
          </button>
        ))}
      {boardWide && (
        <button type="button" className="ww-card-prompt__btn ww-card-prompt__btn--go" onClick={() => controller.tryPlaySelected()}>
          {power ? 'Use (Enter)' : 'Play (Enter)'}
        </button>
      )}
      {canSkip && (
        <button type="button" className="ww-card-prompt__btn" onClick={() => controller.skipOptionalStep()}>
          Skip
        </button>
      )}
      <button type="button" className="ww-card-prompt__btn ww-card-prompt__btn--ghost" onClick={() => controller.cancelTargeting()}>
        Cancel (Esc)
      </button>
    </div>
  );
}

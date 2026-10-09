/**
 * The End Turn confirmation (`confirm_end_turn`: smart asks only while pieces or cards are
 * still usable). Space or Enter confirms, Esc keeps playing.
 */
import type { ReactElement } from 'react';
import { Button } from '../components/Button';
import { useController, useGameSnapshot } from './context';
import { GameDialog } from './GameDialog';

export function EndTurnConfirm(): ReactElement | null {
  const snap = useGameSnapshot();
  const controller = useController();
  if (!snap.confirmingEndTurn) return null;
  return (
    <GameDialog
      eyebrow="End Turn?"
      title="You can still act"
      size="sm"
      footer={
        <>
          <Button variant="primary" seal="check" data-testid="confirm-end-turn" onClick={() => controller.endTurn(true)}>
            End Turn
          </Button>
          <Button variant="ghost" onClick={() => controller.cancel()}>
            Keep playing
          </Button>
        </>
      }
    >
      <p className="ww-dialog__lead">Some pieces can still move or strike, or a card can be played. The Snuff strike when everyone has ended.</p>
    </GameDialog>
  );
}

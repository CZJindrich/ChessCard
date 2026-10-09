/**
 * The rules overlay (R, GDD §2.1, §15.7): the 8 rules with their animated diagrams, the same
 * cards as the How to Play screen, over the paused game.
 */
import { useEffect, type ReactElement } from 'react';
import { RULES } from '../screens/howto/ruleDiagrams';
import { useController, useRegistry } from './context';
import { GameDialog } from './GameDialog';
import '../screens/howto/howto.css';

export function RulesOverlay({ onClose }: { onClose: () => void }): ReactElement {
  const registry = useRegistry();
  const controller = useController();
  useEffect(() => {
    controller.hold('rules');
    return () => controller.release('rules');
  }, [controller]);
  return (
    <GameDialog full eyebrow="How to Play" title="The 8 Rules" size="xl" className="ww-rules" onClose={onClose} testId="rules-overlay">
      <ol className="ww-rules__list">
        {RULES.map(({ title, text, Diagram }, i) => (
          <li key={title} className="ww-rules__item">
            <div className="ww-rules__art">
              <Diagram content={registry} />
            </div>
            <div className="ww-rules__text">
              <span className="ww-rules__num ww-num" aria-hidden="true">
                {i + 1}
              </span>
              <strong>{title}</strong> {text}
            </div>
          </li>
        ))}
      </ol>
    </GameDialog>
  );
}

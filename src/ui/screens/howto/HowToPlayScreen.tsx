/**
 * How to Play (GDD §15.1.5): the 8 rules with animated diagrams, the pattern gallery of
 * movement runes, the glossary, and "Play the tutorial" / "Watch a 20-second demo".
 */
import type { ReactElement } from 'react';
import { RuneIcon } from '../../../art';
import { demoSelection, prepareLaunch } from '../../app/launch';
import { useContentState, useServices } from '../../app/services';
import { Button } from '../../components/Button';
import { Collapsible } from '../../components/Collapsible';
import { ScreenFrame } from '../../components/ScreenFrame';
import { runeName, runeText } from '../../model/describe';
import { PATTERN_DIAGRAMS } from './patternBoards';
import { GLOSSARY, RULES } from './ruleDiagrams';
import './howto.css';

export function HowToPlayScreen(): ReactElement {
  const services = useServices();
  const content = useContentState();
  const registry = content.registry;

  const watchDemo = (): void => {
    const result = prepareLaunch(demoSelection(registry), { content: registry, modded: content.modded, now: services.env.now(), randomSeed: services.env.randomSeed });
    if (result.ok) services.nav.push({ screen: 'game', config: result.config, selection: result.selection, demo: true });
    else services.toasts.show({ title: 'The demo cannot start', lines: result.issues.map((i) => i.message), tone: 'warning' });
  };

  return (
    <ScreenFrame
      title="How to Play"
      subtitle="Eight rules, eight runes. Everything else is on the cards."
      bodyClassName="ww-howto"
      footer={
        <>
          <Button variant="ghost" icon="back" sound="back" onClick={() => services.nav.back()}>
            Back
          </Button>
          <span className="ww-spacer" />
          <Button size="md" icon="play" onClick={watchDemo}>
            Watch a 20-second demo
          </Button>
          <Button variant="primary" size="lg" seal="flame" sound="confirm" onClick={() => services.nav.push({ screen: 'hero_pick', mode: 'tutorial' })}>
            Play the tutorial
          </Button>
        </>
      }
    >
      <section className="ww-howto__section" aria-labelledby="ww-howto-rules">
        <h2 id="ww-howto-rules" className="ww-howto__heading">
          The 8 rules
        </h2>
        <ol className="ww-howto__rules">
          {RULES.map(({ title, text, Diagram }, i) => (
            <li key={title} className="ww-rulecard">
              <div className="ww-rulecard__art">
                <Diagram content={registry} />
              </div>
              <div className="ww-rulecard__text">
                <span className="ww-rulecard__num ww-num" aria-hidden="true">
                  {i + 1}
                </span>
                <p>
                  <strong className="ww-rulecard__title">{title}</strong> {text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ww-howto__section" aria-labelledby="ww-howto-runes">
        <h2 id="ww-howto-runes" className="ww-howto__heading">
          Movement runes
        </h2>
        <p className="ww-howto__lede">The rune on the left of a piece's base shows how it moves; a glyph on the right shows a strike that differs from its move.</p>
        <ul className="ww-howto__patterns">
          {PATTERN_DIAGRAMS.map(({ rune, pips, Diagram }) => (
            <li key={rune} className="ww-pattern">
              <Diagram />
              <div className="ww-pattern__caption">
                <RuneIcon id={rune} pips={pips ?? 0} size={34} />
                <div>
                  <p className="ww-pattern__name">{runeName(registry, rune)}</p>
                  <p className="ww-pattern__text">{runeText(registry, rune)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="ww-howto__section">
        <Collapsible title="Glossary" summary={`${GLOSSARY.length} terms`}>
          <dl className="ww-glossary">
            {GLOSSARY.map(([term, meaning]) => (
              <div key={term} className="ww-glossary__row">
                <dt>{term}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </Collapsible>
      </section>
    </ScreenFrame>
  );
}

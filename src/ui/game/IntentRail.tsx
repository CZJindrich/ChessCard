/**
 * The right rail (GDD §15.4): the intent queue in resolution order ("1 · Ink Wretch → lances
 * c3 Vigil Candle for 1 (Dread +1)"), hover to light an entry on the board; the Plumes that
 * rise after the Strike; the End Turn preview while End Turn is hovered; and a collapsible log.
 * In Last Flame the rail is a drawer behind a tab on the right edge (the queue positions are
 * drawn on the board instead); it opens by itself while End Turn's preview is shown.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { BossArt, PieceArt } from '../../art';
import { intentQueue, sqName } from '../../engine';
import type { IntentView } from '../../engine/types';
import { useController, useGameSelector, useRegistry } from './context';
import { endTurnPreview, enemyName } from './model';
import { useGameUi, useGameUiState } from './uiStore';

const INTENT_PATTERN = /^(.*?) → (\S+) (.*) for (\d+)(.*)$/;

function IntentText({ view }: { view: IntentView }): ReactElement {
  const match = INTENT_PATTERN.exec(view.text);
  if (!match) return <span className="ww-queue__text">{view.text}</span>;
  const [, name, verb, target, damage, extra] = match;
  return (
    <span className="ww-queue__text">
      <span className="ww-queue__who">{name}</span> → {verb} <strong>{target}</strong> for <span className="ww-queue__dmg ww-num">{damage}</span>
      {extra && <span className="ww-queue__extra">{extra}</span>}
    </span>
  );
}

function QueueList(): ReactElement {
  const snap = useGameSelector((s) => ({ state: s.state, hoverIntentId: s.selection.hoverIntentId }));
  const controller = useController();
  const views = useMemo(() => intentQueue(snap.state), [snap.state]);
  if (views.length === 0) {
    return <p className="ww-rail__empty">No attacks are locked. The Snuff declare at the next Snuff Move.</p>;
  }
  return (
    <ol className="ww-queue" onPointerLeave={() => controller.hoverIntent(null)}>
      {views.map((view) => {
        const attacker = snap.state.pieces[view.attackerId];
        const focused = snap.hoverIntentId === view.intentId;
        return (
          <li key={view.intentId} className={`ww-queue__item${focused ? ' ww-queue__item--focus' : ''}`} onPointerEnter={() => controller.hoverIntent(view.intentId)}>
            <span className="ww-queue__num ww-num">{view.queue}</span>
            {attacker && (
              <span className="ww-queue__art" aria-hidden="true">
                {attacker.kind === 'boss' ? (
                  <BossArt bossId={attacker.defId} size={34} animated={false} />
                ) : (
                  <PieceArt defId={attacker.defId} side="snuff" kind="enemy" size={30} showStats={false} showPips={false} animated={false} />
                )}
              </span>
            )}
            <IntentText view={view} />
          </li>
        );
      })}
    </ol>
  );
}

function Rising(): ReactElement | null {
  const state = useGameSelector((s) => s.state, Object.is);
  const registry = useRegistry();
  if (state.plumes.length === 0) return null;
  return (
    <section className="ww-rail__section">
      <h3 className="ww-rail__title">
        Plumes rising <span className="ww-rail__count ww-num">{state.plumes.length}</span>
      </h3>
      <ul className="ww-rising">
        {state.plumes.map((m) => (
          <li key={m.id}>
            <span className="ww-rising__spiral" aria-hidden="true" />
            {enemyName(registry, m.enemyId)} at <strong>{sqName(m.pos)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewPanel(): ReactElement | null {
  const snap = useGameSelector((s) => ({ previewEndTurn: s.selection.previewEndTurn, animating: s.animating, latest: s.latest }));
  const registry = useRegistry();
  const preview = useMemo(() => (snap.previewEndTurn && !snap.animating ? endTurnPreview(snap.latest, registry) : null), [snap.previewEndTurn, snap.animating, snap.latest, registry]);
  if (!preview) return null;
  return (
    <section className="ww-rail__section ww-preview" aria-live="polite">
      <h3 className="ww-rail__title">If you end the turn now</h3>
      {preview.lines.length === 0 ? (
        <p className="ww-rail__empty">The Snuff Strike hits nothing.</p>
      ) : (
        <ul className="ww-preview__lines">
          {preview.lines.map((line, i) => (
            <li key={i} className={`ww-preview__line ww-preview__line--${line.tone}`}>
              {line.text}
            </li>
          ))}
        </ul>
      )}
      {preview.rising.length > 0 && (
        <p className="ww-preview__rise">
          Then {preview.rising.length} Plume{preview.rising.length === 1 ? '' : 's'} rise
          {preview.rising.some((r) => r.blocked) ? ' (blocked ones deal 1 to the blocker)' : ''}.
        </p>
      )}
    </section>
  );
}

function Chronicle(): ReactElement {
  const state = useGameSelector((s) => s.state, Object.is);
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLOListElement | null>(null);
  const entries = state.log.slice(-60);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, open]);
  return (
    <section className={`ww-rail__section ww-log${open ? ' ww-log--open' : ''}`}>
      <button type="button" className="ww-rail__title ww-log__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Chronicle
        <span className="ww-log__chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ol ref={listRef} className="ww-log__list">
          {entries.map((entry, i) => (
            <li key={`${state.log.length - entries.length + i}`} className={entry.seat !== undefined ? 'ww-log__entry ww-log__entry--seat' : 'ww-log__entry'}>
              {entry.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RailSections({ count }: { count: number }): ReactElement {
  return (
    <>
      <PreviewPanel />
      <section className="ww-rail__section ww-rail__section--queue">
        <h3 className="ww-rail__title">
          The Snuff will strike <span className="ww-rail__count ww-num">{count}</span>
        </h3>
        <QueueList />
      </section>
      <Rising />
      <Chronicle />
    </>
  );
}

/** Last Flame: the rail as a drawer over the board's right edge, behind a tab. */
function RailDrawer({ count }: { count: number }): ReactElement {
  const previewing = useGameSelector((s) => s.selection.previewEndTurn && !s.animating, Object.is);
  const ui = useGameUi();
  const { drawer } = useGameUiState();
  const open = drawer || previewing;
  return (
    <>
      <button
        type="button"
        className={`ww-drawer-tab${open ? ' ww-drawer-tab--open' : ''}`}
        aria-expanded={open}
        aria-controls="ww-snuff-drawer"
        data-testid="drawer-tab"
        onClick={() => ui.setDrawer()}
      >
        <span className="ww-drawer-tab__count ww-num">{count}</span>
        <span className="ww-drawer-tab__label">{open ? 'Hide' : 'Snuff & log'}</span>
      </button>
      {open && (
        <aside id="ww-snuff-drawer" className="ww-rail ww-rail--right ww-rail--drawer" aria-label="The Snuff" data-testid="snuff-drawer">
          <RailSections count={count} />
        </aside>
      )}
    </>
  );
}

export function IntentRail(): ReactElement {
  const { count, lastFlame } = useGameSelector((s) => ({ count: s.state.intents.length, lastFlame: s.state.config.mode === 'last_flame' }));
  if (lastFlame) return <RailDrawer count={count} />;
  return (
    <aside className="ww-rail ww-rail--right" aria-label="The Snuff">
      <RailSections count={count} />
    </aside>
  );
}

/** A tab strip (role tablist) with arrow-key navigation; the panel is rendered by the caller. */
import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { useUiSound } from '../app/services';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
}

export interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  /** Prefix for tab / panel ids, so the caller can label its panel. */
  idPrefix: string;
}

export function tabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function panelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

export function Tabs<T extends string>({ items, value, onChange, label, idPrefix }: TabsProps<T>): ReactElement {
  const play = useUiSound();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (index: number): void => {
    const item = items[index];
    if (!item) return;
    if (item.id !== value) play('click');
    onChange(item.id);
    refs.current[index]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = items.findIndex((t) => t.id === value);
    const moves: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: items.length - 1 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select((target + items.length) % items.length);
  };
  return (
    <div role="tablist" aria-label={label} className="ww-tabs" onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={tabId(idPrefix, item.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(idPrefix, item.id)}
            tabIndex={selected ? 0 : -1}
            className={selected ? 'ww-tab ww-tab--on' : 'ww-tab'}
            onPointerEnter={() => play('hover')}
            onClick={() => select(index)}
          >
            {item.label}
            {item.count !== undefined && <span className="ww-tab__count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

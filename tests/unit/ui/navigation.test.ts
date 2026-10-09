import { describe, expect, it } from 'vitest';
import { createNavigator, currentRoute, initialNavState, isMenuScreen, navReducer } from '../../../src/ui/app/navigation';
import { createStore } from '../../../src/ui/app/store';
import { createToastStore, MAX_TOASTS, toastDuration } from '../../../src/ui/app/toasts';

describe('navReducer', () => {
  it('pushes, replaces, goes back and resets', () => {
    let s = initialNavState();
    s = navReducer(s, { type: 'push', route: { screen: 'setup' } });
    s = navReducer(s, { type: 'push', route: { screen: 'how_to_play' } });
    expect(s.stack.map((r) => r.screen)).toEqual(['title', 'setup', 'how_to_play']);
    s = navReducer(s, { type: 'replace', route: { screen: 'codex', tab: 'cards' } });
    expect(currentRoute(s)).toEqual({ screen: 'codex', tab: 'cards' });
    s = navReducer(s, { type: 'back' });
    expect(currentRoute(s).screen).toBe('setup');
    s = navReducer(s, { type: 'reset', route: { screen: 'title' } });
    expect(s.stack).toHaveLength(1);
  });

  it('never pops the last screen', () => {
    const s = initialNavState();
    expect(navReducer(s, { type: 'back' })).toBe(s);
  });
});

describe('createNavigator', () => {
  it('notifies subscribers and resets to the title by default', () => {
    const nav = createNavigator({ screen: 'settings' });
    let calls = 0;
    const off = nav.subscribe(() => calls++);
    nav.push({ screen: 'codex' });
    expect(nav.canGoBack()).toBe(true);
    nav.reset();
    expect(nav.current()).toEqual({ screen: 'title' });
    expect(calls).toBe(2);
    off();
    nav.push({ screen: 'setup' });
    expect(calls).toBe(2);
  });

  it('treats every screen but the game as a menu screen', () => {
    expect(isMenuScreen('title')).toBe(true);
    expect(isMenuScreen('lobby')).toBe(true);
    expect(isMenuScreen('game')).toBe(false);
  });
});

describe('createStore', () => {
  it('skips notifications for identical values', () => {
    const store = createStore(1);
    let calls = 0;
    store.subscribe(() => calls++);
    store.set(1);
    store.update((n) => n + 1);
    expect(store.get()).toBe(2);
    expect(calls).toBe(1);
  });
});

describe('toasts', () => {
  it('keeps the newest few and dismisses on its timer', () => {
    const timers: Array<() => void> = [];
    const toasts = createToastStore({ setTimeout: (fn) => timers.push(fn) });
    for (let i = 0; i < MAX_TOASTS + 2; i++) toasts.show({ title: `t${i}` });
    expect(toasts.get().map((t) => t.title)).toEqual(['t2', 't3', 't4', 't5']);
    timers.forEach((fn) => fn());
    expect(toasts.get()).toEqual([]);
  });

  it('can stay until dismissed', () => {
    const timers: Array<() => void> = [];
    const toasts = createToastStore({ setTimeout: (fn) => timers.push(fn) });
    const id = toasts.show({ title: 'sticky', durationMs: 0 });
    expect(timers).toHaveLength(0);
    toasts.dismiss(id);
    expect(toasts.get()).toEqual([]);
  });

  it('gives longer toasts more reading time, up to a cap', () => {
    expect(toastDuration(0)).toBe(4000);
    expect(toastDuration(3)).toBeGreaterThan(toastDuration(1));
    expect(toastDuration(50)).toBe(12000);
  });
});

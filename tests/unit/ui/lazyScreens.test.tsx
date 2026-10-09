// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Suspense, useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyScreen } from '../../../src/ui/app/lazyScreen';
import { GameScreenChunk, preloadAllScreens, preloadNextScreens, schedulePreload } from '../../../src/ui/app/lazyScreens';
import { LoadingVeil } from '../../../src/ui/components/LoadingVeil';
import { ScreenBoundary } from '../../../src/ui/components/ScreenBoundary';
import { makeServices } from './helpers';
import { ServicesContext } from '../../../src/ui/app/services';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Hello({ who }: { who: string }): ReactElement {
  return <p>Hello {who}</p>;
}

function withServices(node: ReactElement): ReactElement {
  const { services } = makeServices();
  return <ServicesContext.Provider value={services}>{node}</ServicesContext.Provider>;
}

describe('lazyScreen', () => {
  it('shows the veil while the chunk loads, then the screen; once loaded it renders at once', async () => {
    const chunk = deferred<typeof Hello>();
    const load = vi.fn(() => chunk.promise);
    const { Screen, isLoaded } = lazyScreen('Hello', load);

    const first = render(
      <Suspense fallback={<LoadingVeil />}>
        <Screen who="Brannoc" />
      </Suspense>,
    );
    expect(screen.getByTestId('loading-veil').textContent).toContain('Lighting the candles');
    expect(isLoaded()).toBe(false);
    await act(async () => chunk.resolve(Hello));
    expect(await screen.findByText('Hello Brannoc')).toBeTruthy();
    expect(screen.queryByTestId('loading-veil')).toBeNull();
    expect(isLoaded()).toBe(true);
    first.unmount();

    // A second visit never suspends: the screen is there in the same render.
    render(
      <Suspense fallback={<LoadingVeil />}>
        <Screen who="Vey" />
      </Suspense>,
    );
    expect(screen.getByText('Hello Vey')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps a screen mounted through the veil when its parent re-renders later', async () => {
    function Counter({ label }: { label: string }): ReactElement {
      const [count, setCount] = useState(0);
      return (
        <button type="button" onClick={() => setCount((n) => n + 1)}>
          {label} {count}
        </button>
      );
    }
    const chunk = deferred<typeof Counter>();
    const { Screen } = lazyScreen('Counter', () => chunk.promise);
    const view = render(
      <Suspense fallback={<LoadingVeil />}>
        <Screen label="Wax" />
      </Suspense>,
    );
    await act(async () => chunk.resolve(Counter));
    fireEvent.click(await screen.findByRole('button', { name: 'Wax 0' }));
    view.rerender(
      <Suspense fallback={<LoadingVeil />}>
        <Screen label="Wick" />
      </Suspense>,
    );
    expect(screen.getByRole('button', { name: 'Wick 1' })).toBeTruthy();
  });

  it('fetches once however often it is preloaded', async () => {
    const load = vi.fn(() => Promise.resolve(Hello));
    const lazy = lazyScreen('Hello', load);
    await Promise.all([lazy.preload(), lazy.preload()]);
    await lazy.preload();
    expect(load).toHaveBeenCalledTimes(1);
    render(<lazy.Screen who="Wicklow" />);
    expect(screen.getByText('Hello Wicklow')).toBeTruthy();
  });

  it('forgets a failed fetch, so the next attempt loads again', async () => {
    const load = vi.fn<() => Promise<typeof Hello>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Hello);
    const lazy = lazyScreen('Hello', load);
    await expect(lazy.preload()).rejects.toThrow('offline');
    expect(lazy.isLoaded()).toBe(false);
    await lazy.preload();
    expect(lazy.isLoaded()).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('sends a failed load to the screen boundary: Reload or the Main Menu', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const chunk = deferred<typeof Hello>();
    const { Screen } = lazyScreen('Hello', () => chunk.promise);
    const onMainMenu = vi.fn();
    const onReload = vi.fn();
    render(
      withServices(
        <ScreenBoundary onMainMenu={onMainMenu} onReload={onReload}>
          <Suspense fallback={<LoadingVeil />}>
            <Screen who="Velveteen" />
          </Suspense>
        </ScreenBoundary>,
      ),
    );
    await act(async () => chunk.reject(new TypeError('Failed to fetch dynamically imported module')));
    expect((await screen.findByTestId('screen-failed')).textContent).toContain('The candle guttered');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Main Menu' }));
    expect(onMainMenu).toHaveBeenCalledTimes(1);
  });
});

describe('screen chunks', () => {
  it('loads every screen chunk', async () => {
    await preloadAllScreens();
    expect(GameScreenChunk.isLoaded()).toBe(true);
    expect(() => preloadNextScreens('hero_pick')).not.toThrow();
    expect(() => preloadNextScreens('title')).not.toThrow();
  });

  it('preloads when the browser is idle, and can be cancelled', () => {
    const requestIdleCallback = vi.fn((_callback: () => void, _options?: { timeout: number }) => 7);
    const cancelIdleCallback = vi.fn();
    const cancel = schedulePreload({ requestIdleCallback, cancelIdleCallback, navigator: window.navigator });
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(requestIdleCallback.mock.calls[0]?.[1]).toEqual({ timeout: 4000 });
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it('falls back to a timer without requestIdleCallback', () => {
    vi.useFakeTimers();
    try {
      const cancel = schedulePreload({ navigator: window.navigator });
      expect(vi.getTimerCount()).toBe(1);
      cancel();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the preload when the browser asks to save data', () => {
    const requestIdleCallback = vi.fn(() => 1);
    const navigator = Object.assign(Object.create(window.navigator) as Navigator, { connection: { saveData: true } });
    schedulePreload({ requestIdleCallback, cancelIdleCallback: vi.fn(), navigator });
    expect(requestIdleCallback).not.toHaveBeenCalled();
  });
});

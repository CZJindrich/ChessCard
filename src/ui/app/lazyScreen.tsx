/**
 * Code-split screens: a heavy screen lives in its own chunk, fetched the first time it shows or
 * ahead of time with `preload()`.
 *
 * The screen is a `React.lazy` component, so while its chunk loads the nearest `<Suspense>` shows
 * its fallback. But `React.lazy` suspends on its first render even when the chunk is already in
 * memory, which would flash the veil after every preload. So a screen mounted once its chunk has
 * arrived renders the loaded component directly, in the same render. Each mounted screen keeps
 * the element type it started with, so a later re-render never remounts it.
 *
 * A failed fetch is forgotten (the next attempt fetches again) and its error reaches the nearest
 * error boundary.
 */
import { lazy, useState, type ComponentType, type ReactElement } from 'react';

export interface Preloadable {
  /** Start fetching the chunk (once); resolves when the screen can render without suspending. */
  preload(): Promise<void>;
  /** True once the chunk has loaded. */
  isLoaded(): boolean;
}

export interface LazyScreen<P extends object> extends Preloadable {
  /** The screen itself: suspends while its chunk loads. */
  readonly Screen: ComponentType<P>;
}

export function lazyScreen<P extends object>(name: string, load: () => Promise<ComponentType<P>>): LazyScreen<P> {
  let component: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;

  const request = (): Promise<ComponentType<P>> => {
    pending ??= load().then(
      (loaded) => {
        component = loaded;
        return loaded;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };

  const Suspending = lazy(() => request().then((loaded) => ({ default: loaded })));

  function Screen(props: P): ReactElement {
    const [Ready] = useState(() => component);
    return Ready ? <Ready {...props} /> : <Suspending {...props} />;
  }
  Screen.displayName = `Lazy(${name})`;

  return {
    Screen,
    preload: () => request().then(() => undefined),
    isLoaded: () => component !== null,
  };
}

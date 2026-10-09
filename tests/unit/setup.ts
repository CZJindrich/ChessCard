/**
 * Vitest setup (vite.config.ts `test.setupFiles`). The app code-splits its heavy screens
 * (src/ui/app/lazyScreens.ts); the jsdom tests click through the app synchronously, so every
 * screen chunk is loaded before a DOM test file runs. The lazy screens then render at once, as
 * they do in the browser after the idle preload. Node-environment files (the engine) skip this.
 */
if (typeof document !== 'undefined') {
  const { preloadAllScreens } = await import('../../src/ui/app/lazyScreens');
  await preloadAllScreens();
}

export {};

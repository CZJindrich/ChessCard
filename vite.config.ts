/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the build portable (GitHub Pages, itch.io, file servers).
// In dev, `/ws` is proxied to the game server (`npm run server`, port 8787) so online play
// works from the Vite dev server too.
//
// Chunks: the heavy screens are split by dynamic import (src/ui/app/lazyScreens.ts); React gets
// its own long-cached vendor chunk; the bot planner is a separate Web Worker chunk.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
});

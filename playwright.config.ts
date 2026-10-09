import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests (tests/e2e). The web server builds the game and serves dist/ with
 * `vite preview`; the online spec starts its own game server on a free port.
 *
 * - PLAYWRIGHT_CHROMIUM_PATH: an existing Chromium to launch instead of the one that
 *   `npx playwright install chromium` downloads.
 * - WICKWATCH_E2E_PORT: the preview port (default 4173).
 * - CI: a fresh server every run, one retry, GitHub annotations and an HTML report.
 */
const CI = Boolean(process.env.CI);
const PORT = Number(process.env.WICKWATCH_E2E_PORT ?? 4173);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    browserName: 'chromium',
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

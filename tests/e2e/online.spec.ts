/**
 * Online end to end: the real game server (`tsx server/index.ts`, serving dist/ and /ws) on a
 * free port, two browser contexts. The host opens a room from Setup's Host Online, the guest
 * joins with the code, takes a seat, both Ready, the host starts, and both land on the game
 * screen with the online session (host controls seat 1, guest seat 2).
 *
 * If the game screen already plays through `createNetTransport(route.online)`, the test also
 * checks that the guest's Ready (a real click path through the controller) reaches the host.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { GameController } from '../../src/game';
import type { GameState } from '../../src/engine/types';
import type { OnlineSession } from '../../src/net';

declare global {
  interface Window {
    __ww?: { controller: GameController; load: (state: GameState) => void };
    __wwNet?: { session: OnlineSession };
  }
}

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

test.use({ launchOptions: existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {} });
test.describe.configure({ mode: 'serial' });

let server: ChildProcess | null = null;
let baseUrl = '';
const serverLog: string[] = [];

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}/`;
  server = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', WICKWATCH_DATA: mkdtempSync(join(tmpdir(), 'ww-e2e-data-')) },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so npx, tsx and node all stop together.
    detached: true,
  });
  server.stdout?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
  server.stderr?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the server did not start:\n${serverLog.join('')}`);
});

test.afterAll(() => {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
});

async function newPlayer(browser: Browser, errors: string[]): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(baseUrl);
  return page;
}

test('host and guest meet in a room and start a Vigil together', async ({ browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const host = await newPlayer(browser, errors);
  const guest = await newPlayer(browser, errors);

  // Host: New Game → a second player seat → Host Online.
  await host.getByRole('button', { name: /New Game/ }).first().click();
  await host.getByRole('button', { name: /Add player/ }).click();
  await host.getByRole('button', { name: /Host Online/ }).click();
  const codeBox = host.getByTestId('room-code');
  await expect(codeBox).toBeVisible({ timeout: 15_000 });
  const code = ((await codeBox.getAttribute('aria-label')) ?? '').replace('Room code ', '').replace(/ /g, '');
  expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ]{4}$/);

  // Guest: Join Online → name and code → take the open seat → Ready.
  await guest.getByRole('button', { name: /Join Online/ }).click();
  await guest.getByRole('textbox', { name: 'Your name' }).fill('Bob');
  await guest.getByRole('textbox', { name: 'Room code' }).fill(code.toLowerCase());
  await guest.getByRole('button', { name: /^Join$/ }).click();
  await expect(guest.getByTestId('room-code')).toBeVisible();
  await guest.getByTestId('seat-1').getByRole('button', { name: 'Take seat' }).click();
  await expect(guest.getByTestId('seat-1')).toContainText('Bob');
  await guest.getByRole('button', { name: /I'm Ready/ }).click();
  await expect(host.getByTestId('seat-1')).toContainText('Ready');

  // Host: Ready, then start.
  const start = host.getByTestId('start-game');
  await expect(start).toHaveAttribute('aria-disabled', 'true');
  await host.getByRole('button', { name: /I'm Ready/ }).click();
  await expect(start).not.toHaveAttribute('aria-disabled', 'true');
  await start.click();

  // Both enter the game route carrying the online session.
  for (const [page, seat] of [
    [host, 0],
    [guest, 1],
  ] as const) {
    await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 20_000 });
    const online = await page.evaluate(() => {
      const state = window.__wwNet?.session.get();
      return { phase: state?.room?.phase, you: state?.game?.you, names: state?.game?.view.players.map((p) => p.name) };
    });
    expect(online.phase).toBe('playing');
    expect(online.you).toEqual([seat]);
    expect(online.names?.[1]).toBe('Bob');
  }

  // With the game screen wired to NetTransport, the controller only drives this tab's seat and
  // a Ready sent from the guest's controller reaches the host through the server.
  const integrated = await guest.evaluate(() => {
    const seats = window.__ww?.controller.getSnapshot().controlledSeats ?? [];
    return seats.length === 1 && seats[0] === 1;
  });
  if (integrated) {
    await guest.evaluate(() => window.__ww?.controller.ready());
    await expect.poll(() => host.evaluate(() => window.__wwNet?.session.get().game?.view.players[1].ready), { timeout: 10_000 }).toBe(true);
  } else {
    test.info().annotations.push({ type: 'note', description: 'GameScreen does not use createNetTransport yet: verified up to the online game route.' });
  }

  expect(errors.filter((e) => !/WebSocket connection .* failed/.test(e))).toEqual([]);
});

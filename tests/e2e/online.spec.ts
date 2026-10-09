/**
 * Online end to end: the real game server (`tsx server/index.ts`, serving the built client and
 * /ws) on a free port, two browser contexts. The host opens a room from Setup's Host Online, the
 * guest joins with the code, takes a seat, both Ready, the host starts, and both land on the game
 * screen playing through `createNetTransport(route.online)` (host seat 1, guest seat 2). Then,
 * with real clicks: both Ready the Night, each claims the turn and moves its hero, and each sees
 * the other's move; the plaques say who plays each seat, the decision timer burns, and a guest
 * who drops shows as reconnecting on the host's plaque.
 *
 * The client served is `WICKWATCH_DIST` when set (a fresh build elsewhere), else dist/ (built
 * when missing).
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
  const dist = process.env.WICKWATCH_DIST ?? join(ROOT, 'dist');
  if (!existsSync(join(dist, 'index.html'))) execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}/`;
  server = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', WICKWATCH_DIST: dist, WICKWATCH_DATA: mkdtempSync(join(tmpdir(), 'ww-e2e-data-')) },
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
  // Every tip seen and quick playback, so nothing pauses the two screens.
  await page.addInitScript(() => {
    localStorage.setItem('chesscard.profile', JSON.stringify({ version: 1, playerName: 'Ash', gamesCompleted: 3 }));
    localStorage.setItem('chesscard.presentation', JSON.stringify({ animation_speed: 3, confirm_end_turn: 'never' }));
    const tips = ['plume', 'dread', 'push', 'bump', 'hot_wax', 'chimney', 'shrine', 'ward', 'dazed', 'aimed', 'smoldering', 'toll', 'moth_die', 'chandlery', 'boss_phase', 'crown', 'check', 'gloam_warning', 'lit_shrine'];
    localStorage.setItem('chesscard.tips', JSON.stringify(tips));
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(baseUrl);
  return page;
}

/** Wait until this screen is idle in the players phase. */
async function waitForPlayers(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && s.latest.phase === 'players';
    },
    null,
    { timeout: 30_000 },
  );
}

/** Click a board tile (x = file, y = rank) on this screen. */
async function clickBoard(page: Page, pos: { x: number; y: number }): Promise<void> {
  const box = await page.getByTestId('board-input').boundingBox();
  const tile = Number(await page.locator('.ww-gameboard').getAttribute('data-tile'));
  if (!box || !tile) throw new Error('board not laid out');
  const rows = Math.round(box.height / tile);
  await page.mouse.click(box.x + pos.x * tile + tile / 2, box.y + (rows - 1 - pos.y) * tile + tile / 2);
}

test('host and guest meet in a room, start a Vigil together and see each other play', async ({ browser }) => {
  test.setTimeout(180_000);
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

  // The game screen plays through NetTransport: each tab drives only its own seat.
  for (const [page, seat] of [
    [host, 0],
    [guest, 1],
  ] as const) {
    await expect.poll(() => page.evaluate(() => window.__ww?.controller.getSnapshot().controlledSeats ?? [])).toEqual([seat]);
    await expect(page.getByTestId(`seat-tag-${seat}`)).toHaveText('You');
    await expect(page.getByTestId(`seat-tag-${1 - seat}`)).toHaveText('Online');
  }

  // Night setup: each player presses Ready on their own screen.
  for (const page of [host, guest]) {
    await expect(page.getByTestId('night-title')).toBeHidden({ timeout: 6_000 });
    await page.getByTestId('ready').click();
  }
  for (const page of [host, guest]) await waitForPlayers(page);
  // The decision timer burns beside End Turn (the room plays with the online `normal` timer).
  await expect(host.getByTestId('turn-timer')).toBeVisible({ timeout: 10_000 });

  // Each player in turn claims, moves the hero by clicking the board, and ends the turn; the other
  // screen shows the move.
  for (const [mover, watcher, seat] of [
    [host, guest, 0],
    [guest, host, 1],
  ] as const) {
    await waitForPlayers(mover);
    // With two players still to act the turn is claimed; the last one gets it automatically.
    const claim = mover.getByTestId(`plaque-${seat}`).getByRole('button', { name: 'Take My Turn' });
    if (await claim.isVisible().catch(() => false)) await claim.click();
    await expect.poll(() => mover.evaluate(() => window.__ww?.controller.getSnapshot().uiSeat ?? null), { timeout: 10_000 }).toBe(seat);
    const move = await mover.evaluate((me) => {
      const controller = window.__ww?.controller;
      const s = controller?.getSnapshot().latest;
      const heroId = s?.players[me].heroPieceId ?? '';
      const target = controller?.highlightsFor(heroId)?.moves[0];
      return { heroId, from: s?.pieces[heroId]?.pos ?? null, dot: target?.pos ?? null, to: target?.to ?? null };
    }, seat);
    if (!move.from || !move.dot || !move.to) throw new Error(`seat ${seat}: no move for the hero`);
    await clickBoard(mover, move.from);
    await clickBoard(mover, move.dot);
    await expect
      .poll(() => watcher.evaluate((id) => window.__ww?.controller.getSnapshot().latest.pieces[id]?.pos ?? null, move.heroId), { timeout: 10_000 })
      .toEqual(move.to);
    await mover.getByTestId('end-turn').click();
    await expect.poll(() => watcher.evaluate((me) => window.__ww?.controller.getSnapshot().latest.players[me].turnEnded ?? false, seat), { timeout: 10_000 }).toBe(true);
  }

  // The guest drops: the host's plaque for that seat shows the reconnect grace.
  await guest.context().close();
  await expect(host.getByTestId('seat-tag-1')).toContainText('Reconnecting', { timeout: 15_000 });

  expect(errors.filter((e) => !/WebSocket connection .* failed/.test(e))).toEqual([]);
});

/**
 * Captures the README screenshots (docs/screenshots/*.webp, 1280×720) from a running build.
 *
 *   npm run build && npx vite preview --port 4173   # in one terminal
 *   npx tsx scripts/capture-screenshots.ts           # in another (optional: a base URL argument)
 *
 * Uses the Chromium that `npx playwright install chromium` installed, or PLAYWRIGHT_CHROMIUM_PATH.
 * Every game starts from a random seed, so each run gives fresh boards. Late-game shots (the
 * Chandlery, the Boss Night, Last Flame's Gloam) skip ahead by patching the running game's state
 * through the QA hook `window.__ww`, exactly as the e2e suite does; everything on screen is the
 * real game UI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { GameController } from '../src/game';
import type { GameState, Pos } from '../src/engine/types';

declare global {
  interface Window {
    __ww?: { controller: GameController; load: (state: GameState) => void };
  }
}

const OUT_DIR = fileURLToPath(new URL('../docs/screenshots', import.meta.url));
const BASE = process.argv[2] ?? 'http://localhost:4173/';
const VIEWPORT = { width: 1280, height: 720 };
const WEBP_QUALITY = 0.9;
const TIPS = ['plume', 'dread', 'push', 'bump', 'hot_wax', 'chimney', 'shrine', 'ward', 'dazed', 'aimed', 'smoldering', 'toll', 'moth_die', 'chandlery', 'boss_phase', 'crown', 'check', 'gloam_warning', 'lit_shrine'];

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

interface Session {
  page: Page;
  errors: string[];
}

/** A page with a seasoned profile (not the first game), every tip seen, and fast enemy turns. */
async function openSession(browser: Browser, presentation: Record<string, unknown>): Promise<Session> {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ([prefs, tips]) => {
      localStorage.setItem('chesscard.profile', JSON.stringify({ version: 1, playerName: 'Ash', gamesCompleted: 3 }));
      localStorage.setItem('chesscard.presentation', JSON.stringify(prefs));
      localStorage.setItem('chesscard.tips', JSON.stringify(tips));
    },
    [presentation, TIPS] as const,
  );
  return { page, errors };
}

/** Screenshot → WebP, encoded by the browser's canvas. */
async function shoot(page: Page, name: string): Promise<void> {
  const png = await page.screenshot();
  const webp = await page.evaluate(
    async ([data, quality]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')?.drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', quality).split(',')[1] ?? '';
    },
    [png.toString('base64'), WEBP_QUALITY] as const,
  );
  const bytes = Buffer.from(webp, 'base64');
  writeFileSync(`${OUT_DIR}/${name}.webp`, bytes);
  console.log(`docs/screenshots/${name}.webp (${Math.round(bytes.length / 1024)} KB)`);
}

async function idle(page: Page, phase: string, timeout = 120_000): Promise<void> {
  await page.waitForFunction(
    (ph) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.phase === ph || s.latest.result !== null);
    },
    phase,
    { timeout },
  );
}

async function tileCentre(page: Page, pos: Pos): Promise<Pos> {
  return page.evaluate((p) => {
    const input = document.querySelector<HTMLElement>('[data-testid=board-input]');
    const board = document.querySelector<HTMLElement>('.ww-gameboard');
    if (!input || !board) throw new Error('the board is not on screen');
    const rect = input.getBoundingClientRect();
    const tile = Number(board.getAttribute('data-tile'));
    const scale = rect.width / input.offsetWidth;
    const rows = Math.round(input.offsetHeight / tile);
    return { x: rect.left + (p.x + 0.5) * tile * scale, y: rect.top + (rows - 1 - p.y + 0.5) * tile * scale };
  }, pos);
}

async function clickTile(page: Page, pos: Pos): Promise<void> {
  const centre = await tileCentre(page, pos);
  await page.mouse.click(centre.x, centre.y);
}

async function hoverTile(page: Page, pos: Pos): Promise<void> {
  const centre = await tileCentre(page, pos);
  await page.mouse.move(centre.x, centre.y);
}

/** Patch the authoritative state in the page (`body` runs there with `st`, a deep copy). */
async function craft(page: Page, body: string): Promise<void> {
  await page.evaluate((src) => {
    const ww = window.__ww;
    if (!ww) throw new Error('no game on window.__ww');
    const st = structuredClone(ww.controller.getSnapshot().latest);
    new Function('st', src)(st);
    ww.load(st);
  }, body);
}

async function startGame(page: Page, mode: 'quick_play' | 'quick_last_flame', hero: string): Promise<void> {
  await page.goto(BASE);
  await page.getByRole('button', { name: mode === 'quick_play' ? /Quick Play/ : /Quick Last Flame/ }).first().click();
  await page.mouse.move(2, 2);
  await page.getByRole('button', { name: new RegExp(`Play as ${hero}`) }).click({ force: true });
  await page.getByTestId('game-screen').waitFor();
}

/** Night setup: wait out the title card, then press Ready for every seat on this screen. */
async function readyNight(page: Page): Promise<void> {
  await page.getByTestId('night-title').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  for (let i = 0; i < 8; i++) {
    const phase = await page.evaluate(() => window.__ww?.controller.getSnapshot().latest.phase);
    if (phase !== 'night_setup') return;
    const ready = page.getByTestId('ready');
    if (await ready.isVisible().catch(() => false)) await ready.click();
    await sleep(400);
  }
}

async function endTurnAndWait(page: Page): Promise<void> {
  const round = await page.evaluate(() => window.__ww?.controller.getSnapshot().latest.round ?? 0);
  await page.evaluate(() => window.__ww?.controller.endTurn(true));
  await page.waitForFunction(
    (r) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.result !== null || (s.latest.phase === 'players' && s.latest.round > r && s.uiSeat === 0));
    },
    round,
    { timeout: 120_000 },
  );
}

async function heroPos(page: Page): Promise<Pos> {
  return page.evaluate(() => {
    const s = window.__ww?.controller.getSnapshot().latest;
    const hero = s ? s.pieces[s.players[0]?.heroPieceId ?? ''] : undefined;
    if (!hero) throw new Error('no hero on the board');
    return hero.pos;
  });
}

async function heroStrikes(page: Page): Promise<Pos[]> {
  return page.evaluate(() => {
    const ww = window.__ww;
    const s = ww?.controller.getSnapshot().latest;
    return (ww?.controller.highlightsFor(s?.players[0]?.heroPieceId ?? '')?.strikes ?? []).map((mark) => mark.pos);
  });
}

/** Title, hero picker, and a Vigil turn with Vey selected (a strike ring among the red intents). */
async function menusAndTurn(browser: Browser): Promise<string[]> {
  const { page, errors } = await openSession(browser, { enemy_turn_speed: 'fast', animation_speed: 2, confirm_end_turn: 'never' });
  await page.goto(BASE);
  await sleep(2500);
  await page.mouse.move(820, 300);
  await sleep(800);
  await shoot(page, 'title');
  await page.getByRole('button', { name: /Quick Play/ }).first().click();
  await sleep(900);
  await page.getByRole('button', { name: /Play as Velveteen/ }).hover();
  await sleep(700);
  await shoot(page, 'hero-pick');
  await page.mouse.move(2, 2);
  await page.getByRole('button', { name: /Play as Vey/ }).click({ force: true });
  await page.getByTestId('game-screen').waitFor();
  await readyNight(page);
  await idle(page, 'players');
  for (let i = 0; i < 3 && (await heroStrikes(page)).length === 0; i++) await endTurnAndWait(page);
  await clickTile(page, await heroPos(page));
  await page.mouse.move(1150, 600);
  await sleep(700);
  await shoot(page, 'vigil-turn');
  return errors;
}

/** Card targeting: Wicklow aims Tinder Bolt (or Spark) at a Snuff, with the damage preview. */
async function cardTargeting(browser: Browser): Promise<string[]> {
  const { page, errors } = await openSession(browser, { enemy_turn_speed: 'fast', animation_speed: 2, confirm_end_turn: 'never' });
  await startGame(page, 'quick_play', 'Wicklow');
  await readyNight(page);
  await idle(page, 'players');
  for (let attempt = 0; attempt < 3; attempt++) {
    const cards = page.locator('.ww-hand-card:not(.ww-hand-card--disabled)');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const label = (await cards.nth(i).getAttribute('aria-label')) ?? '';
      if (!/Tinder Bolt|Spark/.test(label)) continue;
      await cards.nth(i).click();
      await sleep(500);
      // A Snuff to aim at (a piece target), not a Plume tile.
      const target = await page.evaluate(() => window.__ww?.controller.targetInfo()?.targets?.find((option) => option.choice.kind === 'piece')?.pos ?? null);
      if (!target) {
        await page.keyboard.press('Escape');
        continue;
      }
      await hoverTile(page, target);
      await sleep(700);
      await shoot(page, 'card-targeting');
      return errors;
    }
    await endTurnAndWait(page);
  }
  throw new Error('no card with a target in three rounds');
}

/** The Chandlery, the Boss Night (intro and a round) and Dawn Breaks, against the Guttered King. */
async function chandleryToVictory(browser: Browser): Promise<string[]> {
  const { page, errors } = await openSession(browser, { enemy_turn_speed: 'fast', animation_speed: 2, confirm_end_turn: 'never' });
  await startGame(page, 'quick_play', 'Brannoc');
  await readyNight(page);
  await idle(page, 'players');
  await craft(page, `st.night = st.config.nights - 1; st.round = st.roundsThisNight; st.vigil.dread = 1; st.config = { ...st.config, boss_choice: 'guttered_king' };`);
  await page.evaluate(() => window.__ww?.controller.endTurn(true));
  for (let i = 0; i < 600; i++) {
    const inChandlery = await page.evaluate(() => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && s.latest.phase === 'chandlery' && !s.animating;
    });
    if (inChandlery) break;
    const keep = page.getByRole('button', { name: /^Keep \d/ });
    if (await keep.isVisible().catch(() => false)) await keep.click();
    await sleep(150);
  }
  await sleep(1500);
  await page.locator('.ww-draft__card').nth(1).hover();
  await sleep(700);
  await shoot(page, 'chandlery');
  await page.getByRole('button', { name: /Skip the draft/ }).click();
  await page.getByRole('button', { name: 'No Boon' }).click();
  await idle(page, 'night_setup');
  await readyNight(page);
  await page.getByTestId('boss-intro').waitFor({ timeout: 30_000 });
  await sleep(2600);
  await shoot(page, 'boss-intro');
  await page.keyboard.press(' ');
  await idle(page, 'players');
  await endTurnAndWait(page);
  await sleep(900);
  await page.mouse.move(1150, 600);
  await shoot(page, 'boss-night');
  // The boss at 1 HP with Brannoc beside it: strike it down for real.
  await craft(
    page,
    `st.vigil.dread = Math.min(st.vigil.dread, 3); const b = st.pieces[st.boss.pieceId]; b.hp = 1;
     const h = st.pieces[st.players[0].heroPieceId]; h.smoldering = false; h.hp = Math.max(3, h.hp);
     const taken = new Set(Object.values(st.pieces).filter((p) => p.id !== h.id).flatMap((p) => { const o = []; for (let dx = 0; dx < p.size; dx++) for (let dy = 0; dy < p.size; dy++) o.push((p.pos.x + dx) + ',' + (p.pos.y + dy)); return o; }));
     const spots = [[b.pos.x, b.pos.y - 1], [b.pos.x + 1, b.pos.y - 1], [b.pos.x - 1, b.pos.y], [b.pos.x + 2, b.pos.y], [b.pos.x, b.pos.y + 2], [b.pos.x - 1, b.pos.y + 1], [b.pos.x + 2, b.pos.y + 1], [b.pos.x + 1, b.pos.y + 2]];
     const free = spots.find(([x, y]) => x >= 0 && y >= 0 && x < st.board.w && y < st.board.h && !taken.has(x + ',' + y) && st.board.tiles[y * st.board.w + x].type !== 'pillar');
     h.pos = { x: free[0], y: free[1] }; h.movesLeft = 1; h.strikesLeft = 1; h.exhausted = false;`,
  );
  await idle(page, 'players');
  const strike = (await heroStrikes(page))[0];
  if (!strike) throw new Error('no strike on the boss');
  await clickTile(page, await heroPos(page));
  await clickTile(page, strike);
  await page.getByTestId('game-over').waitFor({ timeout: 60_000 });
  await sleep(4200);
  await page.mouse.move(2, 2);
  await shoot(page, 'victory');
  return errors;
}

/** Quick Last Flame after two real rounds, then on Night 2 with the outer ring in the Gloam. */
async function lastFlame(browser: Browser): Promise<string[]> {
  const { page, errors } = await openSession(browser, { enemy_turn_speed: 'instant', animation_speed: 3, confirm_end_turn: 'never' });
  await startGame(page, 'quick_last_flame', 'Vey');
  await readyNight(page);
  await idle(page, 'players');
  for (let i = 0; i < 2; i++) await endTurnAndWait(page);
  await craft(
    page,
    `const ring = (b, x, y) => Math.min(x, y, b.w - 1 - x, b.h - 1 - y);
     st.night = 2; st.roundsThisNight = 4; st.round = Math.min(st.round, 4); st.lastFlame.truce = false;
     st.board.tiles.forEach((t, i) => { const x = i % st.board.w, y = Math.floor(i / st.board.w); const r = ring(st.board, x, y); t.gloam = r === 0; t.gloamWarning = r === 1; });
     st.lastFlame.gloam.closingsDone = 1; st.lastFlame.gloam.warningRing = 1; st.lastFlame.gloam.roundsToNext = 0;
     for (const p of Object.values(st.pieces)) { if (ring(st.board, p.pos.x, p.pos.y) === 0 && p.side === 'snuff') delete st.pieces[p.id]; }
     st.plumes = st.plumes.filter((m) => ring(st.board, m.pos.x, m.pos.y) > 1);
     st.players[0].glory = 9; st.players[1].glory = 13; st.players[2].glory = 6; st.lastFlame.leader = 1;`,
  );
  await sleep(900);
  await clickTile(page, await heroPos(page));
  await page.mouse.move(1260, 400);
  await sleep(500);
  await shoot(page, 'last-flame');
  return errors;
}

async function codex(browser: Browser): Promise<string[]> {
  const { page, errors } = await openSession(browser, {});
  await page.goto(BASE);
  await page.getByRole('button', { name: /Codex/ }).first().click();
  await page.getByRole('tab', { name: /Cards/ }).click();
  await sleep(900);
  await shoot(page, 'codex');
  return errors;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const errors: string[] = [];
    for (const capture of [menusAndTurn, cardTargeting, chandleryToVictory, lastFlame, codex]) errors.push(...(await capture(browser)));
    if (errors.length > 0) throw new Error(`console errors while capturing:\n${errors.join('\n')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

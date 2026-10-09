/**
 * Quick Play end to end, with no console errors on the way.
 * - The first-ever game: the scripted First Vigil. For each hero, every coach mark is followed by
 *   clicking where its ring points (the hero, the coached tile, the coached card, End Turn); the
 *   guaranteed line ends in a double kill with Dread +0 (GDD §15.2–15.3).
 * - A later game: Title → QUICK PLAY → pick Brannoc → move, strike and play a card through the
 *   real board and hand → End Turn → the Snuff Strike plays out → back to the players phase.
 *
 * Board positions are read from the running game (`window.__ww`), but every action is a real
 * click on the screen.
 */
import { expect, test, type Page } from '@playwright/test';
import { seedStorage, startOneClick, watchErrors, type Pos } from './helpers';

interface PieceLite {
  id: string;
  pos: Pos;
  side: string;
  owner: number | null;
}

interface SnapLite {
  phase: string;
  round: number;
  animating: boolean;
  uiSeat: number | null;
  result: unknown;
  heroId: string;
  pieces: PieceLite[];
  hand: string[];
}

async function readSnap(page: Page): Promise<SnapLite> {
  return page.evaluate(() => {
    const ww = window.__ww;
    if (!ww) throw new Error('no game controller on window.__ww');
    const s = ww.controller.getSnapshot();
    const seat = s.uiSeat ?? 0;
    return {
      phase: s.latest.phase,
      round: s.latest.round,
      animating: s.animating,
      uiSeat: s.uiSeat,
      result: s.latest.result,
      heroId: s.latest.players[0].heroPieceId,
      pieces: Object.values(s.latest.pieces).map((p) => ({ id: p.id, pos: p.pos, side: p.side, owner: p.owner })),
      hand: s.latest.players[seat].hand.map((c) => c.uid),
    };
  });
}

async function waitIdle(page: Page, phase: string): Promise<void> {
  await page.waitForFunction(
    (ph) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && (s.latest.phase === ph || s.latest.result !== null) && !s.animating;
    },
    phase,
    { timeout: 45_000 },
  );
}

async function tileCentre(page: Page, pos: Pos): Promise<Pos> {
  const box = await page.getByTestId('board-input').boundingBox();
  const tile = Number(await page.locator('.ww-gameboard').getAttribute('data-tile'));
  if (!box || !tile) throw new Error('board not laid out');
  const rows = Math.round(box.height / tile);
  return { x: box.x + pos.x * tile + tile / 2, y: box.y + (rows - 1 - pos.y) * tile + tile / 2 };
}

async function clickTile(page: Page, pos: Pos): Promise<void> {
  const c = await tileCentre(page, pos);
  await page.mouse.click(c.x, c.y);
}

/** Moves and strikes the controller currently highlights for a piece. */
async function highlights(page: Page, pieceId: string): Promise<{ moves: Array<{ pos: Pos; to: Pos }>; strikes: Pos[] }> {
  return page.evaluate((id) => {
    const hl = window.__ww?.controller.highlightsFor(id);
    return { moves: hl?.moves.map((m) => ({ pos: m.pos, to: m.to })) ?? [], strikes: hl?.strikes.map((m) => m.pos) ?? [] };
  }, pieceId);
}

function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** What the coach shows now: its mark, words and where its ring sits ("gone" without a mark). */
async function coachSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const mark = document.querySelector('[data-testid=coach-mark]');
    const ring = document.querySelector('.ww-coach__ring')?.getBoundingClientRect();
    if (!mark) return 'gone';
    return `${mark.getAttribute('data-mark')}|${mark.textContent}|${ring ? `${Math.round(ring.x)},${Math.round(ring.y)}` : ''}`;
  });
}

/** Wait until the coach stops changing (its ring follows its anchor a few times a second). */
async function settled(page: Page): Promise<void> {
  let last = await coachSignature(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(350);
    const now = await coachSignature(page);
    if (now === last) return;
    last = now;
  }
}

/** The guaranteed lines' coach marks per hero (§15.3; mark 3 is the timed info slip). */
const LINES: ReadonlyArray<{ hero: string; marks: string[] }> = [
  { hero: 'Brannoc', marks: ['1', '2', '3', '4', '5', '6'] },
  { hero: 'Velveteen', marks: ['1', '2', '3', '4', '5', '6'] },
  { hero: 'Wicklow', marks: ['1', '2', '3', '4', '5', '6'] },
  { hero: 'Vey', marks: ['1', '2', '3', '4', '5', '6'] },
];

for (const { hero, marks } of LINES) {
  test(`first-ever Quick Play as ${hero}: the coach marks guide the scripted line to a double kill`, async ({ page }) => {
    test.setTimeout(90_000);
    const problems = watchErrors(page);
    await seedStorage(page, { games: 0, tips: [], presentation: { enemy_turn_speed: 'fast' } });
    await startOneClick(page, 'quick_play', hero);
    // The scripted Night readies itself (no deploy) and opens on coach mark 1.
    const mark = page.getByTestId('coach-mark');
    await expect(mark).toHaveAttribute('data-mark', '1', { timeout: 20_000 });
    await expect(page.getByTestId('ready')).toHaveCount(0);

    const seen: string[] = [];
    for (let i = 0; i < 16; i++) {
      const visible = await mark.waitFor({ timeout: 5_000 }).then(() => true, () => false);
      if (!visible) break;
      const id = (await mark.getAttribute('data-mark')) ?? '';
      if (seen[seen.length - 1] !== id) seen.push(id);
      if (id === '3') {
        // The info slip fades by itself after 3 s.
        await expect(mark).not.toHaveAttribute('data-mark', '3', { timeout: 6_000 });
        continue;
      }
      if (id === '6') {
        await page.getByTestId('end-turn').click();
        const confirm = page.getByTestId('confirm-end-turn');
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
        break;
      }
      // Click where the coach ring points; wait for the coach to move on (new mark, words or ring).
      const ring = await page.locator('.ww-coach__ring').boundingBox();
      if (!ring) throw new Error(`mark ${id}: no ring`);
      const before = await coachSignature(page);
      await page.mouse.click(ring.x + ring.width / 2, ring.y + ring.height / 2);
      await expect.poll(() => coachSignature(page), { timeout: 8_000 }).not.toBe(before);
      await settled(page);
    }
    expect(seen).toEqual(marks);

    // The turn ends; the guaranteed line killed both Sootlings and no Candle was hit.
    await page.waitForFunction(() => window.__ww?.controller.getSnapshot().latest.phase !== 'players', null, { timeout: 30_000 });
    const result = await page.evaluate(() => {
      const s = window.__ww?.controller.getSnapshot().latest;
      return { kills: s?.players[0].stats.kills ?? 0, dread: s?.vigil?.dread ?? -1 };
    });
    expect(result.kills).toBeGreaterThanOrEqual(2);
    expect(result.dread).toBe(0);
    await expect(page.getByTestId('coach-layer')).toHaveCount(0);
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('a later Quick Play: move, strike, play a card, end the turn and survive the Snuff', async ({ page }) => {
  const problems = watchErrors(page);
  await seedStorage(page, { games: 3, presentation: { enemy_turn_speed: 'fast' } });
  await startOneClick(page, 'quick_play', 'Brannoc');
  await expect(page.getByTestId('game-screen')).toBeVisible();

  const ready = page.getByTestId('ready');
  if (await ready.isVisible().catch(() => false)) await ready.click();
  await waitIdle(page, 'players');
  // The seed is random: bring one Snuff two steps from the hero along a clear line (straight
  // ahead first, then any other direction), so one step puts it in reach.
  await page.evaluate(() => {
    const ww = window.__ww;
    if (!ww) throw new Error('no game');
    const st = structuredClone(ww.controller.getSnapshot().latest);
    const hero = st.pieces[st.players[0].heroPieceId];
    const snuff = Object.values(st.pieces).find((p) => p.side === 'snuff' && p.kind === 'enemy');
    if (!snuff) throw new Error('no Snuff on the board');
    const free = (p: { x: number; y: number }): boolean =>
      p.x >= 0 && p.y >= 0 && p.x < st.board.w && p.y < st.board.h && !Object.values(st.pieces).some((q) => q.id !== snuff.id && q.pos.x === p.x && q.pos.y === p.y) && st.board.tiles[p.y * st.board.w + p.x].type === 'flagstone';
    const directions = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]];
    const dir = directions.find(([dx, dy]) => free({ x: hero.pos.x + dx, y: hero.pos.y + dy }) && free({ x: hero.pos.x + 2 * dx, y: hero.pos.y + 2 * dy }));
    if (!dir) throw new Error('no clear line around the hero');
    snuff.pos = { x: hero.pos.x + 2 * dir[0], y: hero.pos.y + 2 * dir[1] };
    st.intents = st.intents.filter((i) => i.attackerId !== snuff.id);
    ww.load(st);
  });
  await waitIdle(page, 'players');

  let snap = await readSnap(page);
  expect(snap.uiSeat).toBe(0);
  const heroId = snap.heroId;
  const hero = () => snap.pieces.find((p) => p.id === heroId);
  const enemies = () => snap.pieces.filter((p) => p.side === 'snuff');

  // Move: select the hero, then the gold dot that brings it closest to a Snuff.
  await clickTile(page, hero()!.pos);
  await expect.poll(() => page.evaluate(() => window.__ww?.controller.getSnapshot().selection.pieceId)).toBe(heroId);
  const { moves } = await highlights(page, heroId);
  expect(moves.length).toBeGreaterThan(0);
  const target = moves.slice().sort((a, b) => Math.min(...enemies().map((e) => chebyshev(a.to, e.pos))) - Math.min(...enemies().map((e) => chebyshev(b.to, e.pos))))[0];
  await clickTile(page, target.pos);
  await expect.poll(async () => (await readSnap(page)).pieces.find((p) => p.id === heroId)?.pos).toEqual(target.to);
  await waitIdle(page, 'players');
  snap = await readSnap(page);

  // Strike: the hero stays selected after moving; click its first gold ring.
  const { strikes } = await highlights(page, heroId);
  expect(strikes.length, 'a Snuff in reach after the move').toBeGreaterThan(0);
  const enemyCount = enemies().length;
  if ((await page.evaluate(() => window.__ww?.controller.getSnapshot().selection.pieceId)) !== heroId) await clickTile(page, hero()!.pos);
  await clickTile(page, strikes[0]);
  await expect.poll(async () => (await readSnap(page)).pieces.filter((p) => p.side === 'snuff').length).toBeLessThan(enemyCount);
  await waitIdle(page, 'players');

  // Card: Spark if it is in hand (the tutorial's line), else each playable card in turn, then its
  // first glowing target (or Play for board-wide cards).
  snap = await readSnap(page);
  const handBefore = snap.hand.length;
  const playable = page.locator('.ww-hand-card:not(.ww-hand-card--disabled)');
  const uids = await playable.evaluateAll((els) => els.map((el) => ({ uid: el.getAttribute('data-card-uid'), id: el.getAttribute('data-card-id') })));
  uids.sort((a, b) => Number(b.id === 'spark') - Number(a.id === 'spark'));
  expect(uids.length).toBeGreaterThan(0);
  let played = false;
  for (const card of uids) {
    await page.locator(`.ww-hand-card[data-card-uid="${card.uid}"]`).click();
    const info = await page.evaluate(() => {
      const i = window.__ww?.controller.targetInfo();
      return i ? { steps: i.steps, first: i.targets[0]?.pos ?? null } : null;
    });
    if (info && info.steps === 0) await page.keyboard.press('Enter');
    else if (info?.first) await clickTile(page, info.first);
    played = await expect
      .poll(async () => (await readSnap(page)).hand.length, { timeout: 3_000 })
      .toBe(handBefore - 1)
      .then(() => true)
      .catch(() => false);
    if (played) break;
    await page.keyboard.press('Escape');
  }
  expect(played, 'a card was played').toBe(true);
  await waitIdle(page, 'players');

  // End the turn (confirming if asked) and let the Snuff Strike, Rise and Tally play out.
  const roundBefore = (await readSnap(page)).round;
  await page.getByTestId('end-turn').click();
  const confirm = page.getByTestId('confirm-end-turn');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForFunction(
    (round) => {
      const s = window.__ww?.controller.getSnapshot();
      return s !== undefined && !s.animating && (s.latest.result !== null || (s.latest.phase === 'players' && s.latest.round > round));
    },
    roundBefore,
    { timeout: 60_000 },
  );
  snap = await readSnap(page);
  expect(snap.result === null ? snap.round : roundBefore + 1).toBe(roundBefore + 1);
  expect(problems, problems.join('\n')).toEqual([]);
});

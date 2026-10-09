/** Static file serving (no traversal, MIME types, SPA fallback) and the lobby's seat lines. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getContent } from '../../../src/engine';
import type { RoomSnapshot } from '../../../src/net';
import { clock, seatLine, serverLabel, statusText } from '../../../src/ui/screens/lobby/lobbyModel';
import { startServer, type RunningServer } from '../../../server/app';
import { eventsFor, playbackBudget } from '../../../server/game';
import { silentLogger } from '../../../server/log';
import { fileRoomStore, nullRoomStore, type RoomRecord } from '../../../server/persist';
import { mimeType, resolveStaticPath } from '../../../server/static';

describe('static files', () => {
  let server: RunningServer;
  let dist: string;

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'ww-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Wickwatch</title>');
    writeFileSync(join(dist, 'assets', 'app-123.js'), 'console.log(1)');
    writeFileSync(join(dist, 'favicon.svg'), '<svg/>');
    server = await startServer({ port: 0, host: '127.0.0.1', distDir: dist, log: silentLogger, store: nullRoomStore, restore: false });
  });

  afterAll(async () => {
    await server.close();
  });

  it('serves files with their MIME types and the app for unknown routes', async () => {
    const index = await fetch(`${server.url}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const js = await fetch(`${server.url}/assets/app-123.js`);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${server.url}/favicon.svg`)).headers.get('content-type')).toBe('image/svg+xml');
    expect(await (await fetch(`${server.url}/some/route`)).text()).toContain('Wickwatch');
    expect((await fetch(`${server.url}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${server.url}/`, { method: 'POST' })).status).toBe(405);
  });

  it('never leaves the dist folder', async () => {
    expect(resolveStaticPath('/srv/dist', '/../../etc/passwd')).toBe('/srv/dist/etc/passwd');
    // URL paths are rooted, so ".." is clamped at the dist folder...
    expect(resolveStaticPath('/srv/dist', '/a/../../x')).toBe('/srv/dist/x');
    expect(resolveStaticPath('/srv/dist', '/%2e%2e/%2e%2e/etc/passwd')).toBe('/srv/dist/etc/passwd');
    expect(resolveStaticPath('/srv/dist', '/x%2f..%2f..%2fy')).toBe('/srv/dist/y');
    // ...and a raw request path that is not rooted is refused.
    expect(resolveStaticPath('/srv/dist', 'a/../../x')).toBeNull();
    expect(resolveStaticPath('/srv/dist', '..%2f..%2fetc%2fpasswd')).toBeNull();
    expect(resolveStaticPath('/srv/dist', '/%E0%A4%A')).toBeNull();
    expect(resolveStaticPath('/srv/dist', '/a%00b')).toBeNull();
    // Over HTTP the clamped path is just an unknown route: the app, never /etc/passwd.
    const response = await fetch(`${server.url}/..%2f..%2fetc%2fpasswd`);
    const body = await response.text();
    expect(body).toContain('Wickwatch');
    expect(body).not.toContain('root:');
    expect(mimeType('x.woff2')).toBe('font/woff2');
    expect(mimeType('x.unknown')).toBe('application/octet-stream');
  });

  it('refuses WebSocket upgrades on other paths', async () => {
    const { WebSocket } = await import('ws');
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/nope`);
    const outcome = await new Promise<string>((resolve) => {
      ws.on('open', () => resolve('open'));
      ws.on('error', () => resolve('error'));
    });
    expect(outcome).toBe('error');
  });
});

describe('file room store', () => {
  it('writes atomically, reads back, skips junk and removes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ww-data-'));
    const store = fileRoomStore(dir, silentLogger, 10_000);
    const record = { v: 1, code: 'KWTR', salt: 'abc', hostId: 'h', config: {}, lobbyConfig: {}, members: [], seats: [], log: [] } as unknown as RoomRecord;
    store.save(record);
    store.save({ ...record, salt: 'def' });
    expect(store.loadAll()).toEqual([]);
    store.flush();
    expect(store.loadAll().map((r) => r.salt)).toEqual(['def']);
    writeFileSync(join(dir, 'ZZZZ.json'), '{ not json');
    writeFileSync(join(dir, 'BCDF.json'), JSON.stringify({ v: 99 }));
    expect(store.loadAll().map((r) => r.code)).toEqual(['KWTR']);
    store.remove('KWTR');
    expect(store.loadAll()).toEqual([]);
  });
});

describe('server game helpers', () => {
  it('caps the playback budget at 6 s and hides rivals draws in Last Flame', () => {
    const many = Array.from({ length: 80 }, () => ({ type: 'night_started' as const, night: 1, siteId: 'x', isBossNight: false, tier: 1 as const }));
    expect(playbackBudget(many)).toBe(6000);
    expect(playbackBudget([])).toBe(0);
    const drawn = { type: 'cards_drawn' as const, seat: 1, count: 2, cards: [{ uid: 'c1', id: 'spark', tempered: false }, { uid: 'c2', id: 'flare', tempered: false }] };
    expect(eventsFor([drawn], 0, 'last_flame')[0]).toEqual({ ...drawn, cards: [] });
    expect(eventsFor([drawn], 1, 'last_flame')[0]).toEqual(drawn);
    expect(eventsFor([drawn], 0, 'vigil')[0]).toEqual(drawn);
    const offers = { type: 'chandlery_opened' as const, offers: [{ seat: 0, cards: ['spark'] }, { seat: 1, cards: ['flare'] }] };
    expect(eventsFor([offers], 1, 'last_flame')[0]).toEqual({ type: 'chandlery_opened', offers: [{ seat: 1, cards: ['flare'] }] });
  });
});

describe('lobby model', () => {
  const content = getContent();
  const base: RoomSnapshot = {
    code: 'KWTR',
    hostId: 'h',
    phase: 'lobby',
    seats: [],
    members: [
      { id: 'h', name: 'Ann', connected: true, seat: 0, host: true },
      { id: 'b', name: 'Bob', connected: false, seat: 1, host: false },
    ],
    config: { mode: 'vigil' } as RoomSnapshot['config'],
    selection: null,
    configVersion: 1,
    reconnectGrace: 120,
    canStart: false,
    startBlocker: null,
    game: null,
    expiresAt: 0,
  };
  const seat = { seat: 0, kind: 'human' as const, hero: 'sconce_paladin', name: 'Ann', occupantId: 'h', pendingId: null, connected: true, ready: true, status: 'human' as const, graceEndsAt: null };

  it('describes seats for the viewer', () => {
    const mine = seatLine({ ...base, seats: [seat] }, seat, 'h', content, 0);
    expect(mine.badges.map((b) => b.text)).toEqual(['Host', 'You']);
    expect(mine.action).toBe('leave');
    expect(mine.readyState).toBe('ready');
    const open = { ...seat, seat: 1, occupantId: null, status: 'open' as const, ready: false, hero: null };
    expect(seatLine({ ...base, seats: [seat, open] }, open, 'b', content, 0)).toMatchObject({ name: 'Open seat', action: 'take', detail: 'House Tallow · Random hero' });
    const away = { ...seat, seat: 1, occupantId: 'b', name: 'Bob', status: 'reconnecting' as const, graceEndsAt: 90_500 };
    expect(seatLine({ ...base, seats: [seat, away] }, away, 'h', content, 0).detail).toBe('1:31 left to come back · Brannoc');
    const bot = { ...seat, seat: 2, kind: 'bot_elder' as const, name: 'Elder', occupantId: null, status: 'bot' as const };
    const playing = { ...base, phase: 'playing' as const, seats: [seat, bot], members: [...base.members, { id: 'x', name: 'Cid', connected: true, seat: null, host: false }] };
    expect(seatLine(playing, bot, 'x', content, 0)).toMatchObject({ action: 'take_over', detail: 'AI ally · Hard · Brannoc' });
    expect(seatLine(playing, { ...bot, pendingId: 'x' }, 'x', content, 0).detail).toBe('You take it over at its next turn');
    expect(seatLine(playing, { ...bot, occupantId: 'b' }, 'h', content, 0).detail).toBe('A Warden stands in for Bob');
  });

  it('formats the connection line', () => {
    expect(statusText('open', 41.6)).toBe('Connected · 42 ms');
    expect(statusText('reconnecting', null)).toMatch(/reconnecting/);
    expect(serverLabel('ws://192.168.1.20:8787/ws')).toBe('192.168.1.20:8787');
    expect(clock(61_000)).toBe('1:01');
    expect(clock(-5)).toBe('0:00');
  });
});

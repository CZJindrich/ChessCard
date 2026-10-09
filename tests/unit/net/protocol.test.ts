/** Wire protocol validation: malformed, oversized and unknown messages never get through. */
import { describe, expect, it } from 'vitest';
import { normalizeServerUrl } from '../../../src/net/client';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  normalizeRoomCodeInput,
  parseClientMessage,
  parseServerMessage,
  sanitizeClientAction,
  sanitizeName,
} from '../../../src/net/protocol';

const parse = (value: unknown) => parseClientMessage(typeof value === 'string' ? value : JSON.stringify(value));

describe('parseClientMessage', () => {
  it('accepts every well-formed message type', () => {
    const good: unknown[] = [
      { type: 'hello', protocol: 1, name: 'Ann', engineVersion: '1.0.0', contentHash: 'abcd1234' },
      { type: 'hello', protocol: 1, name: 'Ann', engineVersion: '1.0.0', contentHash: 'abcd1234', token: 'tok' },
      { type: 'create_room', config: { mode: 'vigil' }, selection: { mode: 'vigil' } },
      { type: 'update_config', config: {}, selection: {}, hostOptions: { reconnect_grace: 90 } },
      { type: 'join_room', code: 'kwtr' },
      { type: 'claim_seat', seat: 3 },
      { type: 'release_seat' },
      { type: 'set_ready', ready: true },
      { type: 'start_game' },
      { type: 'return_to_lobby' },
      { type: 'set_name', name: 'Bob' },
      { type: 'action', action: { type: 'end_turn', seat: 1 } },
      { type: 'leave' },
      { type: 'ping', id: 4 },
      { type: 'ping' },
    ];
    for (const message of good) expect(parse(message), JSON.stringify(message)).toMatchObject({ ok: true });
  });

  it('refuses malformed JSON, non-objects and missing types', () => {
    for (const raw of ['', '{', 'null', '42', '"hello"', '[]', '{"type":5}', '{"kind":"hello"}']) {
      expect(parse(raw), raw).toMatchObject({ ok: false, code: 'bad_message' });
    }
    expect(parseClientMessage(42)).toMatchObject({ ok: false, code: 'bad_message' });
    expect(parseClientMessage(undefined)).toMatchObject({ ok: false, code: 'bad_message' });
  });

  it('refuses unknown message types', () => {
    expect(parse({ type: 'delete_server' })).toMatchObject({ ok: false, code: 'unknown_type' });
    expect(parse({ type: 'constructor' })).toMatchObject({ ok: false, code: 'unknown_type' });
  });

  it('refuses oversized messages before parsing them', () => {
    const big = JSON.stringify({ type: 'set_name', name: 'x'.repeat(MAX_CLIENT_MESSAGE_BYTES) });
    expect(parse(big)).toMatchObject({ ok: false, code: 'too_large' });
    // Multi-byte text counts in bytes.
    const wide = JSON.stringify({ type: 'set_name', name: '蝋'.repeat(Math.ceil(MAX_CLIENT_MESSAGE_BYTES / 3) + 10) });
    expect(parse(wide)).toMatchObject({ ok: false, code: 'too_large' });
  });

  it('checks field types', () => {
    const bad: unknown[] = [
      { type: 'hello', protocol: '1', name: 'Ann', engineVersion: '1', contentHash: 'x' },
      { type: 'hello', protocol: 1, engineVersion: '1', contentHash: 'x' },
      { type: 'hello', protocol: 1, name: 'Ann', engineVersion: '1', contentHash: 'x', token: 7 },
      { type: 'hello', protocol: 1, name: 'Ann', engineVersion: '1', contentHash: 'x', token: 't'.repeat(200) },
      { type: 'create_room', config: [], selection: {} },
      { type: 'create_room', config: {} },
      { type: 'update_config', config: {}, selection: {}, hostOptions: { reconnect_grace: 'long' } },
      { type: 'join_room' },
      { type: 'join_room', code: 'X'.repeat(40) },
      { type: 'claim_seat', seat: 4 },
      { type: 'claim_seat', seat: -1 },
      { type: 'claim_seat', seat: 1.5 },
      { type: 'set_ready', ready: 'yes' },
      { type: 'ping', id: -3 },
      { type: 'action' },
      { type: 'action', action: null },
    ];
    for (const message of bad) expect(parse(message), JSON.stringify(message)).toMatchObject({ ok: false, code: 'bad_message' });
  });
});

describe('sanitizeClientAction', () => {
  it('keeps only the fields the engine reads', () => {
    expect(sanitizeClientAction({ type: 'move', seat: 0, pieceId: 'p3', to: { x: 2, y: 5, z: 9 }, sneaky: true })).toEqual({ type: 'move', seat: 0, pieceId: 'p3', to: { x: 2, y: 5 } });
    expect(
      sanitizeClientAction({ type: 'play_card', seat: 1, cardUid: 'c9', targets: [{ kind: 'piece', pieceId: 'p2', extra: 1 }, { kind: 'tile', pos: { x: 1, y: 1 } }, { kind: 'direction', dir: { x: -1, y: 0 } }], mode: 1 }),
    ).toEqual({ type: 'play_card', seat: 1, cardUid: 'c9', targets: [{ kind: 'piece', pieceId: 'p2' }, { kind: 'tile', pos: { x: 1, y: 1 } }, { kind: 'direction', dir: { x: -1, y: 0 } }], mode: 1 });
    expect(sanitizeClientAction({ type: 'boon_pick', seat: 2, boon: 'prune', args: { cardUids: ['c1', 'c2'], junk: 'x' } })).toEqual({ type: 'boon_pick', seat: 2, boon: 'prune', args: { cardUids: ['c1', 'c2'] } });
    expect(sanitizeClientAction({ type: 'haunt', seat: 3, at: null })).toEqual({ type: 'haunt', seat: 3, at: null });
    expect(sanitizeClientAction({ type: 'retry_night', seat: 0, vote: false })).toEqual({ type: 'retry_night', seat: 0, vote: false });
  });

  it('refuses system, setup and malformed actions', () => {
    const bad: unknown[] = [
      { type: 'advance' },
      { type: 'advance', seat: 0 },
      { type: 'config_set', seat: 0, patch: {} },
      { type: 'start_game', seat: 0 },
      { type: 'end_turn' },
      { type: 'end_turn', seat: 7 },
      { type: 'move', seat: 0, pieceId: 'p1' },
      { type: 'move', seat: 0, pieceId: 'p1', to: { x: 'a', y: 1 } },
      { type: 'move', seat: 0, pieceId: 'p1', to: { x: 99, y: 1 } },
      { type: 'move', seat: 0, pieceId: '../../etc', to: { x: 1, y: 1 } },
      { type: 'play_card', seat: 0, cardUid: 'c1', targets: [{ kind: 'piece' }] },
      { type: 'play_card', seat: 0, cardUid: 'c1', targets: new Array(20).fill({ kind: 'tile', pos: { x: 1, y: 1 } }) },
      { type: 'free_action', seat: 0, kind: 'dance' },
      { type: 'carry_over', seat: 0, keep: 'p1' },
      { type: 'boon_pick', seat: 0, boon: 'heirloom' },
      { type: 'toString', seat: 0 },
      { type: '__proto__', seat: 0 },
      'end_turn',
      null,
    ];
    for (const action of bad) expect(sanitizeClientAction(action), JSON.stringify(action)).toBeNull();
  });
});

describe('parseServerMessage', () => {
  it('accepts server messages and refuses broken ones', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'pong', serverTime: 5 }))).toMatchObject({ ok: true });
    expect(parseServerMessage(JSON.stringify({ type: 'room', room: null }))).toMatchObject({ ok: true });
    expect(parseServerMessage(JSON.stringify({ type: 'welcome', token: 't', clientId: 'c', name: 'n', protocol: 1, serverTime: 1 }))).toMatchObject({ ok: true });
    expect(parseServerMessage(JSON.stringify({ type: 'game', seq: 1, view: {}, events: [], you: [], seats: [], serverTime: 1 }))).toMatchObject({ ok: false });
    expect(parseServerMessage(JSON.stringify({ type: 'room', room: { code: 'AEIO' } }))).toMatchObject({ ok: false });
    expect(parseServerMessage(JSON.stringify({ type: 'hack' }))).toMatchObject({ ok: false, code: 'unknown_type' });
    expect(parseServerMessage('not json')).toMatchObject({ ok: false });
  });
});

describe('names, codes and addresses', () => {
  it('cleans display names', () => {
    expect(sanitizeName('  Ann  ')).toBe('Ann');
    expect(sanitizeName('A\u0000n​n‮')).toBe('Ann');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(24);
    expect(sanitizeName(42)).toBe('');
  });

  it('normalises typed room codes to the vowel-free alphabet', () => {
    expect(normalizeRoomCodeInput('kw-tr')).toBe('KWTR');
    expect(normalizeRoomCodeInput('a e i o u kwtrz')).toBe('KWTR');
  });

  it('turns typed server addresses into WebSocket URLs', () => {
    expect(normalizeServerUrl('192.168.1.20:8787')).toBe('ws://192.168.1.20:8787/ws');
    expect(normalizeServerUrl('http://host:8787')).toBe('ws://host:8787/ws');
    expect(normalizeServerUrl('https://wick.example')).toBe('wss://wick.example/ws');
    expect(normalizeServerUrl('wss://wick.example/custom')).toBe('wss://wick.example/custom');
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('ftp://x')).toBeNull();
  });
});

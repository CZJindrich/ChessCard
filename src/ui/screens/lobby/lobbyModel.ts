/**
 * Pure helpers for the online lobby: what each seat row says, which button it offers, and the
 * words for the connection line. No React, so they are unit-tested directly.
 */
import type { ContentRegistry, GameConfig } from '../../../engine/types';
import type { NetStatus, RoomSeat, RoomSnapshot } from '../../../net';

export type SeatAction = 'take' | 'leave' | 'take_over' | null;

export interface SeatLine {
  /** The bold first line. */
  name: string;
  /** The dim second line. */
  detail: string;
  badges: Array<{ text: string; tone: 'gold' | 'ember' | 'verdigris' | 'plain' }>;
  action: SeatAction;
  /** Shows the Ready flame for human seats in the lobby. */
  readyState: 'ready' | 'waiting' | 'bot' | 'open' | 'playing';
}

const BOT_WORDS: Readonly<Record<string, string>> = {
  bot_apprentice: 'Easy',
  bot_warden: 'Normal',
  bot_elder: 'Hard',
};

export function botWord(kind: string): string {
  return BOT_WORDS[kind] ?? 'Normal';
}

export function houseLabel(seat: number): string {
  return ['House Beeswax', 'House Tallow', 'House Bayberry', 'House Rushlight'][seat] ?? `Seat ${seat + 1}`;
}

/** "1:42" for a countdown in ms. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function heroName(content: ContentRegistry, hero: string | null): string {
  if (!hero) return 'Random hero';
  return content.heroes.byId[hero]?.name ?? hero;
}

/** How one seat reads for the player `me` (their clientId). */
export function seatLine(room: RoomSnapshot, seat: RoomSeat, me: string | null, content: ContentRegistry, serverNow: number): SeatLine {
  const playing = room.phase === 'playing';
  const vigil = room.config.mode === 'vigil';
  const mine = me !== null && seat.occupantId === me;
  const iHoldOne = me !== null && room.seats.some((s) => s.occupantId === me || s.pendingId === me);
  const badges: SeatLine['badges'] = [];
  if (seat.occupantId && seat.occupantId === room.hostId) badges.push({ text: 'Host', tone: 'gold' });
  if (mine) badges.push({ text: 'You', tone: 'verdigris' });
  const hero = heroName(content, seat.hero);
  const house = houseLabel(seat.seat);
  const pending = seat.pendingId ? room.members.find((m) => m.id === seat.pendingId) : undefined;

  if (seat.status === 'reconnecting') {
    badges.push({ text: 'Reconnecting', tone: 'ember' });
    const left = seat.graceEndsAt !== null ? `${clock(seat.graceEndsAt - serverNow)} left to come back` : 'Waiting for them to come back';
    return { name: seat.name, detail: `${left} · ${hero}`, badges, action: mine && !playing ? 'leave' : null, readyState: playing ? 'playing' : 'waiting' };
  }

  if (!playing) {
    if (seat.status === 'open') {
      return { name: 'Open seat', detail: `${house} · ${hero}`, badges, action: 'take', readyState: 'open' };
    }
    if (seat.status === 'bot') {
      return { name: seat.name, detail: `${vigil ? 'AI ally' : 'Bot'} · ${botWord(seat.kind)} · ${hero}`, badges, action: null, readyState: 'bot' };
    }
    return { name: seat.name, detail: `${house} · ${hero}`, badges, action: mine ? 'leave' : null, readyState: seat.ready ? 'ready' : 'waiting' };
  }

  // A game is running.
  if (seat.status === 'bot') {
    const standIn = seat.occupantId ? room.members.find((m) => m.id === seat.occupantId) : undefined;
    const detail = pending
      ? `${pending.id === me ? 'You take' : `${pending.name} takes`} it over at its next turn`
      : standIn
        ? `A Warden stands in for ${standIn.name}`
        : `${vigil ? 'AI ally' : 'Bot'} · ${botWord(seat.kind)} · ${hero}`;
    const canTake = !seat.occupantId && !seat.pendingId && !iHoldOne;
    return { name: seat.name, detail, badges, action: canTake ? 'take_over' : null, readyState: 'bot' };
  }
  return { name: seat.name, detail: `${house} · ${hero}`, badges, action: null, readyState: 'playing' };
}

export function statusText(status: NetStatus, rtt: number | null): string {
  switch (status) {
    case 'idle':
      return 'Not connected';
    case 'connecting':
      return 'Connecting…';
    case 'open':
      return rtt === null ? 'Connected' : `Connected · ${Math.round(rtt)} ms`;
    case 'reconnecting':
      return 'Connection lost · reconnecting…';
    case 'closed':
      return 'Disconnected';
  }
}

/** "localhost:8787" from "ws://localhost:8787/ws". */
export function serverLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + (parsed.pathname && parsed.pathname !== '/ws' ? parsed.pathname : '');
  } catch {
    return url;
  }
}

/** The Start button's words. */
export function startLabel(config: GameConfig): string {
  return config.mode === 'vigil' ? 'Begin the Vigil' : 'Light the Last Flame';
}

/** "2 of 3 ready" over the claimed human seats. */
export function readyCount(room: RoomSnapshot): { ready: number; total: number } {
  const held = room.seats.filter((s) => s.occupantId !== null && room.phase === 'lobby');
  return { ready: held.filter((s) => s.ready).length, total: held.length };
}

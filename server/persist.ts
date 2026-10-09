/**
 * Room persistence (GDD §11.6: "The server persists the action log, so a restarted server can
 * resume the game"). One JSON file per running game in server/data/<CODE>.json, written
 * atomically (temp file + rename) and debounced so a burst of bot actions is one write.
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigSelection } from '../src/config/presets';
import type { GameConfig, SeatKind } from '../src/engine/types';
import { isRoomCode } from '../src/net/protocol';
import type { LogEntry } from './game';
import type { Logger } from './log';

export const ROOM_RECORD_VERSION = 1;

export interface MemberRecord {
  id: string;
  token: string;
  name: string;
  joinedAt: number;
  seat: number | null;
}

export interface SeatRecord {
  seat: number;
  kind: SeatKind;
  hero: string | null;
  botName: string;
  ownerId: string | null;
  control: 'human' | 'bot';
  standIn: SeatKind;
}

export interface RoomRecord {
  v: number;
  code: string;
  createdAt: number;
  savedAt: number;
  hostId: string;
  /** The lobby config (seats as configured), restored when the host returns to the lobby. */
  lobbyConfig: GameConfig;
  /** The game's config (seats as started) with the public seed. */
  config: GameConfig;
  selection: ConfigSelection;
  reconnectGrace: number;
  salt: string;
  gameStartedAt: number;
  members: MemberRecord[];
  seats: SeatRecord[];
  log: LogEntry[];
}

export interface RoomStore {
  save(record: RoomRecord): void;
  remove(code: string): void;
  loadAll(): RoomRecord[];
  /** Write everything pending now (shutdown). */
  flush(): void;
}

/** Keeps nothing (tests, or `--no-persist`). */
export const nullRoomStore: RoomStore = {
  save: () => undefined,
  remove: () => undefined,
  loadAll: () => [],
  flush: () => undefined,
};

function isRecordLike(value: unknown): value is RoomRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<RoomRecord>;
  return (
    r.v === ROOM_RECORD_VERSION &&
    isRoomCode(r.code) &&
    typeof r.salt === 'string' &&
    typeof r.hostId === 'string' &&
    typeof r.config === 'object' &&
    r.config !== null &&
    typeof r.lobbyConfig === 'object' &&
    Array.isArray(r.members) &&
    Array.isArray(r.seats) &&
    Array.isArray(r.log)
  );
}

export function fileRoomStore(dir: string, log: Logger, debounceMs = 250): RoomStore {
  mkdirSync(dir, { recursive: true });
  const pending = new Map<string, RoomRecord>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pathFor = (code: string): string => join(dir, `${code}.json`);
  const write = (record: RoomRecord): void => {
    const path = pathFor(record.code);
    const tmp = `${path}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(record));
      renameSync(tmp, path);
    } catch (error) {
      log.warn(`${record.code} could not be saved: ${String(error)}`);
    }
  };
  const flush = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const record of pending.values()) write(record);
    pending.clear();
  };

  return {
    save(record) {
      pending.set(record.code, record);
      if (!timer) {
        timer = setTimeout(flush, debounceMs);
        timer.unref?.();
      }
    },
    remove(code) {
      pending.delete(code);
      try {
        rmSync(pathFor(code), { force: true });
      } catch {
        // Already gone.
      }
    },
    loadAll() {
      const records: RoomRecord[] = [];
      let names: string[] = [];
      try {
        names = readdirSync(dir).filter((name) => /^[A-Z]{4}\.json$/.test(name));
      } catch {
        return records;
      }
      for (const name of names) {
        try {
          const value: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'));
          if (isRecordLike(value)) records.push(value);
          else log.warn(`${name}: not a room record, skipped`);
        } catch (error) {
          log.warn(`${name}: unreadable (${String(error)}), skipped`);
        }
      }
      return records;
    },
    flush,
  };
}

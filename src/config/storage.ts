/**
 * Guarded key-value storage. Every access is wrapped: private mode, quota errors, SSR and the
 * Node server (no localStorage) all degrade to "nothing stored".
 */

/** The subset of the Web Storage API the config module needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null where it is missing or blocked. */
export function browserStorage(): KeyValueStorage | null {
  try {
    const candidate = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    return candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

/** In-memory storage (tests, server, or as a fallback). */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    dump: () => Object.fromEntries(data),
  };
}

/** Parsed JSON at `key`, or null when absent, unreadable or not JSON. */
export function readJson(storage: KeyValueStorage | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Store JSON at `key`; false when storage is missing or the write failed (quota, private mode). */
export function writeJson(storage: KeyValueStorage | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

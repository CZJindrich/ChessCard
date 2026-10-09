/** Transient notices ("Settings code copied", pasted-code clamps, mod load results). */
import { createStore, type ReadableStore } from './store';

export type ToastTone = 'info' | 'success' | 'warning';

export interface Toast {
  id: number;
  title: string;
  lines: readonly string[];
  tone: ToastTone;
}

export interface ToastInput {
  title: string;
  lines?: readonly string[];
  tone?: ToastTone;
  /** Auto-dismiss delay; 0 keeps the toast until closed. Defaults scale with the text length. */
  durationMs?: number;
}

export interface ToastStore extends ReadableStore<readonly Toast[]> {
  show(input: ToastInput): number;
  dismiss(id: number): void;
}

/** At most this many toasts stay on screen; older ones are dropped first. */
export const MAX_TOASTS = 4;

/** Reading time: 4 s plus 1.2 s per extra line, capped at 12 s. */
export function toastDuration(lines: number): number {
  return Math.min(12000, 4000 + lines * 1200);
}

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
}

export function createToastStore(timers: TimerApi = globalThis): ToastStore {
  const store = createStore<readonly Toast[]>([]);
  let nextId = 1;
  const dismiss = (id: number): void => store.update((list) => (list.some((t) => t.id === id) ? list.filter((t) => t.id !== id) : list));
  return {
    get: store.get,
    subscribe: store.subscribe,
    dismiss,
    show(input) {
      const toast: Toast = { id: nextId++, title: input.title, lines: input.lines ?? [], tone: input.tone ?? 'info' };
      store.update((list) => [...list, toast].slice(-MAX_TOASTS));
      const duration = input.durationMs ?? toastDuration(toast.lines.length);
      if (duration > 0) timers.setTimeout(() => dismiss(toast.id), duration);
      return toast.id;
    },
  };
}

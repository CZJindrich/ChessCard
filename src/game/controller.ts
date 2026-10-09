/**
 * The client game controller (ARCHITECTURE §6). A plain class with a subscribe API for
 * `useSyncExternalStore`. It
 * - talks to the rules through a `GameTransport` (local engine or online server);
 * - plays engine events back one at a time with GDD §16.9 durations, keeping a lagging
 *   "shown" state so the board matches what has been animated so far;
 * - dispatches `advance` whenever an automated phase is due and playback is idle (local);
 * - runs bot seats through a `BotRunner` (Web Worker, sync fallback), one action at a time;
 * - owns the UI selection model (piece, card / power picks, hover, hint, notices).
 */
import { getContent, hauntOptions, pendingAutomation, reasonText } from '../engine';
import type { HauntOption } from '../engine';
import type { Action, CardTargetChoice, CardTargetInfo, ContentRegistry, GameEvent, GameState, Piece, Pos, ReasonCode, ReasonParams } from '../engine/types';
import type { MusicMood, PlayOptions, SfxName } from '../audio';
import { BotDriver, decisionSeats, isBotSeat, type BotHost } from './botDriver';
import { createBotRunner, type BotRunner } from './bots';
import { hasRemainingActions, pieceHighlights, pieceIsReady, readyPieces, type PieceHighlights } from './highlights';
import { clearChoices, EMPTY_SELECTION, samePosOrNull, type NoticeAnchor, type Selection, type UiNotice } from './selection';
import { cuesForEvent, isEssentialCue, musicMoodFor } from './sfx';
import { canSkipRest, cardStep, needsMode, optionAt, picksComplete, playCardAction, powerStep, usePowerAction } from './targeting';
import { paceForAction, paceScale, PHASE_GAP_MS, playbackDuration, type Pace, type PlaybackSettings } from './timing';
import type { GameTransport, SendResult, TransportUpdate } from './transport';
import { patchView } from './viewPatch';

export interface GameAudio {
  play(name: SfxName, opts?: PlayOptions): void;
  setMusic(mood: MusicMood | null): void;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ControllerSettings extends PlaybackSettings {
  confirm_end_turn: 'smart' | 'always' | 'never';
}

export const DEFAULT_CONTROLLER_SETTINGS: ControllerSettings = {
  animation_speed: 1,
  enemy_turn_speed: 'normal',
  reduced_motion: false,
  confirm_end_turn: 'smart',
};

export interface ControllerOptions {
  transport: GameTransport;
  audio?: GameAudio | null;
  /** Read on every use, so settings changed mid-game apply at once. */
  settings?: () => ControllerSettings;
  scheduler?: Scheduler;
  /** Creates the bot runner when the controller starts (default: Web Worker, sync fallback). */
  bots?: () => BotRunner;
  content?: () => ContentRegistry;
}

/** The event being animated right now. */
export interface PlaybackStep {
  id: number;
  event: GameEvent;
  /** Scaled duration in ms (0 = shown instantly). */
  duration: number;
  pace: Pace;
}

export interface ControllerSnapshot {
  /** What the board shows (lags behind `latest` while events play back). */
  state: GameState;
  /** The authoritative state. */
  latest: GameState;
  playing: PlaybackStep | null;
  /** Events are still queued or playing. */
  animating: boolean;
  /** A bot seat is planning (the plaque shows the thinking wisp). */
  thinkingSeat: number | null;
  /** The seat the local player acts for right now, or null (watching). */
  uiSeat: number | null;
  controlledSeats: readonly number[];
  selection: Selection;
  notice: UiNotice | null;
  /** The End Turn confirmation is open. */
  confirmingEndTurn: boolean;
  /** Playback and automation are paused (`hold`): the boss intro, a tip, the pause menu. */
  held: boolean;
}

export type EndTurnOutcome = 'ended' | 'confirm' | 'blocked';

/** An update as it arrives from the transport, with the state it replaced. */
export interface AppliedUpdate {
  action: Action | null;
  before: GameState;
  after: GameState;
  events: readonly GameEvent[];
}

/**
 * A veto on the local player's actions (the tutorial's coached line): return null to allow,
 * or the text shown instead of sending the action.
 */
export type ActionGuard = (action: Action, state: GameState) => string | null;

type QueueItem = { kind: 'event'; event: GameEvent; pace: Pace; after: GameState } | { kind: 'end'; after: GameState };

const NOTICE_MS = 2600;
/** Consecutive instant advances before the controller assumes the engine is stuck. */
const MAX_INSTANT_ADVANCES = 2000;

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/** Reason strings, with a friendlier line for features the engine has not enabled yet. */
export function reasonLine(code: ReasonCode, params: ReasonParams = {}): string {
  if (code === 'NOT_ENABLED') return `${params.feature ?? 'This'} isn't ready yet`;
  return reasonText(code, params);
}

export class GameController {
  private readonly transport: GameTransport;
  private readonly audio: GameAudio | null;
  private readonly settings: () => ControllerSettings;
  private readonly scheduler: Scheduler;
  private readonly makeBots: () => BotRunner;
  private bots: BotDriver | null = null;
  private readonly content: () => ContentRegistry;

  private latest: GameState;
  private shown: GameState;
  private queue: QueueItem[] = [];
  private playing: PlaybackStep | null = null;
  private stepId = 0;
  private timer: unknown = null;
  private pumping = false;
  private repump = false;
  private instantAdvances = 0;
  private stateStamp = 0;

  private selection: Selection = EMPTY_SELECTION;
  private notice: UiNotice | null = null;
  private noticeTimer: unknown = null;
  private noticeId = 0;
  private confirmingEndTurn = false;

  private music: MusicMood | null = null;

  private readonly holds = new Set<string>();
  /** Timer callbacks that came due while held; they run on the last `release`. */
  private deferred: Array<() => void> = [];

  private readonly listeners = new Set<() => void>();
  private readonly cueListeners = new Set<(step: PlaybackStep) => void>();
  private readonly appliedListeners = new Set<(update: AppliedUpdate) => void>();
  private guard: ActionGuard | null = null;
  private hauntCache: { state: GameState; seat: number; value: HauntOption[] } | null = null;
  private readonly unsubscribe: Array<() => void> = [];
  private snapshot: ControllerSnapshot;
  private disposed = false;
  private started = false;
  private highlightCache: { state: GameState; seat: number; pieceId: string; value: PieceHighlights } | null = null;
  private cardCache: { state: GameState; seat: number; key: string; value: CardTargetInfo } | null = null;

  constructor(opts: ControllerOptions) {
    this.transport = opts.transport;
    this.audio = opts.audio ?? null;
    this.settings = opts.settings ?? (() => DEFAULT_CONTROLLER_SETTINGS);
    this.scheduler = opts.scheduler ?? defaultScheduler;
    this.makeBots = opts.bots ?? createBotRunner;
    this.content = opts.content ?? getContent;
    this.latest = this.transport.getState();
    this.shown = this.latest;
    this.snapshot = this.buildSnapshot();
    this.unsubscribe.push(this.transport.onUpdate((u) => this.onUpdate(u)));
    this.unsubscribe.push(this.transport.onReject((r) => this.showNotice(reasonLine(r.reason, r.params), { kind: 'board' }, 'error')));
  }

  // ===========================================================================================
  // Store API
  // ===========================================================================================

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  /** Listen to each event as its playback starts (FX layers, tests). */
  onCue(listener: (step: PlaybackStep) => void): () => void {
    this.cueListeners.add(listener);
    return () => {
      this.cueListeners.delete(listener);
    };
  }

  /** Listen to every update as it arrives (before playback): the action, and the states around it. */
  onApplied(listener: (update: AppliedUpdate) => void): () => void {
    this.appliedListeners.add(listener);
    return () => {
      this.appliedListeners.delete(listener);
    };
  }

  /** Install (or clear) a veto on the local player's actions. Automation and bots are never vetoed. */
  setGuard(guard: ActionGuard | null): void {
    this.guard = guard;
  }

  /**
   * Begin automation (auto-advance, bots). `stop` pauses it and `start` resumes, so React's
   * StrictMode mount → unmount → mount cycle is harmless.
   */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.bots = new BotDriver(this.botHost(), this.makeBots());
    this.pump();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.clearTimer();
    this.playing = null;
    this.bots?.dispose();
    this.bots = null;
  }

  private botHost(): BotHost {
    return {
      latest: () => this.latest,
      stamp: () => this.stateStamp,
      send: (action) => this.transport.send(action),
      wait: (ms, then) => (ms > 0 ? this.wait(ms, then) : then()),
      pump: () => this.pump(),
      settings: () => this.settings(),
    };
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    if (this.noticeTimer !== null) this.scheduler.clearTimeout(this.noticeTimer);
    for (const off of this.unsubscribe) off();
    this.listeners.clear();
    this.cueListeners.clear();
    this.transport.dispose();
  }

  // ===========================================================================================
  // Derived queries (memoised per state)
  // ===========================================================================================

  /** Highlights for one of the acting seat's pieces on the authoritative state. */
  highlightsFor(pieceId: string): PieceHighlights | null {
    const seat = this.snapshot.uiSeat;
    if (seat === null) return null;
    const cache = this.highlightCache;
    if (cache && cache.state === this.latest && cache.seat === seat && cache.pieceId === pieceId) return cache.value;
    const value = pieceHighlights(this.latest, seat, pieceId);
    this.highlightCache = { state: this.latest, seat, pieceId, value };
    return value;
  }

  /** Targets for the next pick of the selected card or Power. */
  targetInfo(): CardTargetInfo | null {
    const seat = this.snapshot.uiSeat;
    const { card, power } = this.selection;
    if (seat === null || (!card && !power)) return null;
    const key = card ? `c:${card.uid}:${card.mode}:${JSON.stringify(card.picks)}` : `p:${JSON.stringify(power?.picks ?? [])}`;
    const cache = this.cardCache;
    if (cache && cache.state === this.latest && cache.seat === seat && cache.key === key) return cache.value;
    const value = card ? cardStep(this.latest, seat, card) : powerStep(this.latest, seat, power ?? { picks: [] });
    this.cardCache = { state: this.latest, seat, key, value };
    return value;
  }

  // ===========================================================================================
  // Dispatch
  // ===========================================================================================

  /** Send an action. Failures show their reason (with the shake on `anchor`) and play uiError. */
  dispatch(action: Action, anchor: NoticeAnchor = { kind: 'board' }): boolean {
    if (this.disposed) return false;
    const vetoed = this.guard?.(action, this.latest) ?? null;
    if (vetoed !== null) {
      this.showNotice(vetoed, anchor, 'info');
      return false;
    }
    const result: SendResult = this.transport.send(action);
    if (!result.ok) {
      this.showNotice(reasonLine(result.reason, result.params), anchor, 'error');
      return false;
    }
    return true;
  }

  private onUpdate(update: TransportUpdate): void {
    const pace = paceForAction(update.action?.type ?? null);
    const before = this.latest;
    this.latest = update.state;
    this.stateStamp += 1;
    for (const event of update.events) this.queue.push({ kind: 'event', event, pace, after: update.state });
    this.queue.push({ kind: 'end', after: update.state });
    if (update.action?.type !== 'advance') this.instantAdvances = 0;
    this.afterStateChange(update.action);
    const applied: AppliedUpdate = { action: update.action, before, after: update.state, events: update.events };
    for (const listener of [...this.appliedListeners]) listener(applied);
    this.pump();
  }

  /** Keep the selection meaningful after the state moved on. */
  private afterStateChange(action: Action | null): void {
    const seat = this.computeUiSeat();
    let sel = this.selection;
    if (seat === null || (action && action.type !== 'advance' && 'seat' in action && action.seat === seat)) {
      sel = { ...sel, card: null, power: null, hint: null, previewEndTurn: false };
    }
    if (sel.pieceId) {
      const piece = this.latest.pieces[sel.pieceId];
      const keep = seat !== null && piece !== undefined && piece.owner === seat && (this.latest.phase === 'night_setup' || pieceIsReady(this.latest, seat, piece));
      if (!keep) sel = { ...sel, pieceId: null };
    }
    if (sel.card && seat !== null && !this.latest.players[seat]?.hand.some((c) => c.uid === sel.card?.uid)) sel = { ...sel, card: null };
    if (sel.inspectId && !this.latest.pieces[sel.inspectId]) sel = { ...sel, inspectId: null };
    if (seat === null) sel = clearChoices(sel);
    this.confirmingEndTurn = false;
    this.selection = sel;
  }

  // ===========================================================================================
  // Playback pump
  // ===========================================================================================

  private pump(): void {
    if (this.pumping) {
      this.repump = true;
      return;
    }
    this.pumping = true;
    try {
      do {
        this.repump = false;
        this.step();
      } while (this.repump && !this.disposed);
    } finally {
      this.pumping = false;
    }
    this.emit();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }

  private wait(ms: number, then: () => void): void {
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      if (this.disposed) return;
      if (this.holds.size > 0) {
        this.deferred.push(then);
        return;
      }
      then();
      this.pump();
    }, ms);
  }

  /**
   * Pause playback and automation (no next event, no `advance`, no bot action) while something
   * must be read: the boss intro, a first-time tip, the pause menu. Holds are keyed, so several
   * overlays can hold at once; player input stays live.
   */
  hold(reason: string): void {
    if (this.disposed || this.holds.has(reason)) return;
    this.holds.add(reason);
    this.emit();
  }

  /** Lift one hold; the last one resumes playback where it stopped. */
  release(reason: string): void {
    if (!this.holds.delete(reason) || this.disposed) return;
    if (this.holds.size > 0) {
      this.emit();
      return;
    }
    const due = this.deferred;
    this.deferred = [];
    for (const then of due) then();
    this.pump();
  }

  private step(): void {
    if (this.disposed || this.timer !== null) return;
    // A cue listener may hold mid-batch (the boss intro), even during instant playback.
    while (this.queue.length > 0 && this.holds.size === 0) {
      const item = this.queue.shift();
      if (!item) break;
      if (item.kind === 'end') {
        this.shown = item.after;
        continue;
      }
      if (this.startEvent(item)) return;
    }
    if (this.holds.size > 0) return;
    this.playing = null;
    this.updateMusic();
    if (this.started) this.drive();
  }

  /** Show one event; returns true when it takes time (a timer now waits for it). */
  private startEvent(item: Extract<QueueItem, { kind: 'event' }>): boolean {
    const settings = this.settings();
    const duration = playbackDuration(item.event, item.pace, settings);
    const before = this.shown;
    this.shown = patchView(this.shown, item.event, item.after, this.content());
    const step: PlaybackStep = { id: ++this.stepId, event: item.event, duration, pace: item.pace };
    this.playing = step;
    this.playCues(item.event, before, duration, paceScale(item.pace, settings));
    for (const listener of [...this.cueListeners]) listener(step);
    if (duration <= 0) return false;
    this.wait(duration, () => {
      this.playing = null;
    });
    return true;
  }

  private playCues(event: GameEvent, before: GameState, duration: number, scale: number): void {
    if (!this.audio) return;
    for (const cue of cuesForEvent(event, before, this.content())) {
      if (duration <= 0 && !isEssentialCue(cue.name)) continue;
      const delay = (cue.delay ?? 0) * scale;
      if (delay > 0 && duration > 0) {
        const audio = this.audio;
        this.scheduler.setTimeout(() => {
          if (!this.disposed) audio.play(cue.name, cue.opts);
        }, delay);
      } else {
        this.audio.play(cue.name, cue.opts);
      }
    }
  }

  /** Finish the queued events at once (a click during the player's own animation). */
  skipPlayback(): void {
    if (this.queue.length === 0 && this.playing === null) return;
    this.clearTimer();
    this.playing = null;
    this.queue = [];
    this.shown = this.latest;
    this.pump();
  }

  private updateMusic(): void {
    if (!this.audio || this.queue.length > 0) return;
    const mood = musicMoodFor(this.shown, this.content());
    if (mood === this.music) return;
    this.music = mood;
    this.audio.setMusic(mood);
  }

  // ===========================================================================================
  // Automation and bots (local authority only)
  // ===========================================================================================

  private drive(): void {
    if (!this.transport.runsAutomation || this.latest.result) return;
    if (pendingAutomation(this.latest)) {
      this.scheduleAdvance();
      return;
    }
    this.bots?.drive();
  }

  private scheduleAdvance(): void {
    const gap = Math.round(PHASE_GAP_MS * paceScale('enemy', this.settings()));
    const advance = (): void => {
      if (!pendingAutomation(this.latest)) return;
      const result = this.transport.send({ type: 'advance' });
      if (!result.ok) console.error(`advance refused: ${result.reason}`);
    };
    if (gap > 0) {
      this.wait(gap, advance);
      return;
    }
    this.instantAdvances += 1;
    if (this.instantAdvances > MAX_INSTANT_ADVANCES) {
      console.error('automation stopped: too many instant advances');
      return;
    }
    advance();
  }

  // ===========================================================================================
  // Seats
  // ===========================================================================================

  private computeUiSeat(): number | null {
    const s = this.latest;
    if (s.result) return null;
    const controlled = this.transport.controlledSeats(s);
    const human = (seat: number): boolean => controlled.includes(seat) && !isBotSeat(s, seat);
    if (s.phase === 'players') return s.activeSeat !== null && human(s.activeSeat) ? s.activeSeat : null;
    return decisionSeats(s).find(human) ?? null;
  }

  // ===========================================================================================
  // Haunting (Last Flame, GDD §13.2.7)
  // ===========================================================================================

  /** The acting seat must place its Haunt Plume now. */
  hauntPending(): boolean {
    const seat = this.snapshot.uiSeat;
    return seat !== null && (this.latest.players[seat]?.haunt.pending ?? false);
  }

  /** Legal Haunt Plume tiles for the acting seat, each with the hero it would haunt (empty when no haunt is due). */
  hauntTargets(): HauntOption[] {
    const seat = this.snapshot.uiSeat;
    if (seat === null || !this.hauntPending()) return [];
    const cache = this.hauntCache;
    if (cache && cache.state === this.latest && cache.seat === seat) return cache.value;
    const value = hauntOptions(this.latest, seat);
    this.hauntCache = { state: this.latest, seat, value };
    return value;
  }

  /** Place the Haunt Plume on a tile, or skip with null. */
  haunt(at: Pos | null): boolean {
    const seat = this.snapshot.uiSeat;
    if (seat === null || !this.hauntPending()) return false;
    return this.dispatch({ type: 'haunt', seat, at }, at ? { kind: 'board' } : { kind: 'control', id: 'haunt' });
  }

  /** Vigil co-op: claim a seat's turn (a human's "Take My Turn", or "Let them act" for an AI ally). */
  claim(seat: number): boolean {
    return this.dispatch({ type: 'claim_turn', seat }, { kind: 'control', id: 'claim' });
  }

  /** The C key: claim the first local human seat that still has its turn to take. */
  claimNext(): boolean {
    const s = this.latest;
    if (s.phase !== 'players' || s.activeSeat !== null) return false;
    const seat = this.transport.controlledSeats(s).find((q) => !isBotSeat(s, q) && !s.players[q].turnEnded);
    return seat === undefined ? false : this.claim(seat);
  }

  // ===========================================================================================
  // Selection and board input
  // ===========================================================================================

  private setSelection(next: Selection): void {
    if (next === this.selection) return;
    this.selection = next;
    this.emit();
  }

  private uiSeatNow(): number | null {
    return this.snapshot.uiSeat;
  }

  /** Board input is live: nothing is animating and the local player is acting. */
  private inputReady(): boolean {
    if (this.queue.length > 0 || this.playing !== null) {
      const playerPace = this.playing?.pace !== 'enemy' && this.queue.every((q) => q.kind === 'end' || q.pace === 'player');
      if (!playerPace) return false;
      this.skipPlayback();
    }
    return this.uiSeatNow() !== null;
  }

  hoverTile(pos: Pos | null): void {
    if (samePosOrNull(pos, this.selection.hover) && !this.selection.keyCursor) return;
    this.setSelection({ ...this.selection, hover: pos, keyCursor: false });
  }

  /**
   * Arrow keys (§15.7): move the keyboard cursor. The first press puts it on the selected piece
   * (else your hero, else the board's centre); the cursor is the hovered tile, so tooltips,
   * previews and G (ping) follow it, and Enter acts on it.
   */
  moveCursor(dx: number, dy: number): void {
    const board = this.latest.board;
    const current = this.selection.keyCursor ? this.selection.hover : null;
    const start = current ?? this.cursorOrigin();
    const next = current ? { x: Math.min(board.w - 1, Math.max(0, start.x + dx)), y: Math.min(board.h - 1, Math.max(0, start.y + dy)) } : start;
    this.setSelection({ ...this.selection, hover: next, keyCursor: true });
  }

  private cursorOrigin(): Pos {
    const s = this.latest;
    const selected = this.selection.pieceId ? s.pieces[this.selection.pieceId] : undefined;
    if (selected) return selected.pos;
    const seat = this.uiSeatNow() ?? this.transport.controlledSeats(s)[0];
    const hero = seat !== undefined ? s.pieces[s.players[seat]?.heroPieceId ?? ''] : undefined;
    return hero ? hero.pos : { x: Math.floor(s.board.w / 2), y: Math.floor(s.board.h / 2) };
  }

  /** Enter (§15.7): act on the keyboard cursor's tile, else play the selected card or Power. */
  confirm(): boolean {
    const { hover, keyCursor } = this.selection;
    if (keyCursor && hover) {
      this.clickTile(hover);
      return true;
    }
    return this.tryPlaySelected();
  }

  hoverIntent(intentId: string | null): void {
    if (intentId === this.selection.hoverIntentId) return;
    this.setSelection({ ...this.selection, hoverIntentId: intentId });
  }

  inspect(pieceId: string | null): void {
    this.setSelection({ ...this.selection, inspectId: pieceId });
  }

  toggleIntents(): void {
    this.setSelection({ ...this.selection, showIntents: !this.selection.showIntents });
  }

  setEndTurnPreview(on: boolean): void {
    if (on === this.selection.previewEndTurn) return;
    this.setSelection({ ...this.selection, previewEndTurn: on && this.uiSeatNow() !== null && this.latest.phase === 'players' });
  }

  selectPiece(pieceId: string | null): void {
    const seat = this.uiSeatNow();
    if (pieceId === null || seat === null) {
      this.setSelection({ ...this.selection, pieceId: null, hint: null });
      return;
    }
    const piece = this.latest.pieces[pieceId];
    if (!piece) return;
    if (piece.owner !== seat) {
      this.setSelection({ ...this.selection, pieceId: null, card: null, power: null, inspectId: pieceId });
      return;
    }
    if (this.latest.phase === 'players' && !pieceIsReady(this.latest, seat, piece)) {
      this.showNotice(this.spentReason(piece), { kind: 'piece', id: piece.id }, 'error');
      return;
    }
    this.audio?.play('pieceSelect');
    this.setSelection({ ...this.selection, pieceId, card: null, power: null, inspectId: null, hint: null });
  }

  private spentReason(piece: Piece): string {
    if (piece.smoldering) return reasonLine('HERO_SMOLDERING');
    if (piece.exhausted) return reasonLine('EXHAUSTED');
    if (piece.movesLeft > 0 || piece.strikesLeft > 0) return 'Nothing in reach';
    return reasonLine('PIECE_SPENT');
  }

  /** Tab: the next Ready piece after the selected one. */
  cycleReadyPiece(direction: 1 | -1 = 1): void {
    const seat = this.uiSeatNow();
    if (seat === null || this.latest.phase !== 'players') return;
    const ready = readyPieces(this.latest, seat);
    if (ready.length === 0) return;
    const index = ready.findIndex((p) => p.id === this.selection.pieceId);
    const next = ready[(index + direction + ready.length) % ready.length] ?? ready[0];
    this.selectPiece(next.id);
  }

  /** Select a card from the hand; an unplayable card shakes with its reason instead. */
  selectCard(uid: string | null): void {
    const seat = this.uiSeatNow();
    if (uid === null || seat === null) {
      this.setSelection({ ...this.selection, card: null });
      return;
    }
    if (this.selection.card?.uid === uid) {
      if (this.tryPlaySelected()) return;
      this.setSelection({ ...this.selection, card: null });
      return;
    }
    const card = { uid, mode: null, picks: [] as CardTargetChoice[] };
    const info = cardStep(this.latest, seat, card);
    if (!info.playable) {
      this.showNotice(reasonLine(info.reason ?? 'INVALID_ACTION', info.params), { kind: 'card', uid }, 'error');
      return;
    }
    this.audio?.play('cardHover', { pitch: 1.15 });
    this.setSelection({ ...this.selection, card, power: null, pieceId: null, inspectId: null, hint: null });
  }

  chooseMode(mode: number): void {
    const card = this.selection.card;
    if (!card) return;
    this.setSelection({ ...this.selection, card: { ...card, mode, picks: [] } });
  }

  /**
   * P / the Power button: arm the Hero Power and show its targets or preview. Like a card, a
   * second press plays a Power that needs no target; otherwise it disarms.
   */
  selectPower(): void {
    const seat = this.uiSeatNow();
    if (seat === null) return;
    if (this.selection.power) {
      if (!this.tryPlaySelected()) this.setSelection({ ...this.selection, power: null });
      return;
    }
    const power = { picks: [] as CardTargetChoice[] };
    const info = powerStep(this.latest, seat, power);
    if (!info.playable) {
      this.showNotice(reasonLine(info.reason ?? 'INVALID_ACTION', info.params), { kind: 'control', id: 'power' }, 'error');
      return;
    }
    this.setSelection({ ...this.selection, power, card: null, pieceId: null, hint: null });
  }

  /** Play the selected card / Power when every pick is made (board-wide cards: now). */
  tryPlaySelected(): boolean {
    const seat = this.uiSeatNow();
    const info = this.targetInfo();
    if (seat === null || !info) return false;
    const { card, power } = this.selection;
    if (card) {
      if (needsMode(info, card) || !picksComplete(info, card.picks)) return false;
      return this.dispatch(playCardAction(seat, card), { kind: 'card', uid: card.uid });
    }
    if (power && picksComplete(info, power.picks)) return this.dispatch(usePowerAction(seat, power), { kind: 'control', id: 'power' });
    return false;
  }

  /** Optional follow-up pick (e.g. Sunshield Charge's strike): play without it. */
  skipOptionalStep(): boolean {
    const seat = this.uiSeatNow();
    const info = this.targetInfo();
    const { card, power } = this.selection;
    if (seat === null || !info) return false;
    if (!canSkipRest(info, card?.picks ?? power?.picks ?? [])) return false;
    if (card) return this.dispatch(playCardAction(seat, card), { kind: 'card', uid: card.uid });
    if (power) return this.dispatch(usePowerAction(seat, power), { kind: 'control', id: 'power' });
    return false;
  }

  /** Add a target pick to the selected card / Power, playing it when complete. */
  pickTarget(choice: CardTargetChoice): void {
    const { card, power } = this.selection;
    if (card) this.selection = { ...this.selection, card: { ...card, picks: [...card.picks, choice] } };
    else if (power) this.selection = { ...this.selection, power: { picks: [...power.picks, choice] } };
    else return;
    if (!this.tryPlaySelected()) this.emit();
  }

  /** Drop the selected card or Power with all its picks. */
  cancelTargeting(): void {
    if (!this.selection.card && !this.selection.power) return;
    this.setSelection({ ...this.selection, card: null, power: null });
  }

  /** Esc / right-click: back out of the innermost choice. */
  cancel(): void {
    const sel = this.selection;
    if (this.confirmingEndTurn) {
      this.confirmingEndTurn = false;
      this.emit();
      return;
    }
    if (sel.card && sel.card.picks.length > 0) this.setSelection({ ...sel, card: { ...sel.card, picks: sel.card.picks.slice(0, -1) } });
    else if (sel.power && sel.power.picks.length > 0) this.setSelection({ ...sel, power: { picks: sel.power.picks.slice(0, -1) } });
    else this.setSelection({ ...clearChoices(sel), previewEndTurn: false });
  }

  /** A board tile was clicked (or tapped). `preferMove` (Shift) moves onto a Plume instead of popping it. */
  clickTile(pos: Pos, preferMove = false): void {
    if (!this.inputReady()) {
      const piece = this.pieceAt(pos);
      if (piece && this.uiSeatNow() === null) this.inspect(piece.id === this.selection.inspectId ? null : piece.id);
      return;
    }
    const seat = this.uiSeatNow();
    if (seat === null) return;
    if (this.hauntPending()) {
      this.haunt(pos);
      return;
    }
    if (this.latest.phase === 'night_setup') {
      this.clickDeploy(seat, pos);
      return;
    }
    if (this.latest.phase !== 'players') return;
    if (this.selection.card || this.selection.power) {
      this.clickTarget(pos);
      return;
    }
    if (this.selection.pieceId && this.actWithSelected(seat, this.selection.pieceId, pos, preferMove)) return;
    const piece = this.pieceAt(pos);
    if (piece && piece.owner === seat && piece.side === 'wick') {
      if (piece.id === this.selection.pieceId) this.selectPiece(null);
      else this.selectPiece(piece.id);
      return;
    }
    if (piece) {
      this.setSelection({ ...this.selection, pieceId: null, hint: null, inspectId: piece.id === this.selection.inspectId ? null : piece.id });
      return;
    }
    this.setSelection(clearChoices(this.selection));
  }

  private pieceAt(pos: Pos): Piece | null {
    for (const piece of Object.values(this.latest.pieces)) {
      if (pos.x >= piece.pos.x && pos.x < piece.pos.x + piece.size && pos.y >= piece.pos.y && pos.y < piece.pos.y + piece.size) return piece;
    }
    return null;
  }

  private actWithSelected(seat: number, pieceId: string, pos: Pos, preferMove: boolean): boolean {
    const hl = this.highlightsFor(pieceId);
    if (!hl) return false;
    const target = this.pieceAt(pos);
    const strike = hl.strikes.find((m) => samePosOrNull(m.pos, pos) || (target !== null && m.option.targetPieceId === target.id));
    const move = hl.moves.find((m) => samePosOrNull(m.pos, pos));
    const special = hl.specials.find((m) => samePosOrNull(m.pos, pos));
    const anchor: NoticeAnchor = { kind: 'piece', id: pieceId };
    // An attempted action counts as handled even when refused: its reason shows, the piece stays selected.
    if (strike && !(preferMove && move)) this.dispatch({ type: 'strike', seat, pieceId, target: strike.option.target }, anchor);
    else if (move) this.dispatch({ type: 'move', seat, pieceId, to: move.to }, anchor);
    else if (special) this.dispatch(special.action, anchor);
    else return false;
    return true;
  }

  private clickTarget(pos: Pos): void {
    const info = this.targetInfo();
    if (!info) return;
    const card = this.selection.card;
    if (card && needsMode(info, card)) return;
    if (info.steps === 0) {
      this.tryPlaySelected();
      return;
    }
    const option = optionAt(info, pos, this.latest);
    if (option) this.pickTarget(option.choice);
    else this.setSelection({ ...this.selection, card: null, power: null });
  }

  private clickDeploy(seat: number, pos: Pos): void {
    const piece = this.pieceAt(pos);
    const selected = this.selection.pieceId;
    if (selected && (!piece || piece.id !== selected)) {
      if (!piece && this.dispatch({ type: 'deploy', seat, pieceId: selected, to: pos }, { kind: 'piece', id: selected })) {
        this.setSelection({ ...this.selection, pieceId: null });
        return;
      }
    }
    if (piece && piece.owner === seat) this.setSelection({ ...this.selection, pieceId: piece.id === selected ? null : piece.id });
    else if (!piece) this.setSelection({ ...this.selection, pieceId: null });
  }

  /** Drag-and-drop: drop a card from the hand on a tile. */
  dropCard(uid: string, pos: Pos | null): void {
    if (this.selection.card?.uid !== uid) this.selectCard(uid);
    if (this.selection.card?.uid !== uid) return;
    if (pos === null) {
      this.setSelection({ ...this.selection, card: null });
      return;
    }
    this.clickTarget(pos);
  }

  /** Night setup: drop one of the seat's pieces on a deploy tile. */
  dropDeploy(pieceId: string, pos: Pos): boolean {
    const seat = this.uiSeatNow();
    if (seat === null || this.latest.phase !== 'night_setup') return false;
    const ok = this.dispatch({ type: 'deploy', seat, pieceId, to: pos }, { kind: 'piece', id: pieceId });
    if (ok) this.setSelection({ ...this.selection, pieceId: null });
    return ok;
  }

  // ===========================================================================================
  // Turn controls
  // ===========================================================================================

  /** Space / the wax seal. With `force` the confirmation is skipped (its "End Turn" button). */
  endTurn(force = false): EndTurnOutcome {
    const seat = this.uiSeatNow();
    if (seat === null || this.latest.phase !== 'players') return 'blocked';
    if (!force && this.needsEndTurnConfirm(seat)) {
      this.confirmingEndTurn = true;
      this.emit();
      return 'confirm';
    }
    this.confirmingEndTurn = false;
    return this.dispatch({ type: 'end_turn', seat }, { kind: 'control', id: 'end_turn' }) ? 'ended' : 'blocked';
  }

  private needsEndTurnConfirm(seat: number): boolean {
    switch (this.settings().confirm_end_turn) {
      case 'never':
        return false;
      case 'always':
        return true;
      case 'smart':
        return hasRemainingActions(this.latest, seat);
    }
  }

  undo(): boolean {
    const seat = this.uiSeatNow();
    if (seat === null) return false;
    return this.dispatch({ type: 'undo', seat }, { kind: 'control', id: 'undo' });
  }

  /** Night setup: this seat is done deploying. */
  ready(): boolean {
    const seat = this.uiSeatNow();
    if (seat === null) return false;
    return this.dispatch({ type: 'ready', seat }, { kind: 'control', id: 'ready' });
  }

  /** H: ask the planner for a suggestion and highlight its first action. */
  requestHint(): void {
    const seat = this.uiSeatNow();
    if (seat === null || this.latest.phase !== 'players' || !this.bots) return;
    const stamp = this.stateStamp;
    this.bots
      .hint(this.latest, seat)
      .then((action) => {
        if (!this.disposed && stamp === this.stateStamp) this.showHint(action);
      })
      .catch((error: unknown) => console.error('hint failed', error));
  }

  private showHint(action: Action | null): void {
    const anchor: NoticeAnchor = { kind: 'control', id: 'hint' };
    if (!action || action.type === 'end_turn') {
      this.showNotice(action ? 'Nothing better to do: end the turn.' : 'No sure strike in sight — try a card, or end the turn.', anchor, 'info');
      return;
    }
    this.audio?.play('uiConfirm');
    const base = { ...clearChoices(this.selection), hint: action };
    if (action.type === 'play_card') {
      this.setSelection({ ...base, card: { uid: action.cardUid, mode: action.mode ?? null, picks: [] } });
      return;
    }
    if (action.type === 'use_power') {
      this.setSelection({ ...base, power: { picks: [] } });
      return;
    }
    const pieceId = 'pieceId' in action && typeof action.pieceId === 'string' ? action.pieceId : null;
    this.setSelection({ ...base, pieceId });
  }

  // ===========================================================================================
  // Notices and snapshots
  // ===========================================================================================

  showNotice(text: string, anchor: NoticeAnchor, tone: UiNotice['tone']): void {
    if (tone === 'error') this.audio?.play('uiError');
    this.notice = { id: ++this.noticeId, text, anchor, tone };
    if (this.noticeTimer !== null) this.scheduler.clearTimeout(this.noticeTimer);
    const id = this.notice.id;
    this.noticeTimer = this.scheduler.setTimeout(() => {
      this.noticeTimer = null;
      if (this.notice?.id === id) {
        this.notice = null;
        this.emit();
      }
    }, NOTICE_MS);
    this.emit();
  }

  private buildSnapshot(): ControllerSnapshot {
    return {
      state: this.shown,
      latest: this.latest,
      playing: this.playing,
      animating: this.queue.length > 0 || this.playing !== null,
      thinkingSeat: this.bots?.thinkingSeat ?? null,
      uiSeat: this.computeUiSeat(),
      controlledSeats: this.transport.controlledSeats(this.latest),
      selection: this.selection,
      notice: this.notice,
      confirmingEndTurn: this.confirmingEndTurn,
      held: this.holds.size > 0,
    };
  }

  private emit(): void {
    if (this.disposed) return;
    this.snapshot = this.buildSnapshot();
    for (const listener of [...this.listeners]) listener();
  }
}

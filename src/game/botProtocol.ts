/**
 * Messages between the controller's bot runner and `bot.worker.ts`, plus the engine calls
 * that answer them (shared by the worker and the main-thread fallback).
 */
import { botChoice, hint, planBotTurn } from '../engine';
import type { Action, BotLevel, ContentRegistry, GameState } from '../engine/types';

export type BotRequest =
  | { id: number; kind: 'plan'; state: GameState; seat: number; level: BotLevel }
  | { id: number; kind: 'choice'; state: GameState; seat: number }
  | { id: number; kind: 'hint'; state: GameState; seat: number }
  | { id: number; kind: 'content'; registry: ContentRegistry | null };

export type BotQuestion = Exclude<BotRequest, { kind: 'content' }>;

export type BotResponse = { id: number; ok: true; actions: Action[] } | { id: number; ok: false; error: string };

/** Answer one question with the engine: a full seat turn, or zero / one chosen action. */
export function answerBotRequest(req: BotQuestion): Action[] {
  switch (req.kind) {
    case 'plan':
      return planBotTurn(req.state, req.seat, req.level);
    case 'choice': {
      const action = botChoice(req.state, req.seat);
      return action ? [action] : [];
    }
    case 'hint': {
      const action = hint(req.state, req.seat);
      return action ? [action] : [];
    }
  }
}

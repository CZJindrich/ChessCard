/**
 * Bot planning worker (GDD §12.6): runs `planBotTurn`, `botChoice` and `hint` off the main
 * thread. The first message installs the tab's content registry (mods included).
 */
import { setContent } from '../engine';
import { answerBotRequest, type BotRequest, type BotResponse } from './botProtocol';

/** The slice of DedicatedWorkerGlobalScope used here (the DOM lib types `self` as a Window). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null;
  postMessage(message: BotResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<BotRequest>) => {
  const req = event.data;
  if (req.kind === 'content') {
    setContent(req.registry);
    return;
  }
  let response: BotResponse;
  try {
    response = { id: req.id, ok: true, actions: answerBotRequest(req) };
  } catch (error) {
    response = { id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  scope.postMessage(response);
};

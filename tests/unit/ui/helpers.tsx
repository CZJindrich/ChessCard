import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { memoryStorage } from '../../../src/config';
import type { Route } from '../../../src/ui/app/navigation';
import type { LobbyActions } from '../../../src/ui/app/online';
import { createAppServices, type AppServices, type UiAudio } from '../../../src/ui/app/services';
import { App } from '../../../src/ui/App';

export interface TestAudio {
  unlock: Mock<UiAudio['unlock']>;
  play: Mock<UiAudio['play']>;
  setMusic: Mock<UiAudio['setMusic']>;
}

export function fakeAudio(): TestAudio {
  return { unlock: vi.fn<UiAudio['unlock']>(), play: vi.fn<UiAudio['play']>(), setMusic: vi.fn<UiAudio['setMusic']>() };
}

export interface TestApp extends RenderResult {
  services: AppServices;
  audio: TestAudio;
}

/** Fixed clock and seed so launches are deterministic. */
export const TEST_NOW = new Date('2026-10-09T12:00:00Z');

export interface TestOptions {
  route?: Route;
  profile?: Record<string, unknown>;
  audio?: TestAudio;
  online?: LobbyActions;
}

export function makeServices(opts: TestOptions = {}): { services: AppServices; audio: TestAudio } {
  const audio = opts.audio ?? fakeAudio();
  const storage = memoryStorage(opts.profile ? { 'chesscard.profile': JSON.stringify(opts.profile) } : {});
  const services = createAppServices({
    storage,
    audioBridge: null,
    audio,
    initialRoute: opts.route,
    env: { now: () => TEST_NOW, randomSeed: () => 'wick-test01', clipboard: null },
    online: opts.online,
  });
  return { services, audio };
}

export function renderApp(opts: TestOptions = {}): TestApp {
  const { services, audio } = makeServices(opts);
  const result = render(<App services={services} />);
  return { ...result, services, audio };
}

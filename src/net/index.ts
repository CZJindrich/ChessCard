/**
 * Online play, browser side (ARCHITECTURE §7): the wire protocol shared with server/, the
 * WebSocket client, the session store the lobby reads, and the game screen's NetTransport.
 */
export * from './protocol';
export { NetClient, defaultServerUrl, normalizeServerUrl, TOKEN_STORAGE_KEY } from './client';
export type { NetClientOptions, NetIdentity, NetStatus, TimerApi, WebSocketFactory, WebSocketLike } from './client';
export { OnlineSession, NAME_STORAGE_KEY, SERVER_STORAGE_KEY } from './session';
export type { OnlineGame, OnlineTimer, SessionOptions, SessionState } from './session';
export { NetTransport, createNetTransport } from './transport';

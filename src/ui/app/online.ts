/**
 * The hook the online client plugs into (src/net). Until one is provided, the lobby's Host and
 * Join buttons explain that online play is not connected.
 */
import type { ConfigSelection } from '../../config';
import type { GameConfig } from '../../engine/types';

export interface LobbyActions {
  /** Open a room for this config (host). */
  openRoom(config: GameConfig, selection: ConfigSelection): void;
  /** Join the room with this 4-letter code. */
  joinRoom(code: string): void;
}

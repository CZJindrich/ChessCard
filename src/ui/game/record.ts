/** What a finished game reports to the local profile (GDD §13.7 unlock ladder and stats). */
import type { GameRecord } from '../../config';
import type { GameState } from '../../engine/types';
import type { GameRoute } from '../app/navigation';

export function gameRecord(route: GameRoute, s: GameState): GameRecord | null {
  const result = s.result;
  if (!result) return null;
  const humans = s.players.filter((p) => p.kind === 'human');
  const kills = humans.reduce((sum, p) => sum + p.stats.kills, 0);
  const quickPlay = route.selection.oneClick === 'quick_play';
  const dailyDate = s.config.daily && s.seed.startsWith('daily:') ? s.seed.slice('daily:'.length) : null;
  if (result.mode === 'vigil') {
    return {
      mode: 'vigil',
      won: result.outcome === 'victory',
      conceded: result.outcome === 'conceded',
      quickPlay,
      bossId: s.boss?.id ?? (s.config.boss_choice === 'random' ? null : s.config.boss_choice),
      stars: result.stars,
      kills,
      retries: result.retries,
      dailyDate,
      finalDread: result.finalDread,
    };
  }
  const first = humans[0];
  const placement = first ? result.standings.find((st) => st.seat === first.seat)?.placement : undefined;
  return { mode: 'last_flame', won: placement === 1, conceded: result.reason === 'conceded', quickPlay, kills };
}

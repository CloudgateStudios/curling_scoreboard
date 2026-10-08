import type { LiveGame } from '../types';

/**
 * A scoreboard that is switched off or loses its connection mid-game never
 * clears its live game. Nothing is pushed while an end is being played, so
 * this has to be comfortably longer than the slowest end.
 *
 * Keep in step with LIVE_GAME_TIMEOUT_MS in functions/src/routes/sheets.ts,
 * which applies the same cutoff to the public API.
 */
export const LIVE_GAME_TIMEOUT_MS = 120 * 60 * 1000;

/**
 * Returns the sheet's live game, or null if there is none or it has gone so
 * long without an update that it must have been abandoned.
 */
export function activeLiveGame(
  liveGame: LiveGame | undefined,
  now: number,
): LiveGame | null {
  if (!liveGame) return null;

  // Live games written before updatedAt existed cannot be aged, so they are
  // left as live.
  const updatedAt = liveGame.updatedAt;
  if (updatedAt == null) return liveGame;

  return now - updatedAt.toMillis() > LIVE_GAME_TIMEOUT_MS ? null : liveGame;
}

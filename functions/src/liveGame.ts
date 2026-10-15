// A scoreboard that is switched off or loses its connection mid-game never
// clears its live game. Nothing is pushed while an end is being played, so
// this has to be comfortably longer than the slowest end. The admin portal
// applies the same cutoff in admin/src/lib/liveGame.ts.
//
// Kept in a file of its own, with no imports, so the display state helpers
// (and the scripts that reuse them) can share it without loading Express.
export const LIVE_GAME_TIMEOUT_MS = 120 * 60 * 1000;

// How often the public scores page polls, and how it reads results.json
// for the warm room's results-model.js. Nothing here touches the page, so
// the emulator tests can run it.
//
// Every poll is paid for in data, on the member's phone and on the club's
// bill, so the page asks only as often as the scores can change: every half
// minute while a game is on, every five minutes while nothing is, never
// while the page is hidden, and not at all once the phone has been left
// alone for half an hour.

/** While any sheet has a game on it, live or just finished. live.json is
 *  cached for 30 seconds, so asking more often would find nothing new. */
export const LIVE_POLL_MS = 30 * 1000;
/** While every sheet is idle. A game that starts shows within this, and its
 *  first end takes far longer. */
export const QUIET_POLL_MS = 5 * 60 * 1000;
/** With no tap, scroll or key for this long, the page stops polling until
 *  someone touches it again: a phone left open on a table stops costing. */
export const IDLE_PAUSE_MS = 30 * 60 * 1000;

/** How long to wait before polling live.json again, given the last one. */
export function pollDelay(live) {
  return live?.sheets?.some((sheet) => sheet.kind !== 'idle') ? LIVE_POLL_MS : QUIET_POLL_MS;
}

/**
 * How long to wait before polling again when the page is shown, given when
 * live.json was last fetched: nothing if it is due, otherwise the rest of
 * the wait. Coming back to the page a moment after it last asked would find
 * nothing new, as the answer is cached for longer than that.
 */
export function timeUntilDue(live, fetchedAt, now) {
  if (fetchedAt === null) return 0;
  return Math.max(0, pollDelay(live) - (now - fetchedAt));
}

/** True when the page has been left alone long enough to stop polling. */
export function isIdle(lastActiveAt, now) {
  return now - lastActiveAt >= IDLE_PAUSE_MS;
}

const asTimestamp = (ms) => (typeof ms === 'number' ? { toMillis: () => ms } : null);

/**
 * results.json's results as the summary has them, with their times as
 * Timestamp-likes, which is what results-model.js reads.
 */
export function asSummaryResults(json) {
  return (Array.isArray(json?.results) ? json.results : []).flatMap((result) => {
    const finishedAt = asTimestamp(result?.finishedAt);
    if (!finishedAt) return [];
    const color = (hex) => (typeof hex === 'string' ? { hex } : null);
    return [{
      ...result,
      finishedAt,
      startedAt: asTimestamp(result.startedAt),
      team1: { ...result.team1, color: color(result.team1?.color) },
      team2: { ...result.team2, color: color(result.team2?.color) },
    }];
  });
}

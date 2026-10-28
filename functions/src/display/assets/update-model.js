// When a display moves onto a newer deployment of the pages. Mirrors
// UpdateService in the app (app/lib/services/update_service.dart), which
// does the same for the scoreboards. No imports, so the emulator tests can
// load it as is.

/**
 * If a reload for a build did not load it (a stale cache, or an instance
 * of the old version answering), wait this long before trying that build
 * again rather than reloading in a loop.
 */
export const RETRY_RELOAD_AFTER_MS = 10 * 60_000;

/** The local hour of the daily fallback check, when the club is closed. */
export const DAILY_CHECK_HOUR = 1;

/** Milliseconds from [now] until the next daily check. */
export function timeUntilNextDailyCheck(now) {
  // Set from the calendar fields, so it stays at 1 AM wall clock time
  // across daylight saving changes.
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAILY_CHECK_HOUR);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

/**
 * The build to reload onto, given the running build and the deployed one,
 * or null when there is none: the same build, or no build ID on either side
 * (local and emulator builds have none).
 */
export function targetBuild(currentBuildId, deployedBuildId) {
  if (!currentBuildId || typeof deployedBuildId !== 'string' || !deployedBuildId) return null;
  return deployedBuildId === currentBuildId ? null : deployedBuildId;
}

/**
 * Whether to reload onto [target], given the last attempt, { target, at }
 * or null, so a reload that did not take is not tried again straight away.
 */
export function canReload(target, lastAttempt, now) {
  if (!target) return false;
  if (!lastAttempt || lastAttempt.target !== target || typeof lastAttempt.at !== 'number') return true;
  return now - lastAttempt.at >= RETRY_RELOAD_AFTER_MS;
}

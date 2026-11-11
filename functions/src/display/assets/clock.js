// Whether a club's times are shown on a 12 or 24 hour clock, as its admins
// set it beside the club's time zone. The portal reads the same setting in
// admin/src/lib/clock.ts, and webhook posts and stream titles in
// functions/src/clock.ts; the three change together.

/** A club that has not chosen gets the 12 hour clock. */
export const DEFAULT_CLOCK = '12h';

/** The clock a saved value names, or the default. */
export function clockOf(value) {
  return value === '24h' ? '24h' : DEFAULT_CLOCK;
}

/** Options for toLocaleString and the like, showing the hour and minute on
 *  the club's clock. */
export function timeOptions(clock) {
  return { hour: 'numeric', minute: '2-digit', hourCycle: clock === '24h' ? 'h23' : 'h12' };
}

// Whether a club's times are written on a 12 or 24 hour clock, as its admins
// set it beside the club's time zone, in clubs/{clubId}/config/club. The
// display pages read it in display/assets/clock.js and the portal in
// admin/src/lib/clock.ts; the three change together.

export type Clock = '12h' | '24h';

/** The clock a saved value names. A club that has not chosen gets 12 hour. */
export function clockOf(value: unknown): Clock {
  return value === '24h' ? '24h' : '12h';
}

/** The hour and minute on the club's clock, for Intl.DateTimeFormat. */
export function timeOptions(clock: Clock): Intl.DateTimeFormatOptions {
  return { hour: 'numeric', minute: '2-digit', hourCycle: clock === '24h' ? 'h23' : 'h12' };
}

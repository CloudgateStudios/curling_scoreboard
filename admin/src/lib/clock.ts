// Whether a club's times are shown on a 12 or 24 hour clock, as set beside
// its time zone. The displays read the same setting in
// functions/src/display/assets/clock.js, and webhook posts and stream titles
// in functions/src/clock.ts; the three change together.

export type Clock = '12h' | '24h';

/** A club that has not chosen gets the 12 hour clock. */
export const DEFAULT_CLOCK: Clock = '12h';

export const CLOCKS: { value: Clock; label: string; example: string }[] = [
  { value: '12h', label: '12 hour', example: '6:15 PM' },
  { value: '24h', label: '24 hour', example: '18:15' },
];

/** The clock a saved value names, or the default. */
export function clockOf(value: unknown): Clock {
  return value === '24h' ? '24h' : DEFAULT_CLOCK;
}

/** Options for toLocaleString and the like, showing the hour and minute on
 *  the club's clock. */
export function timeOptions(clock: Clock): Intl.DateTimeFormatOptions {
  return { hour: 'numeric', minute: '2-digit', hourCycle: clock === '24h' ? 'h23' : 'h12' };
}

/** A time of day kept as 'HH:mm', such as a league's draw, on the clock:
 *  '18:15' or '6:15 PM'. Anything else comes back as it is. */
export function formatHm(hm: string, clock: Clock): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!match) return hm;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (clock === '24h') return `${String(hours).padStart(2, '0')}:${minutes}`;
  const suffix = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
}

/** An hour on a timeline: '18:00', or '6 PM'. */
export function formatHour(hour: number, clock: Clock): string {
  const h = ((hour % 24) + 24) % 24;
  if (clock === '24h') return `${String(h).padStart(2, '0')}:00`;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

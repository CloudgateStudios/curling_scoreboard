// What is on the ice now and next, for the club's overview, and what is
// left to set the club up.
//
// League and bonspiel times are the club's local time with no zone. Times
// here are "local minutes": minutes since 1970-01-01 00:00 on the club's
// clock, as if it were UTC, so plain arithmetic works across midnight.
//
// The league playing now, with its lead time, and the bonspiel draw on now
// are also worked out in app/lib/models/league.dart,
// app/lib/models/bonspiel.dart and functions/src/now.ts. Keep them in step.

import type { Bonspiel, League, Sheet } from '../types';

/** How long before a draw starts it is already on, as on the scoreboard. */
export const DRAW_LEAD_MINUTES = 30;
/** How long a bonspiel's last draw of a day is on, as it has no end time. */
export const BONSPIEL_DRAW_MINUTES = 180;

const MINUTES_PER_DAY = 24 * 60;
const pad = (n: number) => String(n).padStart(2, '0');

/** The time on the club's clock at [at], as local minutes. A zone this
 *  browser does not know falls back to the browser's own. */
export function localMinutes(timeZone: string | null | undefined, at: Date): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(at);
  } catch {
    return localMinutes(undefined, at);
  }
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) / 60000;
}

/** 'YYYY-MM-DDTHH:mm' as local minutes, or null when it is not one. */
export function parseLocalTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) / 60000;
}

/** The day of local minutes, 'YYYY-MM-DD'. */
export function dateOf(minutes: number): string {
  const d = new Date(minutes * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The time of day of local minutes, 'HH:mm'. */
export function timeOf(minutes: number): string {
  const d = new Date(minutes * 60000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 1 (Monday) to 7 (Sunday), as the leagues have it. */
function weekdayOf(minutes: number): number {
  return ((new Date(minutes * 60000).getUTCDay() + 6) % 7) + 1;
}

function minutesOfDay(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function inSeason(league: League, date: string): boolean {
  // ISO dates compare correctly as text.
  if (league.seasonStart && date < league.seasonStart) return false;
  if (league.seasonEnd && date > league.seasonEnd) return false;
  return true;
}

/** A league draw or a bonspiel draw, placed on the club's clock. */
export interface ClubDraw {
  kind: 'league' | 'bonspiel';
  /** The league's or bonspiel's ID and name. */
  id: string;
  name: string;
  /** A bonspiel draw's label, "Draw 5"; null for a league. */
  label: string | null;
  /** A bonspiel draw's ID in the plan; null for a league. */
  drawId: string | null;
  /** Local minutes. */
  start: number;
  /** Local minutes; for a bonspiel, until the next draw takes over. */
  end: number;
  /** The sheets it plays on, or null for every sheet. */
  sheetIds: string[] | null;
}

/** Every league draw starting from the day before [from] to [days] after,
 *  the day before for a late draw that runs past midnight. */
function leagueDraws(leagues: League[], from: number, days: number): ClubDraw[] {
  const found: ClubDraw[] = [];
  const firstDay = Math.floor(from / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  for (const league of leagues) {
    if (!league.active) continue;
    for (let offset = -1; offset <= days; offset++) {
      const day = firstDay + offset * MINUTES_PER_DAY;
      if (!inSeason(league, dateOf(day))) continue;
      for (const draw of league.draws) {
        const startOfDraw = minutesOfDay(draw.start);
        const endOfDraw = minutesOfDay(draw.end);
        if (draw.day !== weekdayOf(day) || startOfDraw === null || endOfDraw === null) continue;
        found.push({
          kind: 'league', id: league.id, name: league.name, label: null, drawId: null,
          start: day + startOfDraw,
          // A draw that ends after midnight.
          end: day + endOfDraw + (endOfDraw <= startOfDraw ? MINUTES_PER_DAY : 0),
          sheetIds: draw.sheetIds?.length ? draw.sheetIds : null,
        });
      }
    }
  }
  return found;
}

/** Every active bonspiel's draws, each on until the lead time before the
 *  next, and the last of a day for as long as a game takes. */
function bonspielDraws(bonspiels: Bonspiel[], evenInactive = false): ClubDraw[] {
  const found: ClubDraw[] = [];
  for (const bonspiel of bonspiels) {
    if (!bonspiel.active && !evenInactive) continue;
    const draws = bonspiel.draws
      .map((draw) => ({ draw, start: parseLocalTime(draw.start) }))
      .filter((d): d is { draw: typeof d.draw; start: number } => d.start !== null)
      .sort((a, b) => a.start - b.start);
    draws.forEach(({ draw, start }, i) => {
      const next = draws[i + 1];
      const sheetIds = [...new Set(bonspiel.games.filter((g) => g.drawId === draw.id).map((g) => g.sheetId))];
      found.push({
        kind: 'bonspiel', id: bonspiel.id, name: bonspiel.name, label: draw.label, drawId: draw.id,
        start,
        // The next draw takes over at its lead time, so this one ends the
        // minute before.
        end: Math.min(next ? next.start - DRAW_LEAD_MINUTES - 1 : Infinity, start + BONSPIEL_DRAW_MINUTES),
        sheetIds,
      });
    });
  }
  return found;
}

/** The draws on at [at]: from the lead time before each starts until it
 *  ends. Bonspiels first, as on the scoreboard, then by start. */
export function drawsOnNow(leagues: League[], bonspiels: Bonspiel[], at: number): ClubDraw[] {
  return [...bonspielDraws(bonspiels), ...leagueDraws(leagues, at, 0)]
    .filter((d) => at >= d.start - DRAW_LEAD_MINUTES && at <= d.end)
    .sort((a, b) => (a.kind === b.kind ? a.start - b.start : a.kind === 'bonspiel' ? -1 : 1));
}

/** The next [limit] draws not yet on, within the next week, soonest first. */
export function drawsComingUp(leagues: League[], bonspiels: Bonspiel[], at: number, limit = 5): ClubDraw[] {
  const weekOut = at + 7 * MINUTES_PER_DAY;
  return [...bonspielDraws(bonspiels), ...leagueDraws(leagues, at, 7)]
    .filter((d) => d.start - DRAW_LEAD_MINUTES > at && d.start <= weekOut)
    .sort((a, b) => a.start - b.start || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** The bonspiel a bonspiel admin opens on: one on today, else the next to
 *  start, else null. Inactive ones are left out unless nothing else is. */
export function bonspielToOpen(bonspiels: Bonspiel[], today: string): Bonspiel | null {
  const byStart = [...bonspiels].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const pick = (list: Bonspiel[]) =>
    list.find((b) => b.startDate <= today && b.endDate >= today)
    ?? list.find((b) => b.startDate > today)
    ?? null;
  return pick(byStart.filter((b) => b.active)) ?? pick(byStart);
}

export type DayDrawStatus = 'done' | 'on' | 'next' | 'later';

export interface DayDraw {
  drawId: string;
  label: string;
  /** Local minutes. */
  start: number;
  status: DayDrawStatus;
}

/** A bonspiel's draws for the day of [at], in order: those finished, the
 *  one on now, the next to start, and the rest. A late draw from the night
 *  before that is still on counts as today's. Inactive bonspiels count too,
 *  since their coordinator still runs them. */
export function bonspielDay(bonspiel: Bonspiel, at: number): DayDraw[] {
  const today = dateOf(at);
  const draws = bonspielDraws([bonspiel], true)
    .filter((d) => dateOf(d.start) === today || (at >= d.start - DRAW_LEAD_MINUTES && at <= d.end));
  let nextFound = false;
  return draws.map((d) => {
    let status: DayDrawStatus;
    if (at > d.end) status = 'done';
    else if (at >= d.start - DRAW_LEAD_MINUTES) status = 'on';
    else if (!nextFound) {
      status = 'next';
      nextFound = true;
    } else status = 'later';
    return { drawId: d.drawId ?? '', label: d.label ?? '', start: d.start, status };
  });
}

/** What the setup checklist reads. Undefined is not known yet. */
export interface SetupFacts {
  sheets: Sheet[];
  timeZone: string | null | undefined;
  pinSet: boolean | undefined;
  leagueCount: number;
  bonspielCount: number;
  publicPage: boolean | undefined;
  webhook: boolean | undefined;
}

export type SetupStepId = 'sheets' | 'scoreboards' | 'timeZone' | 'pin' | 'schedule' | 'publicPage' | 'webhook';

export interface SetupStep {
  id: SetupStepId;
  label: string;
  done: boolean;
  /** Worth doing, but a club runs without it. */
  optional: boolean;
}

/** The steps to set a club up, in the order they are best done. */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const { sheets } = facts;
  return [
    { id: 'sheets', label: 'Add the sheets', done: sheets.length > 0, optional: false },
    {
      id: 'scoreboards', label: 'Connect a scoreboard to every sheet',
      done: sheets.length > 0 && sheets.every((s) => Boolean(s.scoreboardUid)), optional: false,
    },
    { id: 'timeZone', label: 'Set the time zone', done: Boolean(facts.timeZone), optional: false },
    { id: 'pin', label: 'Set the scoreboard admin PIN', done: facts.pinSet === true, optional: false },
    { id: 'schedule', label: 'Add a league or bonspiel', done: facts.leagueCount + facts.bonspielCount > 0, optional: false },
    { id: 'publicPage', label: 'Share scores with members', done: facts.publicPage === true, optional: true },
    { id: 'webhook', label: 'Post results to chat', done: facts.webhook === true, optional: true },
  ];
}

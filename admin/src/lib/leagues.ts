import type { League, LeagueDraw, LeagueTeam } from '../types';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Days in the order a week is shown, Sunday first. Draws store their day
 *  as 1 (Monday) to 7 (Sunday). */
export const WEEK_DAYS = [7, 1, 2, 3, 4, 5, 6];

/** Where a draw's day falls in a week that starts on Sunday, 0 to 6. */
function weekIndex(day: number): number {
  return day % 7;
}

/** "Mon 18:30–20:30, Thu 19:00–21:00", or a note that there is no schedule. */
export function formatDraws(draws: LeagueDraw[]): string {
  if (draws.length === 0) return 'No schedule';
  return sortDraws(draws).map(formatDraw).join(', ');
}

function formatDraw(d: LeagueDraw): string {
  return `${DAY_NAMES[d.day - 1].slice(0, 3)} ${d.start}–${d.end}`;
}

export function sortDraws(draws: LeagueDraw[]): LeagueDraw[] {
  return [...draws].sort(
    (a, b) => weekIndex(a.day) - weekIndex(b.day) || a.start.localeCompare(b.start),
  );
}

/** Orders leagues by when they first play in the week, then by name.
 *  Leagues with no schedule come last, by name. */
export function compareLeagues(a: League, b: League): number {
  const [first] = sortDraws(a.draws);
  const [other] = sortDraws(b.draws);
  if (first && other) {
    return (
      weekIndex(first.day) - weekIndex(other.day) ||
      first.start.localeCompare(other.start) ||
      a.name.localeCompare(b.name)
    );
  }
  if (first || other) return first ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** Minutes after midnight for an `HH:mm` time, or null when it is not one. */
export function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** One draw of one league, as placed on the week. */
export interface ScheduledDraw {
  league: League;
  draw: LeagueDraw;
  /** Minutes after midnight. */
  start: number;
  end: number;
}

/** Every draw that can be placed on the week, in week order. Draws with a
 *  missing or backwards time are left out. */
export function scheduledDraws(leagues: League[]): ScheduledDraw[] {
  const scheduled: ScheduledDraw[] = [];
  for (const league of leagues) {
    for (const draw of league.draws) {
      const start = minutesOf(draw.start);
      const end = minutesOf(draw.end);
      if (start === null || end === null || end <= start) continue;
      if (!WEEK_DAYS.includes(draw.day)) continue;
      scheduled.push({ league, draw, start, end });
    }
  }
  return scheduled.sort(
    (a, b) =>
      weekIndex(a.draw.day) - weekIndex(b.draw.day) ||
      a.start - b.start ||
      a.league.name.localeCompare(b.league.name),
  );
}

/** Two draws that are on the ice at the same time. */
export interface DrawConflict {
  a: ScheduledDraw;
  b: ScheduledDraw;
}

/** Whether both seasons include at least one common date. A season with no
 *  start or end has no limit on that side. */
function seasonsOverlap(a: League, b: League): boolean {
  if (a.seasonEnd && b.seasonStart && a.seasonEnd < b.seasonStart) return false;
  if (b.seasonEnd && a.seasonStart && b.seasonEnd < a.seasonStart) return false;
  return true;
}

/** The pairs of draws that overlap. Only active leagues count, and only when
 *  their seasons overlap too. Draws that meet end to start do not conflict. */
export function drawConflicts(leagues: League[]): DrawConflict[] {
  const draws = scheduledDraws(leagues.filter((l) => l.active));
  const conflicts: DrawConflict[] = [];
  for (let i = 0; i < draws.length; i++) {
    for (let j = i + 1; j < draws.length; j++) {
      const a = draws[i];
      const b = draws[j];
      if (a.draw.day !== b.draw.day) continue;
      if (a.start >= b.end || b.start >= a.end) continue;
      if (!seasonsOverlap(a.league, b.league)) continue;
      conflicts.push({ a, b });
    }
  }
  return conflicts;
}

/** "Monday Mixed and Monday Late overlap on Mon 19:00–20:30". */
export function formatConflict({ a, b }: DrawConflict): string {
  const day = DAY_NAMES[a.draw.day - 1].slice(0, 3);
  const start = a.draw.start > b.draw.start ? a.draw.start : b.draw.start;
  const end = a.draw.end < b.draw.end ? a.draw.end : b.draw.end;
  const who =
    a.league.id === b.league.id
      ? `${a.league.name} has two draws that overlap`
      : `${a.league.name} and ${b.league.name} overlap`;
  return `${who} on ${day} ${start}–${end}`;
}

export function newTeamId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Reads a league document defensively: it may have been written by an
 *  older portal or by hand. */
export function leagueFrom(id: string, data: Record<string, unknown>): League {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    active: data.active !== false,
    seasonStart: typeof data.seasonStart === 'string' ? data.seasonStart : undefined,
    seasonEnd: typeof data.seasonEnd === 'string' ? data.seasonEnd : undefined,
    draws: Array.isArray(data.draws) ? (data.draws as LeagueDraw[]) : [],
    teams: Array.isArray(data.teams) ? (data.teams as LeagueTeam[]) : [],
  };
}

/** The fields stored for a league. Firestore rejects undefined, so optional
 *  values that are not set are left out. */
export function leagueData(league: Omit<League, 'id'>): Record<string, unknown> {
  return {
    name: league.name.trim(),
    active: league.active,
    ...(league.seasonStart ? { seasonStart: league.seasonStart } : {}),
    ...(league.seasonEnd ? { seasonEnd: league.seasonEnd } : {}),
    draws: sortDraws(league.draws),
    teams: league.teams.map((t) => ({
      id: t.id,
      name: t.name.trim(),
      ...(t.externalId ? { externalId: t.externalId } : {}),
    })),
  };
}

/** What is wrong with a league as edited, or null when it can be saved. */
export function leagueProblem(league: Omit<League, 'id'>): string | null {
  if (!league.name.trim()) return 'Give the league a name.';
  if (league.seasonStart && league.seasonEnd && league.seasonEnd < league.seasonStart) {
    return 'The season ends before it starts.';
  }
  for (const draw of league.draws) {
    if (!draw.start || !draw.end) return 'Every draw needs a start and an end time.';
    if (draw.end <= draw.start) return 'A draw has to end after it starts.';
  }
  const names = new Set<string>();
  for (const team of league.teams) {
    const name = team.name.trim().toLowerCase();
    if (!name) return 'Every team needs a name.';
    if (names.has(name)) return `Two teams are called "${team.name.trim()}".`;
    names.add(name);
  }
  return null;
}

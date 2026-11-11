// What is on a sheet at a given time: its live game, or else the bonspiel
// game or league draw the schedule has near then. The REST API's /now
// endpoint answers with it, so a stream on the sheet can be named without
// anyone typing a title.
//
// League and bonspiel times are the club's local time with no zone. Times
// here are "local minutes": minutes since 1970-01-01 00:00 on the club's
// clock, as if it were UTC, so plain arithmetic works across midnight and
// month ends. The scoreboard works out the league playing now in
// app/lib/models/league.dart and the bonspiel draw on now in
// app/lib/models/bonspiel.dart, and the admin portal's overview both in
// admin/src/lib/clubNow.ts: keep the lead time in step with them.
//
// Nothing here imports Firebase, so it can be tested on its own.

import { RecordedResult, resolveBonspiel } from './bonspiels/state';

type Data = Record<string, unknown>;

/** How long before a draw starts it is already on, as on the scoreboard. */
export const DRAW_LEAD_MINUTES = 30;
/** Up to this long before a draw starts, a stream is probably for it. */
export const NEAR_MINUTES = 90;
/** Up to this long before a draw starts, it is still worth offering. */
export const FAR_MINUTES = 180;
/** Up to this long after a draw ends, it is still worth offering, for a
 *  stream started late. */
export const AFTER_END_MINUTES = 60;
/** How long a bonspiel's last draw of a day is on, as it has no end time. */
export const BONSPIEL_DRAW_MINUTES = 180;

const MINUTES_PER_DAY = 24 * 60;

export type Confidence = 'high' | 'medium' | 'low';

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

export interface NowTeam {
  teamId: string | null;
  name: string;
}

export interface NowNamed {
  id: string;
  name: string;
  shortName: string | null;
}

export interface NowDraw {
  /** 'YYYY-MM-DD', the day the draw starts, even when it is after midnight now. */
  date: string;
  /** 'HH:mm' */
  start: string;
  /** 'HH:mm', or null for a bonspiel draw, which has none. */
  end: string | null;
  /** A bonspiel draw's label, "Draw 5"; null for a league. */
  label: string | null;
}

export interface NowGame {
  id: string;
  /** "A7" */
  label: string;
  /** "A Event" */
  event: string | null;
}

export interface Candidate {
  kind: 'league' | 'bonspiel';
  /** liveGame: the sheet's scoreboard is playing it. schedule: the schedule
   *  has it near this time. */
  source: 'liveGame' | 'schedule';
  confidence: Confidence;
  /** Minutes from the draw's start to now: negative before it starts. Null
   *  for a live game with no draw near. */
  minutesFromStart: number | null;
  league: NowNamed | null;
  bonspiel: NowNamed | null;
  draw: NowDraw | null;
  game: NowGame | null;
  team1: NowTeam | null;
  team2: NowTeam | null;
}

export interface NowLeague {
  id: string;
  data: Data;
}

export interface NowBonspiel {
  id: string;
  data: Data;
  /** The results its state keeps, to work out who is in each game. */
  results: Record<string, RecordedResult>;
}

export interface NowInput {
  /** Local minutes. */
  at: number;
  sheetId: string;
  /** The sheet's live game, or null when it has none or it has gone stale. */
  liveGame: Data | null;
  leagues: NowLeague[];
  bonspiels: NowBonspiel[];
}

export interface NowAnswer {
  /** The best guess, or null when nothing is near. */
  match: Candidate | null;
  /** Everything that was near, best first; the match is the first. */
  candidates: Candidate[];
}

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

/** 'YYYY-MM-DDTHH:mm' as local minutes, or null when it is not one. */
export function parseLocalTime(value: unknown): number | null {
  const match = typeof value === 'string' ? LOCAL_TIME.exec(value) : null;
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const millis = Date.UTC(y, mo - 1, d, h, mi);
  // Date.UTC rolls February 30 over into March; that is not a date.
  if (new Date(millis).getUTCDate() !== d) return null;
  return millis / 60000;
}

/** The time on the club's clock at [at], as local minutes, or null when the
 *  zone is not one this machine knows. */
export function localTimeIn(timeZone: string, at: Date): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(at);
  } catch {
    return null;
  }
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) / 60000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local minutes as 'YYYY-MM-DDTHH:mm'. */
export function formatLocalTime(minutes: number): string {
  return `${dateOf(minutes)}T${timeOf(minutes)}`;
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
export function weekdayOf(minutes: number): number {
  return ((new Date(minutes * 60000).getUTCDay() + 6) % 7) + 1;
}

function startOfDay(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

function minutesOfDay(hhmm: unknown): number | null {
  const match = typeof hhmm === 'string' ? TIME.exec(hhmm) : null;
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}

/** A bonspiel draw's start, 'YYYY-MM-DDTHH:mm', as local minutes. */
function bonspielDrawStart(draw: Data): number | null {
  return parseLocalTime(draw['start']);
}

/**
 * How sure a draw from [start] to [end] is the one on at [at]: high from
 * the lead time before it starts until it ends, medium a little earlier,
 * low further off or a little after it ends, and null when it is too far.
 */
export function confidenceFor(at: number, start: number, end: number): Confidence | null {
  if (at >= start - DRAW_LEAD_MINUTES && at <= end) return 'high';
  if (at < start) {
    const lead = start - at;
    if (lead <= NEAR_MINUTES) return 'medium';
    return lead <= FAR_MINUTES ? 'low' : null;
  }
  return at - end <= AFTER_END_MINUTES ? 'low' : null;
}

const list = (value: unknown): Data[] =>
  Array.isArray(value) ? value.filter((item): item is Data => typeof item === 'object' && item !== null) : [];

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function named(id: string, data: Data): NowNamed {
  return { id, name: text(data['name']) ?? '', shortName: text(data['shortName']) };
}

/** Whether a league draw uses [sheetId]. A draw with no sheets has the whole ice. */
export function drawUsesSheet(draw: Data, sheetId: string): boolean {
  const sheetIds = draw['sheetIds'];
  if (!Array.isArray(sheetIds) || sheetIds.length === 0) return true;
  return sheetIds.includes(sheetId);
}

function inSeason(league: Data, date: string): boolean {
  // ISO dates compare correctly as text.
  const start = text(league['seasonStart']);
  const end = text(league['seasonEnd']);
  if (start && DATE.test(start) && date < start) return false;
  if (end && DATE.test(end) && date > end) return false;
  return true;
}

/** The league's draws on [sheetId] near [at], today's and any of
 *  yesterday's that ran past midnight. */
export function leagueCandidates(league: NowLeague, at: number, sheetId: string): Candidate[] {
  if (league.data['active'] === false) return [];
  const found: Candidate[] = [];
  for (const offset of [-1, 0]) {
    const day = startOfDay(at) + offset * MINUTES_PER_DAY;
    const date = dateOf(day);
    if (!inSeason(league.data, date)) continue;
    for (const draw of list(league.data['draws'])) {
      if (draw['day'] !== weekdayOf(day) || !drawUsesSheet(draw, sheetId)) continue;
      const startOfDraw = minutesOfDay(draw['start']);
      const endOfDraw = minutesOfDay(draw['end']);
      if (startOfDraw === null || endOfDraw === null) continue;
      const start = day + startOfDraw;
      // A draw that ends after midnight.
      const end = day + endOfDraw + (endOfDraw <= startOfDraw ? MINUTES_PER_DAY : 0);
      const confidence = confidenceFor(at, start, end);
      if (!confidence) continue;
      found.push({
        kind: 'league', source: 'schedule', confidence, minutesFromStart: at - start,
        league: named(league.id, league.data), bonspiel: null,
        draw: { date, start: draw['start'] as string, end: draw['end'] as string, label: null },
        game: null, team1: null, team2: null,
      });
    }
  }
  return found;
}

function bonspielOnDate(data: Data, at: number): boolean {
  if (data['active'] === false) return false;
  const start = text(data['startDate']);
  const end = text(data['endDate']);
  if (!start || !end) return false;
  // The day before too, for a late draw that runs past midnight.
  return [dateOf(at), dateOf(at - MINUTES_PER_DAY)].some((date) => date >= start && date <= end);
}

function bonspielGameOf(bonspiel: NowBonspiel, game: Data): NowGame {
  const event = list(bonspiel.data['events']).find((e) => e['id'] === game['eventId']);
  return { id: game['id'] as string, label: text(game['label']) ?? '', event: text(event?.['name']) };
}

function bonspielDrawOf(draw: Data | undefined): NowDraw | null {
  const start = draw ? bonspielDrawStart(draw) : null;
  if (!draw || start === null) return null;
  return { date: dateOf(start), start: timeOf(start), end: null, label: text(draw['label']) };
}

/**
 * The bonspiel's game on [sheetId] in the draw on at [at]: the one starting
 * next, from the lead time before it starts until the same time before the
 * draw after it, as on the scoreboard. None when that draw has no game on
 * the sheet, or it is too far off.
 */
export function bonspielCandidate(bonspiel: NowBonspiel, at: number, sheetId: string): Candidate | null {
  if (!bonspielOnDate(bonspiel.data, at)) return null;
  const draws = list(bonspiel.data['draws'])
    .map((draw) => ({ draw, start: bonspielDrawStart(draw) }))
    .filter((d): d is { draw: Data; start: number } => d.start !== null)
    .sort((a, b) => a.start - b.start);
  if (draws.length === 0) return null;

  let index = 0;
  draws.forEach((d, i) => {
    if (d.start - DRAW_LEAD_MINUTES <= at) index = i;
  });
  const { draw, start } = draws[index];
  const next = draws[index + 1];
  // A draw is on until the lead time before the next, and the last of a
  // day for as long as a game takes.
  const end = Math.min(
    next ? next.start - DRAW_LEAD_MINUTES : Infinity,
    start + BONSPIEL_DRAW_MINUTES,
  );
  const confidence = confidenceFor(at, start, end);
  if (!confidence) return null;

  const game = list(bonspiel.data['games']).find((g) => g['drawId'] === draw['id'] && g['sheetId'] === sheetId);
  if (!game) return null;

  const resolved = resolveBonspiel(bonspiel.data, bonspiel.results).games[game['id'] as string];
  const teamOf = (team: { teamId?: string; name: string } | null | undefined): NowTeam | null =>
    team ? { teamId: team.teamId ?? null, name: team.name } : null;
  return {
    kind: 'bonspiel', source: 'schedule', confidence, minutesFromStart: at - start,
    league: null, bonspiel: named(bonspiel.id, bonspiel.data),
    draw: bonspielDrawOf(draw), game: bonspielGameOf(bonspiel, game),
    team1: teamOf(resolved?.team1), team2: teamOf(resolved?.team2),
  };
}

function liveTeam(team: unknown): NowTeam | null {
  const data = team as Data | undefined;
  const name = text(data?.['name']);
  // In an open game the names are only the rock colors.
  const teamId = text(data?.['teamId']);
  return name && teamId ? { teamId, name } : null;
}

/** The sheet's live game, when it is a league or bonspiel game. An open
 *  game says nothing about what is scheduled, so it is not one. */
export function liveCandidate(input: NowInput, scheduled: Candidate[]): Candidate | null {
  const live = input.liveGame;
  if (!live) return null;
  const team1 = liveTeam(live['team1']);
  const team2 = liveTeam(live['team2']);

  const tag = live['bonspiel'] as Data | undefined;
  if (tag && typeof tag['id'] === 'string') {
    const bonspiel = input.bonspiels.find((b) => b.id === tag['id']);
    const game = bonspiel && list(bonspiel.data['games']).find((g) => g['id'] === tag['gameId']);
    const draw = bonspiel && game ? list(bonspiel.data['draws']).find((d) => d['id'] === game['drawId']) : undefined;
    const drawStart = draw ? bonspielDrawStart(draw) : null;
    return {
      kind: 'bonspiel', source: 'liveGame', confidence: 'high',
      minutesFromStart: drawStart === null ? null : input.at - drawStart,
      league: null,
      bonspiel: bonspiel ? named(bonspiel.id, bonspiel.data) : { id: tag['id'], name: text(tag['name']) ?? '', shortName: null },
      draw: bonspielDrawOf(draw),
      game: bonspiel && game ? bonspielGameOf(bonspiel, game) : null,
      team1, team2,
    };
  }

  const league = live['league'] as Data | undefined;
  if (league && typeof league['id'] === 'string') {
    const known = input.leagues.find((l) => l.id === league['id']);
    // The draw it is most likely in, when the league has one near.
    const near = scheduled.find((c) => c.league?.id === league['id']);
    return {
      kind: 'league', source: 'liveGame', confidence: 'high',
      minutesFromStart: near?.minutesFromStart ?? null,
      league: known ? named(known.id, known.data) : { id: league['id'], name: text(league['name']) ?? '', shortName: null },
      bonspiel: null, draw: near?.draw ?? null, game: null,
      team1, team2,
    };
  }
  return null;
}

function compare(a: Candidate, b: Candidate): number {
  if (a.source !== b.source) return a.source === 'liveGame' ? -1 : 1;
  if (a.confidence !== b.confidence) return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
  // On a bonspiel's dates its games come first, as on the scoreboard.
  if (a.kind !== b.kind) return a.kind === 'bonspiel' ? -1 : 1;
  return Math.abs(a.minutesFromStart ?? 0) - Math.abs(b.minutesFromStart ?? 0);
}

function sameAs(live: Candidate, other: Candidate): boolean {
  if (live.kind === 'league') return other.league?.id === live.league?.id;
  return other.bonspiel?.id === live.bonspiel?.id && other.game?.id === live.game?.id;
}

/** What is on the sheet at the input's time, best first. */
export function whatIsOn(input: NowInput): NowAnswer {
  const scheduled = [
    ...input.bonspiels.map((b) => bonspielCandidate(b, input.at, input.sheetId)).filter((c): c is Candidate => c !== null),
    ...input.leagues.flatMap((l) => leagueCandidates(l, input.at, input.sheetId)),
  ].sort(compare);

  const live = liveCandidate(input, scheduled);
  const candidates = live ? [live, ...scheduled.filter((c) => !sameAs(live, c))] : scheduled;
  const [first, second] = candidates;
  if (!first) return { match: null, candidates };

  // Two leagues both on the sheet now, which a correct schedule never
  // gives: keep the first, but say it is a guess, so a person can choose.
  const doubtful = first.source === 'schedule' && first.confidence === 'high'
    && second?.confidence === 'high' && second.kind === first.kind;
  const match = doubtful ? { ...first, confidence: 'medium' as const } : first;
  return { match, candidates: [match, ...candidates.slice(1)] };
}

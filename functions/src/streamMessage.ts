// A stream's title and description, written from templates the club can
// change in the admin portal, one pair for each kind of answer from /now.
// Variables are written in braces, like {league}, as in the webhook message.
// A part in square brackets is left out when a variable in it is empty, so
// a template can name the teams once they are known:
//
//   {league} · {sheet}[ · {matchup}]
//
// The admin portal lists the same variables and defaults, with sample values
// for its preview, in admin/src/lib/streamMessage.ts: keep the two in step.

import { Clock, timeOptions } from './clock';
import { Candidate } from './now';

export type StreamKind = 'league' | 'bonspiel' | 'none';

export const STREAM_KINDS: StreamKind[] = ['league', 'bonspiel', 'none'];

export interface StreamTemplate {
  title: string;
  description: string;
}

/** Used for any template the club has not written. */
export const DEFAULT_STREAM_TEMPLATES: Record<StreamKind, StreamTemplate> = {
  league: {
    title: '{league} · {sheet} · {date}[ · {matchup}]',
    description: '{league} on {sheet} at {club}, {weekday}, {date}.[\n{matchup}][\nLive scores: {scoresUrl}]',
  },
  bonspiel: {
    title: '{bonspiel} · {draw} · {bonspielGame}[ · {matchup}]',
    description: '{bonspiel}, {event}, {draw} on {sheet} at {club}.[\n{matchup}][\nLive scores: {scoresUrl}]',
  },
  none: {
    title: '{club} · {sheet} · {date}',
    description: 'Curling on {sheet} at {club}.[\nLive scores: {scoresUrl}]',
  },
};

// What YouTube accepts.
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 5000;

// Match the limits in firestore.rules.
export const MAX_TITLE_TEMPLATE_LENGTH = 300;
export const MAX_DESCRIPTION_TEMPLATE_LENGTH = 5000;

export interface StreamContext {
  clubName: string;
  sheetName: string;
  /** What is on, or null when nothing is near. */
  match: Candidate | null;
  /** The club's local time now, 'YYYY-MM-DD', for a stream with no match. */
  today: string;
  /** The public scores page, or null when the club has it switched off. */
  scoresUrl: string | null;
  /** The club's 12 or 24 hour clock for the draw time; 12 hour if not given. */
  clock?: Clock;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Dates are the club's own already, so they are written as they are, in UTC.
function formatDay(date: string | undefined, options: Intl.DateTimeFormatOptions): string {
  const match = DATE.exec(date ?? '');
  if (!match) return '';
  const at = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(at);
}

function formatTime(hhmm: string | undefined, clock: Clock): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  if (!match) return '';
  const at = new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...timeOptions(clock) }).format(at);
}

/** Which of the club's templates an answer uses. */
export function streamKindOf(match: Candidate | null): StreamKind {
  return match?.kind ?? 'none';
}

/** Every variable a template can use, and its value for this answer. */
export function streamVariables({ clubName, sheetName, match, today, scoresUrl, clock = '12h' }: StreamContext): Record<string, string> {
  // The draw's day, so a stream started after midnight keeps its evening.
  const date = match?.draw?.date ?? today;
  const team1 = match?.team1?.name ?? '';
  const team2 = match?.team2?.name ?? '';
  return {
    club: clubName,
    sheet: sheetName,
    league: match?.league?.name ?? '',
    leagueShort: match?.league?.shortName ?? match?.league?.name ?? '',
    bonspiel: match?.bonspiel?.name ?? '',
    bonspielShort: match?.bonspiel?.shortName ?? match?.bonspiel?.name ?? '',
    event: match?.game?.event ?? '',
    draw: match?.draw?.label ?? '',
    bonspielGame: match?.game?.label ?? '',
    team1,
    team2,
    matchup: team1 && team2 ? `${team1} v ${team2}` : '',
    date: formatDay(date, { year: 'numeric', month: 'long', day: 'numeric' }),
    shortDate: formatDay(date, { year: 'numeric', month: 'numeric', day: 'numeric' }),
    weekday: formatDay(date, { weekday: 'long' }),
    drawTime: formatTime(match?.draw?.start, clock),
    scoresUrl: scoresUrl ?? '',
  };
}

// Stand-ins for a doubled bracket, written [[ or ]] for a bracket of its
// own, while the parts are found.
const OPEN = '';
const CLOSE = '';

const has = (variables: Record<string, string>, name: string) =>
  Object.prototype.hasOwnProperty.call(variables, name);

function fill(text: string, variables: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (has(variables, name) ? variables[name] : match));
}

/**
 * The template with each known variable filled in. A part in square
 * brackets that holds a variable is left out when any variable in it is
 * empty, and otherwise written without its brackets. Brackets around no
 * variable are written as they are. Anything else in braces is left as
 * written, so a misspelled variable shows up in the title.
 */
export function renderStreamTemplate(template: string, variables: Record<string, string>): string {
  const escaped = template.replace(/\[\[/g, OPEN).replace(/\]\]/g, CLOSE);
  const parts = escaped.replace(/\[([^[\]]*)\]/g, (whole, inner: string) => {
    const names = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((name) => has(variables, name));
    if (names.length === 0) return whole;
    return names.some((name) => variables[name] === '') ? '' : inner;
  });
  return fill(parts, variables).replace(new RegExp(OPEN, 'g'), '[').replace(new RegExp(CLOSE, 'g'), ']');
}

/** A title YouTube accepts: one line, no angle brackets, at most 100
 *  characters, cut at a word. */
export function cleanTitle(title: string): string {
  const line = title.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (line.length <= MAX_TITLE_LENGTH) return line;
  const cut = line.slice(0, MAX_TITLE_LENGTH - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A description YouTube accepts: no angle brackets, at most 5,000 characters. */
export function cleanDescription(description: string): string {
  return description.replace(/[<>]/g, '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

/** The club's template for [kind], with the default for any part not written. */
export function templateFor(stored: unknown, kind: StreamKind): StreamTemplate {
  const own = (stored as Record<string, Record<string, unknown> | undefined> | undefined)?.[kind];
  const pick = (key: keyof StreamTemplate) => {
    const value = own?.[key];
    return typeof value === 'string' && value.trim() !== '' ? value : DEFAULT_STREAM_TEMPLATES[kind][key];
  };
  return { title: pick('title'), description: pick('description') };
}

/** The title and description for an answer, from the club's templates or
 *  the defaults. */
export function streamText(templates: unknown, context: StreamContext): StreamTemplate {
  const template = templateFor(templates, streamKindOf(context.match));
  const variables = streamVariables(context);
  return {
    title: cleanTitle(renderStreamTemplate(template.title, variables)),
    description: cleanDescription(renderStreamTemplate(template.description, variables)),
  };
}

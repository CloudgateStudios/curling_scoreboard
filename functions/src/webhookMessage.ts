import { Timestamp } from 'firebase-admin/firestore';

// The text of a completed game's webhook post, written from a template the
// club can change in the admin portal. Variables are written in braces, like
// {team1}. The admin portal lists the same variables, with sample values for
// its preview, in admin/src/lib/webhookMessage.ts: keep the two in step.

/** Used when the club has not written its own. Gives the same message as
 *  before templates existed, e.g. "Monday Night, Sheet 2: Team Smith 7, Team Jones 4". */
export const DEFAULT_TEMPLATE = '{leagueAndSheet}: {team1} {team1Score}, {team2} {team2Score}';

// Matches the limit in firestore.rules.
export const MAX_TEMPLATE_LENGTH = 1000;

export interface MessageContext {
  clubName: string;
  sheetName: string;
  game: FirebaseFirestore.DocumentData;
  /** IANA time zone the dates and times are written in. */
  timeZone: string;
}

/** The time zone, if this machine knows it, or UTC. */
export function validTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== 'string' || timeZone === '') return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatDate(date: Date | null, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return date ? new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(date) : '';
}

/** e.g. "1h 55m", or "48m" under an hour. */
function formatDuration(start: Date | null, end: Date | null): string {
  if (!start || !end || end < start) return '';
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** Every variable a template can use and its value for this game. */
export function messageVariables({ clubName, sheetName, game, timeZone }: MessageContext): Record<string, string> {
  const team = (t: FirebaseFirestore.DocumentData | undefined) => ({
    name: String(t?.['name'] ?? 'Unknown'),
    score: Number(t?.['totalScore'] ?? 0),
  });
  const team1 = team(game['team1']);
  const team2 = team(game['team2']);
  const tied = team1.score === team2.score;
  const [winner, loser] = team1.score >= team2.score ? [team1, team2] : [team2, team1];

  const leagueName = game['league']?.['name'];
  const league = typeof leagueName === 'string' ? leagueName : '';

  const started = toDate(game['startedAt']);
  const finished = toDate(game['finishedAt']);
  const ends = Array.isArray(game['ends']) ? game['ends'].length : 0;

  return {
    club: clubName,
    sheet: sheetName,
    league,
    leagueAndSheet: league !== '' ? `${league}, ${sheetName}` : sheetName,
    team1: team1.name,
    team1Score: String(team1.score),
    team2: team2.name,
    team2Score: String(team2.score),
    winner: winner.name,
    winnerScore: String(winner.score),
    loser: loser.name,
    loserScore: String(loser.score),
    result: tied
      ? `${team1.name} and ${team2.name} tied ${team1.score}-${team2.score}`
      : `${winner.name} beat ${loser.name} ${winner.score}-${loser.score}`,
    endsPlayed: String(ends),
    scheduledEnds: String(game['numberOfEnds'] ?? ''),
    date: formatDate(finished, timeZone, { year: 'numeric', month: 'long', day: 'numeric' }),
    shortDate: formatDate(finished, timeZone, { year: 'numeric', month: 'numeric', day: 'numeric' }),
    weekday: formatDate(finished, timeZone, { weekday: 'long' }),
    startTime: formatDate(started, timeZone, { hour: 'numeric', minute: '2-digit' }),
    finishTime: formatDate(finished, timeZone, { hour: 'numeric', minute: '2-digit' }),
    duration: formatDuration(started, finished),
  };
}

/** The template with each known variable filled in. Anything else in braces
 *  is left as written, so a misspelled variable shows up in the channel. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match);
}

/** The message for a completed game, from the club's template or the default. */
export function gameMessage(template: string | undefined, context: MessageContext): string {
  const text = template && template.trim() !== '' ? template : DEFAULT_TEMPLATE;
  return renderTemplate(text, messageVariables(context));
}

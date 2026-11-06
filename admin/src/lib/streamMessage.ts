// The variables and defaults of a club's stream titles and descriptions. The
// functions fill them in for each answer from the API's /now in
// functions/src/streamMessage.ts: keep the two in step. The samples here are
// only for the preview.

export type StreamKind = 'league' | 'bonspiel' | 'none';

export interface StreamTemplate {
  title: string;
  description: string;
}

export type StreamTemplates = Record<StreamKind, StreamTemplate>;

export const STREAM_KINDS: { kind: StreamKind; label: string; description: string }[] = [
  { kind: 'league', label: 'League', description: 'A league draw on the sheet' },
  { kind: 'bonspiel', label: 'Bonspiel', description: 'A bonspiel game on the sheet' },
  { kind: 'none', label: 'Nothing scheduled', description: 'Nothing on the schedule near the time' },
];

/** Used for any template the club has not written. */
export const DEFAULT_STREAM_TEMPLATES: StreamTemplates = {
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

export interface StreamVariable {
  name: string;
  description: string;
  /** Only filled in for these kinds; empty for the others. */
  kinds: StreamKind[];
  sample: string;
}

const ALL: StreamKind[] = ['league', 'bonspiel', 'none'];
const GAMES: StreamKind[] = ['league', 'bonspiel'];

export const STREAM_VARIABLES: StreamVariable[] = [
  { name: 'club', description: 'Club name', kinds: ALL, sample: 'Windy City Curling' },
  { name: 'sheet', description: 'Sheet name', kinds: ALL, sample: 'Sheet 2' },
  { name: 'league', description: 'League name', kinds: ['league'], sample: 'Monday Night Men\'s' },
  { name: 'leagueShort', description: 'League short name, or its name', kinds: ['league'], sample: 'Men\'s' },
  { name: 'bonspiel', description: 'Bonspiel name', kinds: ['bonspiel'], sample: 'Founders Cup' },
  { name: 'bonspielShort', description: 'Bonspiel short name, or its name', kinds: ['bonspiel'], sample: 'Founders' },
  { name: 'draw', description: 'The bonspiel draw', kinds: ['bonspiel'], sample: 'Draw 5' },
  { name: 'bonspielGame', description: 'The game\'s name in the bonspiel', kinds: ['bonspiel'], sample: 'A7' },
  { name: 'event', description: 'The game\'s event in the bonspiel', kinds: ['bonspiel'], sample: 'A Event' },
  { name: 'team1', description: 'First team, once known', kinds: GAMES, sample: 'Team Smith' },
  { name: 'team2', description: 'Second team, once known', kinds: GAMES, sample: 'Team Jones' },
  { name: 'matchup', description: '"Team Smith v Team Jones", once both are known', kinds: GAMES, sample: 'Team Smith v Team Jones' },
  { name: 'date', description: 'The draw\'s day, or today with nothing scheduled', kinds: ALL, sample: 'November 3, 2026' },
  { name: 'shortDate', description: 'The same day, in numbers', kinds: ALL, sample: '11/3/2026' },
  { name: 'weekday', description: 'Day of the week', kinds: ALL, sample: 'Tuesday' },
  { name: 'drawTime', description: 'When the draw is due to start', kinds: GAMES, sample: '6:30 PM' },
  { name: 'scoresUrl', description: 'The public scores page, when it is on', kinds: ALL, sample: 'https://example.com/display/club/scores' },
];

const TEAM_VARIABLES = ['team1', 'team2', 'matchup'];

const has = (variables: Record<string, string>, name: string) =>
  Object.prototype.hasOwnProperty.call(variables, name);

/** The sample values for [kind], with the teams left empty unless
 *  [withTeams], to preview a stream started before they are picked. */
export function sampleVariables(kind: StreamKind, withTeams: boolean): Record<string, string> {
  return Object.fromEntries(STREAM_VARIABLES.map((v) => [
    v.name,
    v.kinds.includes(kind) && (withTeams || !TEAM_VARIABLES.includes(v.name)) ? v.sample : '',
  ]));
}

// Stand-ins for a doubled bracket, written [[ or ]] for a bracket of its
// own, while the parts are found.
const OPEN = '';
const CLOSE = '';

/**
 * The template with each known variable filled in. A part in square
 * brackets that holds a variable is left out when any variable in it is
 * empty, and otherwise written without its brackets. Brackets around no
 * variable are written as they are. Anything else in braces is left as
 * written. The same as renderStreamTemplate in the functions.
 */
export function renderStreamTemplate(template: string, variables: Record<string, string>): string {
  const escaped = template.replace(/\[\[/g, OPEN).replace(/\]\]/g, CLOSE);
  const parts = escaped.replace(/\[([^[\]]*)\]/g, (whole, inner: string) => {
    const names = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((name) => has(variables, name));
    if (names.length === 0) return whole;
    return names.some((name) => variables[name] === '') ? '' : inner;
  });
  return parts
    .replace(/\{(\w+)\}/g, (match, name: string) => (has(variables, name) ? variables[name] : match))
    .replace(new RegExp(OPEN, 'g'), '[')
    .replace(new RegExp(CLOSE, 'g'), ']');
}

/** A title as the functions post it: one line, no angle brackets, at most
 *  100 characters, cut at a word. */
export function cleanTitle(title: string): string {
  const line = title.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (line.length <= MAX_TITLE_LENGTH) return line;
  const cut = line.slice(0, MAX_TITLE_LENGTH - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A description as the functions post it. */
export function cleanDescription(description: string): string {
  return description.replace(/[<>]/g, '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

/** The template filled in with the samples, as the stream would get it, and
 *  how long the title is before it is cut. */
export function previewStream(
  kind: StreamKind,
  template: StreamTemplate,
  withTeams: boolean,
): StreamTemplate & { titleLength: number } {
  const variables = sampleVariables(kind, withTeams);
  const title = renderStreamTemplate(template.title.trim() || DEFAULT_STREAM_TEMPLATES[kind].title, variables);
  const description = renderStreamTemplate(
    template.description.trim() || DEFAULT_STREAM_TEMPLATES[kind].description, variables,
  );
  return {
    title: cleanTitle(title),
    description: cleanDescription(description),
    titleLength: title.replace(/\s+/g, ' ').trim().length,
  };
}

/** Names in braces that are not variables, most likely misspelled. */
export function unknownStreamVariables(template: string): string[] {
  const known = new Set(STREAM_VARIABLES.map((v) => v.name));
  const names = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(names.filter((name) => !known.has(name)))];
}

/** Reads the club's templates, with the default for anything not written. */
export function streamTemplatesFrom(stored: unknown): StreamTemplates {
  const own = stored as Record<string, Record<string, unknown> | undefined> | undefined;
  const pick = (kind: StreamKind, key: keyof StreamTemplate) => {
    const value = own?.[kind]?.[key];
    return typeof value === 'string' && value.trim() !== '' ? value : DEFAULT_STREAM_TEMPLATES[kind][key];
  };
  return Object.fromEntries(ALL.map((kind) => [kind, {
    title: pick(kind, 'title'),
    description: pick(kind, 'description'),
  }])) as StreamTemplates;
}

/** What is stored for the templates: only what differs from the defaults,
 *  or null when nothing does. */
export function streamTemplatesToSave(templates: StreamTemplates): Partial<Record<StreamKind, Partial<StreamTemplate>>> | null {
  const saved: Partial<Record<StreamKind, Partial<StreamTemplate>>> = {};
  for (const kind of ALL) {
    for (const key of ['title', 'description'] as const) {
      const value = templates[kind][key];
      if (value.trim() !== '' && value !== DEFAULT_STREAM_TEMPLATES[kind][key]) {
        saved[kind] = { ...saved[kind], [key]: value };
      }
    }
  }
  return Object.keys(saved).length > 0 ? saved : null;
}

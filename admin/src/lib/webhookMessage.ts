// The variables a club's webhook message template can use. The functions fill
// them in for each game in functions/src/webhookMessage.ts: keep the two in
// step. The samples here are only for the preview.

import { DEFAULT_CLOCK, formatHm, type Clock } from './clock.ts';

export interface MessageVariable {
  name: string;
  description: string;
  /** On the 12 hour clock, for a time. */
  sample: string;
  /** For a time, the sample's 'HH:mm', to show it on the club's clock. */
  time?: string;
}

/** A variable's sample, with a time on the club's clock. */
export function sampleOf(variable: { sample: string; time?: string }, clock: Clock): string {
  return variable.time ? formatHm(variable.time, clock) : variable.sample;
}

export interface MessageVariableGroup {
  title: string;
  variables: MessageVariable[];
}

/** Used when the club has not written its own. */
export const DEFAULT_TEMPLATE = '{leagueAndSheet}: {team1} {team1Score}, {team2} {team2Score}';

// Matches the limit in firestore.rules.
export const MAX_TEMPLATE_LENGTH = 1000;

export const MESSAGE_VARIABLES: MessageVariableGroup[] = [
  {
    title: 'Game',
    variables: [
      { name: 'team1', description: 'First team', sample: 'Team Smith' },
      { name: 'team1Score', description: 'First team\'s score', sample: '7' },
      { name: 'team2', description: 'Second team', sample: 'Team Jones' },
      { name: 'team2Score', description: 'Second team\'s score', sample: '4' },
      { name: 'winner', description: 'Winning team (first team on a tie)', sample: 'Team Smith' },
      { name: 'winnerScore', description: 'Winning score', sample: '7' },
      { name: 'loser', description: 'Losing team (second team on a tie)', sample: 'Team Jones' },
      { name: 'loserScore', description: 'Losing score', sample: '4' },
      { name: 'result', description: '"A beat B 7-4", or "A and B tied 5-5"', sample: 'Team Smith beat Team Jones 7-4' },
      { name: 'endsPlayed', description: 'Ends played', sample: '8' },
      { name: 'scheduledEnds', description: 'Ends the game was set for', sample: '8' },
      { name: 'sheet', description: 'Sheet name', sample: 'Sheet 2' },
      { name: 'club', description: 'Club name', sample: 'Windy City Curling' },
    ],
  },
  {
    title: 'League',
    variables: [
      { name: 'league', description: 'League name, blank for open games', sample: 'Monday Night' },
      { name: 'leagueAndSheet', description: '"League, Sheet", "Bonspiel Game, Sheet" for a bonspiel game, or just the sheet for open games', sample: 'Monday Night, Sheet 2' },
    ],
  },
  {
    title: 'Bonspiel',
    variables: [
      { name: 'bonspiel', description: 'Bonspiel name, blank outside bonspiels', sample: 'Fall Spiel' },
      { name: 'bonspielGame', description: 'The game\'s name in the bonspiel', sample: 'A7' },
      { name: 'event', description: 'The game\'s event in the bonspiel', sample: 'A Event' },
    ],
  },
  {
    title: 'Date and time',
    variables: [
      { name: 'date', description: 'Day the game started, even if it ran past midnight', sample: 'October 8, 2026' },
      { name: 'shortDate', description: 'Day the game started, in numbers', sample: '10/8/2026' },
      { name: 'weekday', description: 'Day of the week the game started', sample: 'Thursday' },
      { name: 'finishDate', description: 'Day the game finished', sample: 'October 8, 2026' },
      { name: 'startTime', description: 'When the game started', sample: '6:30 PM', time: '18:30' },
      { name: 'finishTime', description: 'When the game finished', sample: '8:25 PM', time: '20:25' },
      { name: 'duration', description: 'How long the game took', sample: '1h 55m' },
    ],
  },
];

const VARIABLES = MESSAGE_VARIABLES.flatMap((group) => group.variables);
const SAMPLES: Record<string, string> = Object.fromEntries(VARIABLES.map((v) => [v.name, v.sample]));

/** The template filled in with the sample game, the way the functions leave
 *  anything they don't know in braces, with times on the club's clock. */
export function previewTemplate(template: string, clock: Clock = DEFAULT_CLOCK): string {
  const samples = Object.fromEntries(VARIABLES.map((v) => [v.name, sampleOf(v, clock)]));
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(samples, name) ? samples[name] : match);
}

/** Names in braces that are not variables, most likely misspelled. */
export function unknownVariables(template: string): string[] {
  const names = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(names.filter((name) => !Object.prototype.hasOwnProperty.call(SAMPLES, name)))];
}

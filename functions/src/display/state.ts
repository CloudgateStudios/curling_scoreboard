import { LIVE_GAME_TIMEOUT_MS } from '../liveGame';

// What the club's display pages (the score bug and the warm room screen)
// read. Each club has one summary document, clubs/{clubId}/private/displayState,
// which the triggers in ./triggers.ts keep up to date from the sheets and their
// completed games. A display listens to that one document, so it costs a read
// per change rather than a read per sheet per poll.
//
// Nothing here imports Firebase, so scripts/backfill-display-state.js can
// build the same entries from the compiled file. Timestamps are only ever
// asked for toMillis(), which the Admin and client SDKs' Timestamps both have.

/** A Firestore Timestamp from either SDK. */
export interface TimestampLike {
  toMillis(): number;
}

type Data = Record<string, unknown>;

export type TeamSlot = 'team1' | 'team2';

export interface DisplayTeam {
  name: string;
  /** Absent on games from before the rock color was recorded. */
  color: { name: string; hex: string } | null;
  score: number;
  /** Who throws last stone in the current end. Null once the game is over. */
  hasHammer: boolean | null;
  hadLastStoneFirstEnd: boolean | null;
}

export interface DisplayEnd {
  endNumber: number;
  /** Null for a blank end. */
  scoringTeamSlot: TeamSlot | null;
  score: number;
}

export interface DisplayLiveGame {
  /** Null for games from scoreboards that predate updatedAt. */
  updatedAt: TimestampLike | null;
  currentEnd: number;
  /** Null until the scoreboard sends it with the live game. */
  numberOfEnds: number | null;
  league: { name: string } | null;
  team1: DisplayTeam;
  team2: DisplayTeam;
  /** Null until the scoreboard sends the ends with the live game. */
  ends: DisplayEnd[] | null;
}

export interface DisplayFinishedGame {
  gameId: string;
  startedAt: TimestampLike | null;
  finishedAt: TimestampLike;
  numberOfEnds: number | null;
  league: { name: string } | null;
  team1: DisplayTeam;
  team2: DisplayTeam;
  ends: DisplayEnd[];
}

export interface DisplaySheet {
  name: string;
  live: DisplayLiveGame | null;
  /** The sheet's most recently finished game, once it has one. */
  lastGame?: DisplayFinishedGame;
}

/** How long a finished game stays on the displays as the final score. */
export const FINAL_SHOWN_MS = 10 * 60 * 1000;

function isTimestamp(value: unknown): value is TimestampLike {
  return typeof (value as TimestampLike | null)?.toMillis === 'function';
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function colorOf(value: unknown): DisplayTeam['color'] {
  const color = value as Data | null | undefined;
  if (typeof color?.['name'] !== 'string' || typeof color['hex'] !== 'string') return null;
  return { name: color['name'], hex: color['hex'] };
}

// Only the league's name: its ID, like the teams' IDs, is for integrations.
function leagueOf(value: unknown): { name: string } | null {
  const name = (value as Data | null | undefined)?.['name'];
  return typeof name === 'string' ? { name } : null;
}

function teamOf(value: unknown, scoreField: 'score' | 'totalScore', live: boolean): DisplayTeam {
  const team = (value ?? {}) as Data;
  return {
    name: stringOr(team['name'], ''),
    color: colorOf(team['color']),
    score: numberOr(team[scoreField], 0),
    hasHammer: live ? boolOrNull(team['hasHammer']) : null,
    hadLastStoneFirstEnd: boolOrNull(team['hadLastStoneFirstEnd']),
  };
}

// Older games name the scoring team instead of its slot. That is only
// trusted while the two names differ.
function slotOf(end: Data, team1Name: string, team2Name: string): TeamSlot | null {
  const slot = end['scoringTeamSlot'];
  if (slot === 'team1' || slot === 'team2') return slot;
  const scoringTeam = end['scoringTeam'];
  if (typeof scoringTeam !== 'string' || team1Name === team2Name) return null;
  if (scoringTeam === team1Name) return 'team1';
  if (scoringTeam === team2Name) return 'team2';
  return null;
}

function endsOf(value: unknown, team1Name: string, team2Name: string): DisplayEnd[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((raw, i) => {
    const end = (raw ?? {}) as Data;
    const score = numberOr(end['score'], 0);
    return {
      endNumber: numberOr(end['endNumber'], i + 1),
      scoringTeamSlot: score > 0 ? slotOf(end, team1Name, team2Name) : null,
      score,
    };
  });
}

/** The display's view of a sheet's `liveGame`, or null when it has none. */
export function displayLiveGame(liveGame: unknown): DisplayLiveGame | null {
  if (liveGame === null || typeof liveGame !== 'object') return null;
  const game = liveGame as Data;
  const team1 = teamOf(game['team1'], 'score', true);
  const team2 = teamOf(game['team2'], 'score', true);
  return {
    updatedAt: isTimestamp(game['updatedAt']) ? game['updatedAt'] : null,
    currentEnd: numberOr(game['currentEnd'], 1),
    numberOfEnds: numberOr(game['numberOfEnds'], null),
    league: leagueOf(game['league']),
    team1,
    team2,
    ends: endsOf(game['ends'], team1.name, team2.name),
  };
}

/** The display's view of a completed game, or null if it has no finish time. */
export function displayFinishedGame(gameId: string, game: Data): DisplayFinishedGame | null {
  const finishedAt = game['finishedAt'];
  if (!isTimestamp(finishedAt)) return null;
  const team1 = teamOf(game['team1'], 'totalScore', false);
  const team2 = teamOf(game['team2'], 'totalScore', false);
  return {
    gameId,
    startedAt: isTimestamp(game['startedAt']) ? game['startedAt'] : null,
    finishedAt,
    numberOfEnds: numberOr(game['numberOfEnds'], null),
    league: leagueOf(game['league']),
    team1,
    team2,
    ends: endsOf(game['ends'], team1.name, team2.name) ?? [],
  };
}

/**
 * The parts of a sheet document a display shows, apart from its last game,
 * which comes from the games subcollection.
 */
export function displaySheet(sheetId: string, sheet: Data): Omit<DisplaySheet, 'lastGame'> {
  return {
    name: stringOr(sheet['name'], sheetId),
    live: displayLiveGame(sheet['liveGame']),
  };
}

/** True when [candidate] finished after the game already shown, if any. */
export function isNewerGame(
  candidate: DisplayFinishedGame,
  current: DisplayFinishedGame | undefined,
): boolean {
  return !current || candidate.finishedAt.toMillis() > current.finishedAt.toMillis();
}

export type SheetView =
  | { kind: 'live'; game: DisplayLiveGame }
  | { kind: 'final'; game: DisplayFinishedGame }
  | { kind: 'idle' };

/**
 * What a display shows for a sheet at [now]:
 *
 * 1. The live game, as soon as one starts, so a new draw replaces the last
 *    one's final score straight away. A live game that has gone two hours
 *    without a write was abandoned and is ignored, as in the REST API.
 * 2. Otherwise the last finished game, for ten minutes after it finished.
 * 3. Otherwise nothing.
 */
export function sheetView(sheet: DisplaySheet, now: number): SheetView {
  const live = sheet.live;
  if (live && (live.updatedAt === null || now - live.updatedAt.toMillis() <= LIVE_GAME_TIMEOUT_MS)) {
    return { kind: 'live', game: live };
  }
  const last = sheet.lastGame;
  if (last && now - last.finishedAt.toMillis() <= FINAL_SHOWN_MS) {
    return { kind: 'final', game: last };
  }
  return { kind: 'idle' };
}

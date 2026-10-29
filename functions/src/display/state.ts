import { LIVE_GAME_TIMEOUT_MS } from '../liveGame';

// What the club's display pages (the score bug and the warm room screen)
// read. Each club has one summary document, clubs/{clubId}/private/displayState,
// which the triggers in ./triggers.ts keep up to date from the sheets and their
// completed games: each sheet's name and live game, and the last day's
// finished games, from which a sheet's final score is found too. A display
// listens to that one document, so it costs a read per change rather than a
// read per sheet per poll.
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
  league: DisplayLeague | null;
  /** The bonspiel game this is, which the bonspiel display shows it as. */
  bonspiel: DisplayBonspiel | null;
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
  league: DisplayLeague | null;
  bonspiel: DisplayBonspiel | null;
  team1: DisplayTeam;
  team2: DisplayTeam;
  ends: DisplayEnd[];
}

/** A game's league. */
export interface DisplayLeague {
  name: string;
  /** What the score bug calls it, from the league as it is now. Absent when
   *  it has no short name. */
  shortName?: string;
}

/** Which bonspiel game a game is. */
export interface DisplayBonspiel {
  id: string;
  name: string;
  /** As for a league. */
  shortName?: string;
  /** The game's ID in the bonspiel's plan. */
  gameId: string;
}

export interface DisplaySheet {
  name: string;
  live: DisplayLiveGame | null;
}

/** The summary document, clubs/{clubId}/private/displayState. */
export interface DisplaySummary {
  sheets?: Record<string, DisplaySheet>;
  /** The last day's finished games, the latest first. */
  results?: DisplayResult[];
}

/** One regular time a league plays, in the club's local time. */
export interface DisplayLeagueDraw {
  /** 1 (Monday) to 7 (Sunday). */
  day: number;
  /** 24 hour 'HH:mm'. */
  start: string;
  end: string;
}

/**
 * A finished game in the summary's results: a sheet's final score, and one
 * of the warm room's earlier results. The league comes with its weekly
 * draws, so the screen, which is at the club and so on its time, can put the
 * game under the draw it was played in.
 */
export interface DisplayResult extends Omit<DisplayFinishedGame, 'league'> {
  sheetId: string;
  /** The sheet's name when the game finished, kept if the sheet goes. */
  sheetName: string;
  /** The last end played, or 0 for a game with no ends recorded. */
  endsPlayed: number;
  league: (DisplayLeague & { draws: DisplayLeagueDraw[] }) | null;
}

/** How long a finished game stays in the summary's results: well past the
 *  ten minutes it is a sheet's final score, for the rest of the day's. */
export const RESULTS_KEPT_MS = 24 * 60 * 60 * 1000;
/** The most results the summary keeps, the latest first: a busy day's worth. */
export const MAX_RESULTS = 48;

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

// Which bonspiel game a game is: what the bonspiel display needs to put its
// score in the right place.
function bonspielOf(value: unknown): DisplayBonspiel | null {
  const bonspiel = value as Data | null | undefined;
  const id = bonspiel?.['id'];
  const name = bonspiel?.['name'];
  const gameId = bonspiel?.['gameId'];
  if (typeof id !== 'string' || typeof name !== 'string' || typeof gameId !== 'string') return null;
  return { id, name, gameId };
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
    bonspiel: bonspielOf(game['bonspiel']),
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
    bonspiel: bonspielOf(game['bonspiel']),
    team1,
    team2,
    ends: endsOf(game['ends'], team1.name, team2.name) ?? [],
  };
}

/**
 * The parts of a sheet document a display shows. Its finished games are in
 * the summary's results, from the games subcollection.
 */
export function displaySheet(sheetId: string, sheet: Data): DisplaySheet {
  return {
    name: stringOr(sheet['name'], sheetId),
    live: displayLiveGame(sheet['liveGame']),
  };
}

const DRAW_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A league document's weekly draws, leaving out any that are not whole. */
export function leagueDraws(league: Data | undefined): DisplayLeagueDraw[] {
  const draws = league?.['draws'];
  if (!Array.isArray(draws)) return [];
  return draws.flatMap((raw) => {
    const draw = (raw ?? {}) as Data;
    const { day, start, end } = draw;
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) return [];
    if (typeof start !== 'string' || !DRAW_TIME.test(start)) return [];
    if (typeof end !== 'string' || !DRAW_TIME.test(end)) return [];
    return [{ day, start, end }];
  });
}

/** A league or bonspiel document's short name, or null when it has none. */
export function shortNameOf(event: Data | undefined): string | null {
  const name = event?.['shortName'];
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/**
 * [game] with the short names its league and bonspiel have now, from their
 * documents, for the score bug. A game only carries the names the
 * scoreboard had, and a club can add or change a short name at any time.
 */
export function withShortNames<G extends { league: DisplayLeague | null; bonspiel: DisplayBonspiel | null }>(
  game: G,
  league: Data | undefined,
  bonspiel: Data | undefined,
): G {
  const leagueName = shortNameOf(league);
  const bonspielName = shortNameOf(bonspiel);
  return {
    ...game,
    league: game.league && leagueName ? { ...game.league, shortName: leagueName } : game.league,
    bonspiel: game.bonspiel && bonspielName ? { ...game.bonspiel, shortName: bonspielName } : game.bonspiel,
  };
}

/**
 * The results entry for [game], played on [sheetId], named [sheetName]. The
 * draws are its league's, or empty for a game outside a league.
 */
export function displayResult(
  sheetId: string,
  sheetName: string,
  game: DisplayFinishedGame,
  draws: DisplayLeagueDraw[],
): DisplayResult {
  return {
    ...game,
    sheetId,
    sheetName,
    endsPlayed: Math.max(0, ...game.ends.map((end) => end.endNumber)),
    league: game.league && { ...game.league, draws },
  };
}

/**
 * The summary's results with [result] added: the latest first, without
 * anything that finished more than a day before [now], and at most
 * MAX_RESULTS. A game already there is replaced, as a trigger can be
 * delivered more than once.
 */
export function withResult(results: unknown, result: DisplayResult, now: number): DisplayResult[] {
  const kept = (Array.isArray(results) ? results as DisplayResult[] : [])
    .filter((r) => isTimestamp(r?.finishedAt) && r.gameId !== result.gameId);
  return [...kept, result]
    .filter((r) => now - r.finishedAt.toMillis() <= RESULTS_KEPT_MS)
    .sort((a, b) => b.finishedAt.toMillis() - a.finishedAt.toMillis())
    .slice(0, MAX_RESULTS);
}

/**
 * The sheet's latest finished game in the summary's results, or null. A game
 * from a scoreboard that was offline can arrive after a later one, so this
 * goes by when each finished, not by which arrived last.
 */
export function lastGameOf(summary: DisplaySummary | null | undefined, sheetId: string): DisplayResult | null {
  let last: DisplayResult | null = null;
  for (const result of summary?.results ?? []) {
    if (result.sheetId !== sheetId) continue;
    if (!last || result.finishedAt.toMillis() > last.finishedAt.toMillis()) last = result;
  }
  return last;
}

export type SheetView =
  | { kind: 'live'; game: DisplayLiveGame }
  | { kind: 'final'; game: DisplayResult }
  | { kind: 'idle' };

/**
 * What a display shows for the sheet [sheetId] in [summary] at [now]:
 *
 * 1. The live game, as soon as one starts, so a new draw replaces the last
 *    one's final score straight away. A live game that has gone two hours
 *    without a write was abandoned and is ignored, as in the REST API.
 * 2. Otherwise the sheet's latest finished game, for ten minutes after it
 *    finished.
 * 3. Otherwise nothing.
 */
export function sheetView(summary: DisplaySummary | null | undefined, sheetId: string, now: number): SheetView {
  const live = summary?.sheets?.[sheetId]?.live;
  if (live && (live.updatedAt === null || now - live.updatedAt.toMillis() <= LIVE_GAME_TIMEOUT_MS)) {
    return { kind: 'live', game: live };
  }
  const last = lastGameOf(summary, sheetId);
  if (last && now - last.finishedAt.toMillis() <= FINAL_SHOWN_MS) {
    return { kind: 'final', game: last };
  }
  return { kind: 'idle' };
}

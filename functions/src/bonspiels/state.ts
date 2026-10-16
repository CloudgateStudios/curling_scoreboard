// Works out who plays in each game of a bonspiel, from the coordinator's plan
// (clubs/{clubId}/bonspiels/{bonspielId}) and the results recorded so far.
// The triggers in ./triggers.ts keep the outcome in the bonspiel's
// state/current document, which the portal reads instead of working it out
// itself.
//
// The plan is written by people in the portal, so everything in it is read
// defensively: a game that refers to one that does not exist, or to itself,
// is left waiting rather than failing the whole bonspiel. Nothing here
// imports Firebase, so it can be tested on its own.

/** A Firestore Timestamp from either SDK. */
export interface TimestampLike {
  toMillis(): number;
}

type Data = Record<string, unknown>;

export type TeamSlot = 'team1' | 'team2';

/** Where one side of a game gets its team. */
export type Side =
  | { teamId: string }
  | { from: string; result: 'winner' | 'loser' }
  | null;

/** A team in a game, as far as it is known. */
export interface StateTeam {
  /** Absent when a scoreboard recorded a team the plan does not have. */
  teamId?: string;
  name: string;
}

/** A game as recorded by a scoreboard, tagged with the bonspiel game it was. */
export interface RecordedResult {
  sheetId: string;
  /** The games document under the sheet. */
  sheetGameId: string;
  finishedAt: TimestampLike;
  team1: StateTeam & { score: number };
  team2: StateTeam & { score: number };
}

export type GameStatus = 'waiting' | 'ready' | 'final';

export interface StateGame {
  /** waiting: a team is not known yet. ready: both are. final: it has a result. */
  status: GameStatus;
  team1: StateTeam | null;
  team2: StateTeam | null;
  team1Score?: number;
  team2Score?: number;
  /** Absent until the game has a result, and on a tie. */
  winner?: TeamSlot;
  /** A result with no winner, which a game that others come from cannot have. */
  tied?: true;
  /** Who gave the result: the coordinator in the portal, or a scoreboard. */
  resultFrom?: 'coordinator' | 'scoreboard';
  /** Where a scoreboard's result came from. */
  sheetId?: string;
  sheetGameId?: string;
}

export interface StateEvent {
  /** The event's final, once the plan has exactly one. */
  finalGameId?: string;
  winner?: StateTeam;
}

export interface ResolvedBonspiel {
  games: Record<string, StateGame>;
  events: Record<string, StateEvent>;
}

interface PlanGame {
  id: string;
  eventId: string | null;
  team1: Side;
  team2: Side;
  result: { winner: TeamSlot; team1Score?: number; team2Score?: number } | null;
}

function isData(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function score(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function sideFrom(value: unknown): Side {
  if (!isData(value)) return null;
  const teamId = nonEmptyString(value.teamId);
  if (teamId) return { teamId };
  const from = nonEmptyString(value.from);
  if (from && (value.result === 'winner' || value.result === 'loser')) {
    return { from, result: value.result };
  }
  return null;
}

function planGames(plan: Data): PlanGame[] {
  if (!Array.isArray(plan.games)) return [];
  const games: PlanGame[] = [];
  for (const game of plan.games) {
    if (!isData(game)) continue;
    const id = nonEmptyString(game.id);
    if (!id) continue;
    const result = isData(game.result) && (game.result.winner === 'team1' || game.result.winner === 'team2')
      ? {
        winner: game.result.winner as TeamSlot,
        team1Score: score(game.result.team1Score),
        team2Score: score(game.result.team2Score),
      }
      : null;
    games.push({
      id,
      eventId: nonEmptyString(game.eventId),
      team1: sideFrom(game.team1),
      team2: sideFrom(game.team2),
      result,
    });
  }
  return games;
}

function planTeams(plan: Data): Map<string, string> {
  const teams = new Map<string, string>();
  if (!Array.isArray(plan.teams)) return teams;
  for (const team of plan.teams) {
    if (!isData(team)) continue;
    const id = nonEmptyString(team.id);
    const name = typeof team.name === 'string' ? team.name.trim() : '';
    if (id && name) teams.set(id, name);
  }
  return teams;
}

const winnerOf = (score1: number, score2: number): TeamSlot | undefined =>
  score1 > score2 ? 'team1' : score2 > score1 ? 'team2' : undefined;

const otherSlot = (slot: TeamSlot): TeamSlot => (slot === 'team1' ? 'team2' : 'team1');

/**
 * Who plays in each game and how it went. A side placed in the plan is that
 * team; a side that comes from another game is that game's winner or loser,
 * once it has one. A scoreboard's result also says who actually played,
 * which wins over the plan, so a game played by other teams after a last
 * minute change still sends the right teams on. A coordinator's result wins
 * over a scoreboard's.
 */
export function resolveBonspiel(plan: Data, results: Record<string, RecordedResult>): ResolvedBonspiel {
  const games = planGames(plan);
  const teams = planTeams(plan);
  const byId = new Map(games.map((g) => [g.id, g]));
  const resolved = new Map<string, StateGame>();

  function teamFor(side: Side, visiting: Set<string>): StateTeam | null {
    if (side === null) return null;
    if ('teamId' in side) {
      const name = teams.get(side.teamId);
      return name === undefined ? null : { teamId: side.teamId, name };
    }
    const source = resolve(side.from, visiting);
    if (!source?.winner) return null;
    const slot = side.result === 'winner' ? source.winner : otherSlot(source.winner);
    return source[slot];
  }

  function resolve(id: string, visiting: Set<string>): StateGame | null {
    const done = resolved.get(id);
    if (done) return done;
    const game = byId.get(id);
    // A game that is not in the plan, or that comes out of itself.
    if (!game || visiting.has(id)) return null;
    visiting.add(id);

    const recorded = results[id];
    const team1 = recorded ? recordedTeam(recorded.team1, teams) : teamFor(game.team1, visiting);
    const team2 = recorded ? recordedTeam(recorded.team2, teams) : teamFor(game.team2, visiting);
    const state: StateGame = {
      status: team1 && team2 ? 'ready' : 'waiting',
      team1,
      team2,
    };

    if (game.result) {
      // Settling a tie, or correcting who won, often leaves the scores out;
      // those a scoreboard recorded stand in for them.
      state.status = 'final';
      state.winner = game.result.winner;
      state.resultFrom = 'coordinator';
      const team1Score = game.result.team1Score ?? recorded?.team1.score;
      const team2Score = game.result.team2Score ?? recorded?.team2.score;
      if (team1Score !== undefined) state.team1Score = team1Score;
      if (team2Score !== undefined) state.team2Score = team2Score;
    } else if (recorded) {
      state.status = 'final';
      state.resultFrom = 'scoreboard';
      state.team1Score = recorded.team1.score;
      state.team2Score = recorded.team2.score;
      const winner = winnerOf(recorded.team1.score, recorded.team2.score);
      if (winner) state.winner = winner;
      else state.tied = true;
    }
    if (recorded) {
      state.sheetId = recorded.sheetId;
      state.sheetGameId = recorded.sheetGameId;
    }

    visiting.delete(id);
    resolved.set(id, state);
    return state;
  }

  for (const game of games) resolve(game.id, new Set());

  return {
    games: Object.fromEntries(resolved),
    events: resolveEvents(plan, games, resolved),
  };
}

function recordedTeam(team: StateTeam, teams: Map<string, string>): StateTeam {
  // The plan's name, in case the team was renamed after the game.
  if (team.teamId && teams.has(team.teamId)) return { teamId: team.teamId, name: teams.get(team.teamId)! };
  return { name: team.name };
}

/**
 * An event's final is its one game whose winner goes to no other game in the
 * event. A knockout event has exactly one; an event with none or several,
 * such as a round robin, has no final and so no winner.
 */
function resolveEvents(
  plan: Data,
  games: PlanGame[],
  resolved: Map<string, StateGame>,
): Record<string, StateEvent> {
  const events: Record<string, StateEvent> = {};
  if (!Array.isArray(plan.events)) return events;
  for (const event of plan.events) {
    if (!isData(event)) continue;
    const eventId = nonEmptyString(event.id);
    if (!eventId) continue;
    const inEvent = games.filter((g) => g.eventId === eventId);
    const goOn = new Set<string>();
    for (const game of inEvent) {
      for (const side of [game.team1, game.team2]) {
        if (side && 'from' in side && side.result === 'winner') goOn.add(side.from);
      }
    }
    const finals = inEvent.filter((g) => !goOn.has(g.id));
    const state: StateEvent = {};
    if (finals.length === 1) {
      const final = resolved.get(finals[0].id);
      state.finalGameId = finals[0].id;
      if (final?.winner) {
        const winner = final[final.winner];
        if (winner) state.winner = winner;
      }
    }
    events[eventId] = state;
  }
  return events;
}

/** The bonspiel a completed game was played for, read from its games document. */
export interface TaggedGame {
  bonspielId: string;
  gameId: string;
  result: RecordedResult;
}

function recordedSide(value: unknown): (StateTeam & { score: number }) | null {
  if (!isData(value)) return null;
  const name = typeof value.name === 'string' ? value.name : '';
  const total = score(value.totalScore);
  if (total === undefined) return null;
  const teamId = nonEmptyString(value.teamId);
  return { ...(teamId ? { teamId } : {}), name, score: total };
}

/** Reads the bonspiel tag a scoreboard puts on a game it played for one. */
export function taggedGame(sheetId: string, sheetGameId: string, data: Data): TaggedGame | null {
  const bonspiel = data.bonspiel;
  if (!isData(bonspiel)) return null;
  const bonspielId = nonEmptyString(bonspiel.id);
  const gameId = nonEmptyString(bonspiel.gameId);
  const finishedAt = data.finishedAt as Partial<TimestampLike> | undefined;
  const team1 = recordedSide(data.team1);
  const team2 = recordedSide(data.team2);
  if (!bonspielId || !gameId || typeof finishedAt?.toMillis !== 'function' || !team1 || !team2) {
    return null;
  }
  return {
    bonspielId,
    gameId,
    result: { sheetId, sheetGameId, finishedAt: finishedAt as TimestampLike, team1, team2 },
  };
}

/** Whether a result should replace the one already kept for its game: a game
 *  played again is recorded again, and the later one counts. */
export function isNewerResult(result: RecordedResult, current: RecordedResult | undefined): boolean {
  return !current || result.finishedAt.toMillis() >= current.finishedAt.toMillis();
}

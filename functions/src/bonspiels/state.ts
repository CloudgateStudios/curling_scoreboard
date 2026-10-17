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
  // The team in place [rank] of an event's standings, once all of its games
  // are played: a pool's winner going on to the playoffs.
  | { rank: number; eventId: string }
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
  /** For an event with no single final, such as a pool's round robin: its
   *  teams in order, as far as its games have been played. */
  standings?: StandingRow[];
  /** Whether every game in the event has been played, which is when the
   *  places in its standings are final. */
  complete?: boolean;
}

/** One team's line in an event's standings. */
export interface StandingRow extends StateTeam {
  played: number;
  wins: number;
  losses: number;
  ties: number;
  /** Two for a win and one for a tie. */
  points: number;
  /** 1 for first. Teams tied for a place share it. */
  place: number;
  /** Shares its place with another team. */
  tied: boolean;
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
  const eventId = nonEmptyString(value.eventId);
  const rank = value.rank;
  if (eventId && typeof rank === 'number' && Number.isInteger(rank) && rank >= 1) return { rank, eventId };
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
  const tiebreaks = planTiebreaks(plan);
  const byId = new Map(games.map((g) => [g.id, g]));
  const resolved = new Map<string, StateGame>();
  const standings = new Map<string, Standings>();
  const standingsVisiting = new Set<string>();

  // An event's standings, from its games as they are worked out. Null while
  // they are being worked out, for a plan that loops back on itself.
  function standingsOf(eventId: string, visiting: Set<string>): Standings | null {
    const done = standings.get(eventId);
    if (done) return done;
    if (standingsVisiting.has(eventId)) return null;
    standingsVisiting.add(eventId);
    const played = games
      .filter((g) => g.eventId === eventId)
      .map((g) => resolve(g.id, visiting));
    const result = rankTeams(played, tiebreaks.get(eventId) ?? []);
    standingsVisiting.delete(eventId);
    standings.set(eventId, result);
    return result;
  }

  function teamFor(side: Side, visiting: Set<string>): StateTeam | null {
    if (side === null) return null;
    if ('teamId' in side) {
      const name = teams.get(side.teamId);
      return name === undefined ? null : { teamId: side.teamId, name };
    }
    if ('rank' in side) {
      // A place is only known once the event is over, and not shared.
      const table = standingsOf(side.eventId, visiting);
      const row = table?.complete ? table.rows.find((r) => r.place === side.rank && !r.tied) : undefined;
      return row ? (row.teamId !== undefined ? { teamId: row.teamId, name: row.name } : { name: row.name }) : null;
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
    events: resolveEvents(plan, games, resolved, (eventId) => standingsOf(eventId, new Set())),
  };
}

interface Standings {
  rows: StandingRow[];
  complete: boolean;
}

/** The order the coordinator gave each event's teams to break ties that
 *  the games do not, such as by a last stone draw. */
function planTiebreaks(plan: Data): Map<string, string[]> {
  const tiebreaks = new Map<string, string[]>();
  if (!Array.isArray(plan.events)) return tiebreaks;
  for (const event of plan.events) {
    if (!isData(event)) continue;
    const id = nonEmptyString(event.id);
    if (!id || !Array.isArray(event.tiebreak)) continue;
    tiebreaks.set(id, event.tiebreak.filter((t): t is string => typeof t === 'string'));
  }
  return tiebreaks;
}

const teamKey = (team: StateTeam) => team.teamId ?? `name:${team.name}`;

/**
 * Standings from an event's games. Teams are ordered by points, two for a
 * win and one for a tie. Teams level on points are ordered by the points
 * they took in the games between them, and teams still level by the order
 * the coordinator gave; any still level share their place.
 */
export function rankTeams(played: (StateGame | null)[], tiebreak: string[]): Standings {
  const rows = new Map<string, StandingRow>();
  const row = (team: StateTeam) => {
    const key = teamKey(team);
    let found = rows.get(key);
    if (!found) {
      found = {
        ...(team.teamId !== undefined && { teamId: team.teamId }),
        name: team.name,
        played: 0, wins: 0, losses: 0, ties: 0, points: 0, place: 0, tied: false,
      };
      rows.set(key, found);
    }
    return found;
  };
  // Who took how many points off whom, for breaking ties.
  const headToHead = new Map<string, number>();
  const finished: StateGame[] = [];

  for (const game of played) {
    if (game?.team1) row(game.team1);
    if (game?.team2) row(game.team2);
    if (game?.status !== 'final' || !game.team1 || !game.team2) continue;
    finished.push(game);
    const one = row(game.team1);
    const two = row(game.team2);
    one.played++;
    two.played++;
    const award = (to: StateTeam, against: StateTeam, points: number) => {
      const key = `${teamKey(to)}>${teamKey(against)}`;
      headToHead.set(key, (headToHead.get(key) ?? 0) + points);
    };
    if (game.winner) {
      const [winner, loser] = game.winner === 'team1' ? [one, two] : [two, one];
      const [winnerTeam, loserTeam] = game.winner === 'team1' ? [game.team1, game.team2] : [game.team2, game.team1];
      winner.wins++;
      winner.points += 2;
      loser.losses++;
      award(winnerTeam, loserTeam, 2);
    } else {
      one.ties++;
      two.ties++;
      one.points++;
      two.points++;
      award(game.team1, game.team2, 1);
      award(game.team2, game.team1, 1);
    }
  }

  const complete = played.length > 0 && played.every((g) => g?.status === 'final' && g.team1 && g.team2);
  const keyOf = (r: StandingRow) => teamKey(r);
  const pointsAgainst = (r: StandingRow, group: StandingRow[]) =>
    group.reduce((sum, other) => sum + (headToHead.get(`${keyOf(r)}>${keyOf(other)}`) ?? 0), 0);

  // Splits [group] into runs of teams that cannot be told apart by [measure],
  // best first.
  const splitBy = (group: StandingRow[], measure: (r: StandingRow) => number): StandingRow[][] => {
    const sorted = [...group].sort((a, b) => measure(b) - measure(a));
    const runs: StandingRow[][] = [];
    for (const r of sorted) {
      const last = runs[runs.length - 1];
      if (last && measure(last[0]) === measure(r)) last.push(r);
      else runs.push([r]);
    }
    return runs;
  };

  const order: StandingRow[][] = [];
  for (const level of splitBy([...rows.values()], (r) => r.points)) {
    for (const run of level.length > 1 ? splitBy(level, (r) => pointsAgainst(r, level)) : [level]) {
      if (run.length === 1) {
        order.push(run);
        continue;
      }
      // The coordinator's order: teams in it in that order, alone; the rest
      // still level, after them.
      const ranked = run
        .filter((r) => r.teamId !== undefined && tiebreak.includes(r.teamId))
        .sort((a, b) => tiebreak.indexOf(a.teamId!) - tiebreak.indexOf(b.teamId!));
      for (const r of ranked) order.push([r]);
      const rest = run.filter((r) => !ranked.includes(r));
      if (rest.length > 0) order.push(rest);
    }
  }

  let place = 1;
  const ordered: StandingRow[] = [];
  for (const run of order) {
    for (const r of [...run].sort((a, b) => a.name.localeCompare(b.name))) {
      ordered.push({ ...r, place, tied: run.length > 1 });
    }
    place += run.length;
  }
  return { rows: ordered, complete };
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
  standingsOf: (eventId: string) => Standings | null,
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
    // An event with no single final, a round robin, is decided by its
    // standings.
    if (finals.length > 1) {
      const table = standingsOf(eventId);
      if (table) {
        state.standings = table.rows;
        state.complete = table.complete;
      }
    }
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

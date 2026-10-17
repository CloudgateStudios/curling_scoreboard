import type {
  Bonspiel, BonspielDraw, BonspielEvent, BonspielGame, BonspielSide, BonspielTeam, TeamSlot,
} from '../types';

/** The most ends a game can be set to, as the rules allow. */
export const MAX_ENDS = 12;

/** A new random ID for anything inside a bonspiel. */
export function newBonspielId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Orders names the way a person would: ignoring case, and with numbers by
 *  value, so "Sheet 2" comes before "Sheet 10". */
export function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || a.localeCompare(b);
}

/** Today's date in the browser's time zone, as `YYYY-MM-DD`. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A bonspiel with one event and nothing else, ready to be planned. */
export function newBonspiel(name: string, date: string): Omit<Bonspiel, 'id'> {
  return {
    name: name.trim(),
    active: true,
    startDate: date,
    endDate: date,
    numberOfEnds: 8,
    events: [{ id: newBonspielId(), name: 'A Event' }],
    teams: [],
    draws: [],
    games: [],
  };
}

const isData = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const wholeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

function sideFrom(value: unknown): BonspielSide {
  if (!isData(value)) return null;
  if (str(value.teamId)) return { teamId: str(value.teamId) };
  if (str(value.eventId) && wholeNumber(value.rank)) return { rank: wholeNumber(value.rank)!, eventId: str(value.eventId) };
  if (str(value.from) && (value.result === 'winner' || value.result === 'loser')) {
    return { from: str(value.from), result: value.result };
  }
  return null;
}

function list<T>(value: unknown, read: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = isData(item) ? read(item) : null;
    return entry ? [entry] : [];
  });
}

/** Reads a bonspiel's plan defensively: it may have been written by an older
 *  portal or by hand. Entries with no ID are dropped, since nothing can
 *  refer to them. */
export function bonspielFrom(id: string, data: Record<string, unknown>): Bonspiel {
  return {
    id,
    name: str(data.name),
    active: data.active !== false,
    startDate: str(data.startDate),
    endDate: str(data.endDate),
    numberOfEnds: wholeNumber(data.numberOfEnds) ?? 8,
    events: list(data.events, (e) => (str(e.id)
      ? {
        id: str(e.id),
        name: str(e.name),
        ...(wholeNumber(e.numberOfEnds) ? { numberOfEnds: wholeNumber(e.numberOfEnds) } : {}),
        ...(Array.isArray(e.tiebreak) ? { tiebreak: e.tiebreak.filter((t): t is string => typeof t === 'string') } : {}),
      }
      : null)),
    teams: list(data.teams, (t) => (str(t.id)
      ? { id: str(t.id), name: str(t.name), ...(str(t.externalId) ? { externalId: str(t.externalId) } : {}) }
      : null)),
    draws: list(data.draws, (d) => (str(d.id) ? { id: str(d.id), label: str(d.label), start: str(d.start) } : null)),
    games: list(data.games, (g) => {
      if (!str(g.id)) return null;
      const game: BonspielGame = {
        id: str(g.id),
        label: str(g.label),
        drawId: str(g.drawId),
        sheetId: str(g.sheetId),
        eventId: str(g.eventId),
        team1: sideFrom(g.team1),
        team2: sideFrom(g.team2),
      };
      const result = g.result;
      if (isData(result) && (result.winner === 'team1' || result.winner === 'team2')) {
        game.result = {
          winner: result.winner,
          ...(wholeNumber(result.team1Score) !== undefined ? { team1Score: wholeNumber(result.team1Score) } : {}),
          ...(wholeNumber(result.team2Score) !== undefined ? { team2Score: wholeNumber(result.team2Score) } : {}),
        };
      }
      return game;
    }),
  };
}

/** Draws in the order they are played. */
export function sortedDraws(draws: BonspielDraw[]): BonspielDraw[] {
  return [...draws].sort((a, b) => a.start.localeCompare(b.start) || compareNatural(a.label, b.label));
}

/** The fields stored for a bonspiel. Firestore rejects undefined, so
 *  optional values that are not set are left out. Draws are kept in the
 *  order they are played, and games in draw order. */
export function bonspielData(bonspiel: Omit<Bonspiel, 'id'>): Record<string, unknown> {
  const draws = sortedDraws(bonspiel.draws);
  const drawOrder = new Map(draws.map((d, i) => [d.id, i]));
  const games = [...bonspiel.games].sort(
    (a, b) => (drawOrder.get(a.drawId) ?? 0) - (drawOrder.get(b.drawId) ?? 0) || compareNatural(a.label, b.label),
  );
  return {
    name: bonspiel.name.trim(),
    active: bonspiel.active,
    startDate: bonspiel.startDate,
    endDate: bonspiel.endDate,
    numberOfEnds: bonspiel.numberOfEnds,
    events: bonspiel.events.map((e) => ({
      id: e.id,
      name: e.name.trim(),
      ...(e.numberOfEnds ? { numberOfEnds: e.numberOfEnds } : {}),
      ...(e.tiebreak?.length ? { tiebreak: e.tiebreak } : {}),
    })),
    teams: bonspiel.teams.map((t) => ({
      id: t.id,
      name: t.name.trim(),
      ...(t.externalId ? { externalId: t.externalId } : {}),
    })),
    draws: draws.map((d) => ({ id: d.id, label: d.label.trim(), start: d.start })),
    games: games.map((g) => ({
      id: g.id,
      label: g.label.trim(),
      drawId: g.drawId,
      sheetId: g.sheetId,
      eventId: g.eventId,
      team1: g.team1,
      team2: g.team2,
      ...(g.result
        ? {
          result: {
            winner: g.result.winner,
            ...(g.result.team1Score !== undefined ? { team1Score: g.result.team1Score } : {}),
            ...(g.result.team2Score !== undefined ? { team2Score: g.result.team2Score } : {}),
          },
        }
        : {}),
    })),
  };
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** A `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` value as a Date in the browser's time
 *  zone, or null when it is not one. */
function localDate(value: string): Date | null {
  const match = DATE_TIME.exec(value) ?? DATE.exec(value);
  if (!match) return null;
  const [, y, mo, d, h = '0', mi = '0'] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  // Rejects dates like February 30th, which Date would roll over.
  return date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d) ? date : null;
}

function dateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** [start] moved on by [minutes]. */
export function addMinutes(start: string, minutes: number): string {
  const date = localDate(start);
  if (!date) return start;
  date.setMinutes(date.getMinutes() + minutes);
  return dateTimeString(date);
}

/** [date], with or without a time, moved on by [days]. */
export function addDays(date: string, days: number): string {
  const parsed = localDate(date);
  if (!parsed) return date;
  parsed.setDate(parsed.getDate() + days);
  return date.includes('T') ? dateTimeString(parsed) : today(parsed);
}

/** Whole days from one `YYYY-MM-DD` date to another. */
export function daysBetween(from: string, to: string): number {
  const a = localDate(from);
  const b = localDate(to);
  if (!a || !b) return 0;
  // Noon on each day, so a change of clocks in between cannot round it off.
  a.setHours(12);
  b.setHours(12);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** How long a draw usually takes, from one start to the next. */
export const DRAW_INTERVAL_MINUTES = 150;

/** When a new draw most likely starts: a draw's length after the last, or
 *  the morning of the first day when there are none. */
export function nextDrawStart(bonspiel: Pick<Bonspiel, 'draws' | 'startDate'>): string {
  const draws = sortedDraws(bonspiel.draws);
  const last = draws[draws.length - 1];
  if (last && localDate(last.start)) return addMinutes(last.start, DRAW_INTERVAL_MINUTES);
  return `${bonspiel.startDate || today()}T09:00`;
}

/** "Fri, Nov 6, 7:00 PM". */
export function formatDrawStart(start: string): string {
  const date = localDate(start);
  if (!date) return 'No time set';
  return date.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** "Nov 6 – 8, 2026", or the one day. */
export function formatDates(startDate: string, endDate: string): string {
  const start = localDate(startDate);
  const end = localDate(endDate);
  if (!start || !end) return 'No dates';
  const day = { month: 'short', day: 'numeric' } as const;
  if (startDate === endDate) return start.toLocaleDateString(undefined, { ...day, year: 'numeric' });
  return `${start.toLocaleDateString(undefined, day)} – ${end.toLocaleDateString(undefined, { ...day, year: 'numeric' })}`;
}

/**
 * A copy of [bonspiel] to run again: the same events, draws and games, moved
 * to start on [startDate], with no teams placed and no results. The teams
 * themselves are left behind, since they change from one year to the next.
 */
export function duplicateBonspiel(bonspiel: Bonspiel, name: string, startDate: string): Omit<Bonspiel, 'id'> {
  const days = daysBetween(bonspiel.startDate, startDate);
  const unplaced = (side: BonspielSide): BonspielSide => (side && 'teamId' in side ? null : side);
  return {
    name: name.trim(),
    active: true,
    startDate,
    endDate: addDays(bonspiel.endDate, days),
    numberOfEnds: bonspiel.numberOfEnds,
    // Who won last year's ties has nothing to say about this year's.
    events: bonspiel.events.map(({ tiebreak: _tiebreak, ...e }) => ({ ...e })),
    teams: [],
    draws: bonspiel.draws.map((d) => ({ ...d, start: addDays(d.start, days) })),
    games: bonspiel.games.map(({ result: _result, ...g }) => ({
      ...g,
      team1: unplaced(g.team1),
      team2: unplaced(g.team2),
    })),
  };
}

/** "Smith", "Winner of A3", "Loser of A3", "Pool A #1", or "To be decided". */
export function describeSide(
  side: BonspielSide,
  bonspiel: Pick<Bonspiel, 'teams' | 'games'> & Partial<Pick<Bonspiel, 'events'>>,
): string {
  if (side === null) return 'To be decided';
  if ('teamId' in side) return bonspiel.teams.find((t) => t.id === side.teamId)?.name || 'Removed team';
  if ('rank' in side) {
    const event = bonspiel.events?.find((e) => e.id === side.eventId)?.name || 'A removed event';
    return `${event} #${side.rank}`;
  }
  const label = bonspiel.games.find((g) => g.id === side.from)?.label || 'a removed game';
  return `${side.result === 'winner' ? 'Winner' : 'Loser'} of ${label}`;
}

/** A label for the next game in [eventId]: its first letter and the next
 *  number free, so "A1", "A2" in the A Event. */
export function suggestedGameLabel(bonspiel: Pick<Bonspiel, 'events' | 'games'>, eventId: string): string {
  const event = bonspiel.events.find((e) => e.id === eventId);
  const prefix = event?.name.trim().charAt(0).toUpperCase() || 'G';
  const taken = new Set(bonspiel.games.map((g) => g.label.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    if (!taken.has(`${prefix}${n}`.toLowerCase())) return `${prefix}${n}`;
  }
}

/** The games a side of [game] can come from: those in draws before its own. */
export function earlierGames(bonspiel: Pick<Bonspiel, 'draws' | 'games'>, game: Pick<BonspielGame, 'id' | 'drawId'>): BonspielGame[] {
  const start = bonspiel.draws.find((d) => d.id === game.drawId)?.start;
  if (!start) return [];
  const startOf = new Map(bonspiel.draws.map((d) => [d.id, d.start]));
  return bonspiel.games
    .filter((g) => g.id !== game.id && (startOf.get(g.drawId) ?? '') < start)
    .sort((a, b) => compareNatural(a.label, b.label));
}

/** The teams placed in other games of [drawId], which cannot play twice. */
export function teamsPlacedInDraw(bonspiel: Pick<Bonspiel, 'games'>, drawId: string, exceptGameId?: string): Set<string> {
  const placed = new Set<string>();
  for (const game of bonspiel.games) {
    if (game.drawId !== drawId || game.id === exceptGameId) continue;
    for (const side of [game.team1, game.team2]) {
      if (side && 'teamId' in side) placed.add(side.teamId);
    }
  }
  return placed;
}

/** Team names pasted one to a line, without blanks or repeats. */
export function parseTeamNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

function duplicateName<T>(items: T[], name: (item: T) => string): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    const key = name(item).trim().toLowerCase();
    if (seen.has(key)) return name(item).trim();
    seen.add(key);
  }
  return null;
}

const validEnds = (ends: number) => Number.isInteger(ends) && ends >= 1 && ends <= MAX_ENDS;

/**
 * What is wrong with a bonspiel as planned, each in a sentence. It can be
 * saved when there is nothing. [sheetIds] are the club's sheets, which the
 * games have to be on.
 */
export function bonspielProblems(bonspiel: Omit<Bonspiel, 'id'>, sheetIds: Set<string>): string[] {
  const problems: string[] = [];
  const add = (problem: string) => problems.push(problem);

  if (!bonspiel.name.trim()) add('Give the bonspiel a name.');
  if (!localDate(bonspiel.startDate) || !localDate(bonspiel.endDate)) add('Give the bonspiel a start and an end date.');
  else if (bonspiel.endDate < bonspiel.startDate) add('The bonspiel ends before it starts.');
  if (!validEnds(bonspiel.numberOfEnds)) add(`Games have to be 1 to ${MAX_ENDS} ends.`);

  checkNames(bonspiel.events, 'event', add);
  for (const event of bonspiel.events) {
    if (event.numberOfEnds !== undefined && !validEnds(event.numberOfEnds)) {
      add(`${event.name || 'An event'}'s games have to be 1 to ${MAX_ENDS} ends.`);
    }
  }
  checkNames(bonspiel.teams, 'team', add);

  const draws = new Map<string, BonspielDraw>();
  for (const draw of bonspiel.draws) {
    draws.set(draw.id, draw);
    const name = draw.label.trim() || 'A draw';
    if (!draw.label.trim()) add('Every draw needs a name.');
    if (!localDate(draw.start)) add(`${name} needs a start time.`);
    else if (localDate(bonspiel.startDate) && localDate(bonspiel.endDate)
      && (draw.start.slice(0, 10) < bonspiel.startDate || draw.start.slice(0, 10) > bonspiel.endDate)) {
      add(`${name} is outside the bonspiel's dates.`);
    }
  }
  const sameLabel = duplicateName(bonspiel.draws.filter((d) => d.label.trim()), (d) => d.label);
  if (sameLabel) add(`Two draws are called "${sameLabel}".`);

  checkGames(bonspiel, draws, sheetIds, add);
  return problems;
}

function checkNames(
  items: (BonspielEvent | BonspielTeam)[],
  kind: 'event' | 'team',
  add: (problem: string) => void,
) {
  if (items.some((i) => !i.name.trim())) add(`Every ${kind} needs a name.`);
  const same = duplicateName(items.filter((i) => i.name.trim()), (i) => i.name);
  if (same) add(`Two ${kind}s are called "${same}".`);
}

function checkGames(
  bonspiel: Omit<Bonspiel, 'id'>,
  draws: Map<string, BonspielDraw>,
  sheetIds: Set<string>,
  add: (problem: string) => void,
) {
  const games = new Map(bonspiel.games.map((g) => [g.id, g]));
  const events = new Set(bonspiel.events.map((e) => e.id));
  const teams = new Set(bonspiel.teams.map((t) => t.id));
  const onSheet = new Map<string, string>();
  const placedInDraw = new Map<string, string>();
  const goesOn = new Map<string, string>();

  if (bonspiel.games.some((g) => !g.label.trim())) add('Every game needs a name.');
  const same = duplicateName(bonspiel.games.filter((g) => g.label.trim()), (g) => g.label);
  if (same) add(`Two games are called "${same}".`);

  for (const game of bonspiel.games) {
    const name = game.label.trim() || 'A game';
    const draw = draws.get(game.drawId);
    if (!draw) add(`${name} is not in a draw.`);
    if (!events.has(game.eventId)) add(`${name} is not in an event.`);
    if (!sheetIds.has(game.sheetId)) add(`${name} is on a sheet the club no longer has.`);

    const slot = `${game.drawId}/${game.sheetId}`;
    const other = onSheet.get(slot);
    if (other !== undefined) add(`${other} and ${name} are on the same sheet in the same draw.`);
    else onSheet.set(slot, name);

    const sides: [TeamSlot, BonspielSide][] = [['team1', game.team1], ['team2', game.team2]];
    for (const [, side] of sides) {
      if (side === null) continue;
      if ('teamId' in side) {
        if (!teams.has(side.teamId)) {
          add(`${name} has a team that has been removed.`);
          continue;
        }
        const key = `${game.drawId}/${side.teamId}`;
        const elsewhere = placedInDraw.get(key);
        const team = bonspiel.teams.find((t) => t.id === side.teamId)!.name.trim();
        // The same team twice in one game is said once, below.
        if (elsewhere !== undefined && elsewhere !== game.id) {
          add(`${team} is in both ${games.get(elsewhere)?.label.trim() || 'a game'} and ${name}, in the same draw.`);
        } else placedInDraw.set(key, game.id);
        continue;
      }
      if ('rank' in side) {
        checkPlace(bonspiel, game, name, side, draws, add, goesOn);
        continue;
      }
      const source = games.get(side.from);
      if (!source) {
        add(`${name} comes from a game that has been removed.`);
        continue;
      }
      const sourceStart = draws.get(source.drawId)?.start;
      if (draw && sourceStart !== undefined && sourceStart >= draw.start) {
        add(`${name} comes from ${source.label.trim() || 'a game'}, which is not in an earlier draw.`);
      }
      const key = `${side.from}/${side.result}`;
      const taken = goesOn.get(key);
      const who = `The ${side.result} of ${source.label.trim() || 'a game'}`;
      if (taken !== undefined) add(`${who} goes to both ${taken} and ${name}.`);
      else goesOn.set(key, name);
    }
    if (game.team1 && game.team2 && JSON.stringify(game.team1) === JSON.stringify(game.team2)) {
      add(`${name} has the same team on both sides.`);
    }
  }
}

// A side that is a place in an event's standings: the event has to be
// another one, played out in earlier draws, and each place goes to one game.
function checkPlace(
  bonspiel: Omit<Bonspiel, 'id'>,
  game: BonspielGame,
  name: string,
  side: { rank: number; eventId: string },
  draws: Map<string, BonspielDraw>,
  add: (problem: string) => void,
  goesOn: Map<string, string>,
) {
  const event = bonspiel.events.find((e) => e.id === side.eventId);
  if (!event) {
    add(`${name} comes from an event that has been removed.`);
    return;
  }
  const eventName = event.name.trim() || 'an event';
  if (event.id === game.eventId) {
    add(`${name} comes from the standings of its own event.`);
    return;
  }
  const start = draws.get(game.drawId)?.start;
  const late = bonspiel.games.some((g) => g.eventId === event.id && (draws.get(g.drawId)?.start ?? '') >= (start ?? ''));
  if (start !== undefined && late) add(`${name} comes from ${eventName}'s standings, but ${eventName} still has games in its draw or later.`);
  const key = `${event.id}#${side.rank}`;
  const taken = goesOn.get(key);
  if (taken !== undefined) add(`${eventName} #${side.rank} goes to both ${taken} and ${name}.`);
  else goesOn.set(key, name);
}

/** [bonspiel] without the games in [gameIds]. Sides that came from them are
 *  left to be decided, so nothing refers to a game that is gone. */
export function withoutGames<T extends Pick<Bonspiel, 'games'>>(bonspiel: T, gameIds: Set<string>): T {
  const clear = (side: BonspielSide): BonspielSide => (side && 'from' in side && gameIds.has(side.from) ? null : side);
  return {
    ...bonspiel,
    games: bonspiel.games
      .filter((g) => !gameIds.has(g.id))
      .map((g) => ({ ...g, team1: clear(g.team1), team2: clear(g.team2) })),
  };
}

/** [bonspiel] without the team [teamId], taken out of any game it was placed
 *  in. */
export function withoutTeam<T extends Pick<Bonspiel, 'games' | 'teams'>>(bonspiel: T, teamId: string): T {
  const clear = (side: BonspielSide): BonspielSide => (side && 'teamId' in side && side.teamId === teamId ? null : side);
  return {
    ...bonspiel,
    teams: bonspiel.teams.filter((t) => t.id !== teamId),
    games: bonspiel.games.map((g) => ({ ...g, team1: clear(g.team1), team2: clear(g.team2) })),
  };
}

/** How many games [teamId] is placed in. */
export function gamesPlacing(bonspiel: Pick<Bonspiel, 'games'>, teamId: string): number {
  return bonspiel.games.filter((g) =>
    [g.team1, g.team2].some((side) => side && 'teamId' in side && side.teamId === teamId)).length;
}

/**
 * An event's games as the rounds of a bracket, first round first, ending with
 * its final. A game's round is one more than the latest of the games in the
 * event its winners come from; teams dropping in from other events start a
 * game in whichever round that puts it. Within a round, games are in the
 * order the bracket draws them, so each pair feeding one game sits together.
 */
export function bracketRounds(bonspiel: Pick<Bonspiel, 'games'>, eventId: string): BonspielGame[][] {
  const games = bonspiel.games.filter((g) => g.eventId === eventId);
  const byId = new Map(games.map((g) => [g.id, g]));
  const feeders = (game: BonspielGame) =>
    [game.team1, game.team2].flatMap((side) =>
      side && 'from' in side && side.result === 'winner' && byId.has(side.from) ? [byId.get(side.from)!] : []);

  const roundOf = new Map<string, number>();
  const round = (game: BonspielGame, visiting = new Set<string>()): number => {
    const known = roundOf.get(game.id);
    if (known !== undefined) return known;
    // A loop the portal's checks would not let be saved, but drawn anyway.
    if (visiting.has(game.id)) return 0;
    visiting.add(game.id);
    const value = Math.max(-1, ...feeders(game).map((f) => round(f, visiting))) + 1;
    roundOf.set(game.id, value);
    return value;
  };

  // Ordered from the finals back, so games feeding the same one are listed
  // together; any game no final leads to comes after.
  const fedOn = new Set(games.flatMap((g) => feeders(g).map((f) => f.id)));
  const order: BonspielGame[] = [];
  const seen = new Set<string>();
  const visit = (game: BonspielGame) => {
    if (seen.has(game.id)) return;
    seen.add(game.id);
    for (const feeder of feeders(game)) visit(feeder);
    order.push(game);
  };
  games.filter((g) => !fedOn.has(g.id)).forEach(visit);
  games.forEach(visit);

  const rounds: BonspielGame[][] = [];
  for (const game of order) {
    const r = round(game);
    (rounds[r] ??= []).push(game);
  }
  return rounds.filter((r) => r !== undefined);
}

/** Whether [eventId] is a pool: an event with games but no single final,
 *  such as a round robin, which its standings decide. Mirrors how the
 *  functions tell the two apart. */
export function isPool(bonspiel: Pick<Bonspiel, 'games'>, eventId: string): boolean {
  const games = bonspiel.games.filter((g) => g.eventId === eventId);
  const sentOn = new Set(games.flatMap((g) => [g.team1, g.team2])
    .flatMap((side) => (side && 'from' in side && side.result === 'winner' ? [side.from] : [])));
  return games.filter((g) => !sentOn.has(g.id)).length > 1;
}

/** [order] of a tie's teams put into an event's tiebreak, replacing where
 *  any of them stood before. */
export function withTiebreak(tiebreak: string[] | undefined, order: string[]): string[] {
  return [...(tiebreak ?? []).filter((id) => !order.includes(id)), ...order];
}

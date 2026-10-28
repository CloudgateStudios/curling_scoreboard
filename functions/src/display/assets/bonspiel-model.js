// What the bonspiel display works out from a bonspiel's plan and state: the
// draw on now, who is in each game, and each event as a bracket. Nothing
// here touches the page or Firebase, so the emulator tests can run it.
//
// The plan is clubs/{clubId}/bonspiels/{bonspielId} and the state its
// state/current, both described in docs/architecture/data-model.md and
// docs/architecture/bonspiels.md. The portal works the
// same things out in admin/src/lib/bonspiels.ts, and the scoreboard in
// app/lib/models/bonspiel.dart.

/** How long before a draw starts it is the one on, as on the scoreboard. */
export const DRAW_LEAD_MS = 30 * 60 * 1000;

const START = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** A draw's start, 'YYYY-MM-DDTHH:mm' in the club's local time, as a Date
 *  on this screen, which is at the club. Null when it is not one. */
export function drawStart(draw) {
  const match = START.exec(draw?.start ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

/** The plan's draws that have a start, in the order they are played. */
export function sortedDraws(plan) {
  return (plan?.draws ?? [])
    .filter((draw) => drawStart(draw))
    .sort((a, b) => drawStart(a) - drawStart(b));
}

/**
 * The draw on at [at]: the one starting next, from half an hour before it
 * starts until the same time before the draw after it. Before the first
 * draw, the first; null when there are no draws.
 */
export function currentDraw(plan, at) {
  const draws = sortedDraws(plan);
  let current = null;
  for (const draw of draws) {
    if (drawStart(draw).getTime() - DRAW_LEAD_MS <= at) current = draw;
  }
  return current ?? draws[0] ?? null;
}

/** The draw after [draw], or null after the last. */
export function nextDraw(plan, draw) {
  const draws = sortedDraws(plan);
  const index = draws.findIndex((d) => d.id === draw?.id);
  return index >= 0 ? draws[index + 1] ?? null : null;
}

export function gamesIn(plan, draw) {
  return (plan?.games ?? []).filter((game) => game.drawId === draw?.id);
}

function gameById(plan, id) {
  return (plan?.games ?? []).find((game) => game.id === id);
}

/** "Winner of A3", "Loser of A3", "Pool A #1", or "To be decided". */
export function describeSide(plan, side) {
  if (side?.eventId && side.rank) {
    const event = (plan?.events ?? []).find((e) => e.id === side.eventId)?.name || 'An event';
    return `${event} #${side.rank}`;
  }
  if (side?.from) {
    const label = gameById(plan, side.from)?.label || 'a game';
    return `${side.result === 'loser' ? 'Loser' : 'Winner'} of ${label}`;
  }
  return 'To be decided';
}

/**
 * One side of a game: { name, known }. The team the functions worked out, or
 * the one the coordinator placed, or where it will come from until it is
 * known.
 */
export function sideOf(plan, state, game, slot) {
  const worked = state?.games?.[game.id]?.[slot];
  if (worked?.name) return { name: worked.name, known: true };
  const side = game[slot];
  if (side?.teamId) {
    const team = (plan?.teams ?? []).find((t) => t.id === side.teamId);
    if (team) return { name: team.name, known: true };
  }
  return { name: describeSide(plan, side), known: false };
}

/** How a game went, once it has a result: { team1Score, team2Score, winner,
 *  tied }, scores being absent when nobody gave them. Null before then. */
export function resultOf(state, game) {
  const worked = state?.games?.[game.id];
  if (worked?.status !== 'final') return null;
  return {
    team1Score: worked.team1Score,
    team2Score: worked.team2Score,
    winner: worked.winner ?? null,
    tied: worked.tied === true,
  };
}

/**
 * An event's games as the rounds of a bracket, first round first, ending
 * with its final. A game's round is one past the latest game in the event
 * its winners come from, and games feeding one game sit together. Mirrors
 * bracketRounds in admin/src/lib/bonspiels.ts.
 */
export function bracketRounds(plan, eventId) {
  const games = (plan?.games ?? []).filter((game) => game.eventId === eventId);
  const byId = new Map(games.map((game) => [game.id, game]));
  const feeders = (game) => [game.team1, game.team2]
    .filter((side) => side?.from && side.result === 'winner' && byId.has(side.from))
    .map((side) => byId.get(side.from));

  const roundOf = new Map();
  const round = (game, visiting = new Set()) => {
    if (roundOf.has(game.id)) return roundOf.get(game.id);
    if (visiting.has(game.id)) return 0;
    visiting.add(game.id);
    const value = Math.max(-1, ...feeders(game).map((feeder) => round(feeder, visiting))) + 1;
    roundOf.set(game.id, value);
    return value;
  };

  const fedOn = new Set(games.flatMap((game) => feeders(game).map((feeder) => feeder.id)));
  const order = [];
  const seen = new Set();
  const visit = (game) => {
    if (seen.has(game.id)) return;
    seen.add(game.id);
    for (const feeder of feeders(game)) visit(feeder);
    order.push(game);
  };
  games.filter((game) => !fedOn.has(game.id)).forEach(visit);
  games.forEach(visit);

  const rounds = [];
  for (const game of order) (rounds[round(game)] ??= []).push(game);
  return rounds.filter(Boolean);
}

/** Whether an event is a pool: games but no single final, so its standings
 *  decide it. Mirrors isPool in admin/src/lib/bonspiels.ts. */
export function isPool(plan, eventId) {
  const games = (plan?.games ?? []).filter((game) => game.eventId === eventId);
  const sentOn = new Set(games.flatMap((game) => [game.team1, game.team2])
    .filter((side) => side?.from && side.result === 'winner')
    .map((side) => side.from));
  return games.filter((game) => !sentOn.has(game.id)).length > 1;
}

/** The events that have games, in the plan's order. */
export function eventsWithGames(plan) {
  const used = new Set((plan?.games ?? []).map((game) => game.eventId));
  return (plan?.events ?? []).filter((event) => used.has(event.id));
}

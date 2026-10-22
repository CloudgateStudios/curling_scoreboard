// What the warm room's list of earlier results works out from the summary's
// results: the games finished today, grouped by the draw they were played
// in. Nothing here touches the page or Firebase, so the emulator tests can
// run it.
//
// The screen is at the club, so its clock is on the club's time, which is
// what a league's draws are written in.

/** Games finished before this hour count as the day before, so a late draw
 *  that runs past midnight stays with its evening. */
export const DAY_STARTS_AT_HOUR = 4;
/** How long before a draw starts a game is in it, as on the scoreboard. */
export const DRAW_LEAD_MS = 30 * 60 * 1000;
/** A game with no league draw to go by joins a draw that started up to this
 *  long before it. Draws are a couple of hours apart, so this is plenty. */
export const SAME_DRAW_MS = 45 * 60 * 1000;
/** A draw found only from when its games started is named to this. */
const ROUND_TO_MS = 15 * 60 * 1000;

const TIME = /^(\d{2}):(\d{2})$/;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function millisOf(timestamp) {
  return typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : null;
}

/** When the club's day that [at] falls in began. */
export function dayStart(at) {
  const start = new Date(at);
  start.setHours(DAY_STARTS_AT_HOUR, 0, 0, 0);
  if (start.getTime() > at) start.setDate(start.getDate() - 1);
  return start.getTime();
}

// [hhmm] on the day of [day], a Date at local midnight.
function onDay(day, hhmm) {
  const match = TIME.exec(hhmm ?? '');
  if (!match) return null;
  const at = new Date(day);
  at.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return at;
}

/**
 * When the league draw that a game started at [startedAt] was in was due to
 * start, or null when none of [draws] fits: one on that weekday that starts
 * no more than half an hour after the game did and had not yet ended.
 */
export function scheduledStart(draws, startedAt) {
  const midnight = new Date(startedAt);
  midnight.setHours(0, 0, 0, 0);
  // Monday is 1 and Sunday 7, as the leagues have it.
  const weekday = ((midnight.getDay() + 6) % 7) + 1;
  for (const draw of draws ?? []) {
    if (draw?.day !== weekday) continue;
    const start = onDay(midnight, draw.start);
    const end = onDay(midnight, draw.end);
    if (!start || !end) continue;
    // A draw that ends after midnight.
    if (end <= start) end.setDate(end.getDate() + 1);
    if (startedAt >= start.getTime() - DRAW_LEAD_MS && startedAt <= end.getTime()) return start.getTime();
  }
  return null;
}

/**
 * Today's results as of [now], a draw at a time, the latest draw first:
 * [{ start, names, results }], where start is when the draw was due to
 * start, in milliseconds, names the leagues and bonspiels in it, and results
 * its games by sheet.
 *
 * A league game goes under the draw its league has at that time. Any other
 * game, or a league game outside its league's draws, joins the draw it
 * started in if there is one, and otherwise the games that started near it,
 * named for the first of them to the quarter hour.
 */
export function todaysDraws(results, now) {
  const from = dayStart(now);
  const games = (Array.isArray(results) ? results : []).flatMap((result) => {
    const finishedAt = millisOf(result?.finishedAt);
    if (finishedAt === null || finishedAt < from || finishedAt > now) return [];
    const startedAt = millisOf(result.startedAt) ?? finishedAt;
    return [{ result, startedAt, draw: scheduledStart(result.league?.draws, startedAt) }];
  });

  const scheduled = [...new Set(games.map((game) => game.draw).filter((draw) => draw !== null))];
  let found = null;
  for (const game of games.filter((g) => g.draw === null).sort((a, b) => a.startedAt - b.startedAt)) {
    const near = scheduled.find((start) => game.startedAt >= start - DRAW_LEAD_MS
      && game.startedAt <= start + SAME_DRAW_MS);
    if (near !== undefined) {
      game.draw = near;
    } else {
      if (!found || game.startedAt - found.first > SAME_DRAW_MS) {
        found = { first: game.startedAt, start: Math.round(game.startedAt / ROUND_TO_MS) * ROUND_TO_MS };
      }
      game.draw = found.start;
    }
  }

  const draws = new Map();
  for (const game of games) {
    if (!draws.has(game.draw)) draws.set(game.draw, []);
    draws.get(game.draw).push(game.result);
  }
  return [...draws.entries()]
    .sort(([a], [b]) => b - a)
    .map(([start, inDraw]) => {
      const sorted = inDraw.sort((a, b) => collator.compare(a.sheetName ?? '', b.sheetName ?? ''));
      const names = [...new Set(sorted.map((r) => r.league?.name ?? r.bonspiel?.name).filter(Boolean))];
      return { start, names, results: sorted };
    });
}

/** The winning team's slot, or null for a tie. */
export function winnerOf(result) {
  if (result.team1.score === result.team2.score) return null;
  return result.team1.score > result.team2.score ? 'team1' : 'team2';
}

/** True when the game ended before or after its ends: short, or extra ends. */
export function endedOffSchedule(result) {
  return result.endsPlayed > 0 && typeof result.numberOfEnds === 'number'
    && result.endsPlayed !== result.numberOfEnds;
}

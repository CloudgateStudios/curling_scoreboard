import { addMinutes, newBonspielId } from './bonspiels.ts';
import type { Bonspiel, BonspielDraw, BonspielEvent, BonspielGame, BonspielSide, BonspielTeam } from '../types';

/**
 * How the losers of an event's games move on:
 *
 * - byRound: the losers of each round of the A event drop to the next
 *   event, so A round 1's losers make up the B event, round 2's the C event,
 *   and so on. A loss in any other event ends a team's bonspiel. The usual
 *   club format.
 * - dropOne: a loss in any event drops a team to the next one, A to B and B
 *   to C, and a loss in the last ends it. The triple knockout of the tour.
 *
 * Either way, the loser of an event's final is its runner up, and goes
 * nowhere.
 */
export type LoserRule = 'byRound' | 'dropOne';

export interface KnockoutOptions extends ScheduleOptions {
  /** How many teams start in the A event. */
  teams: number;
  /** 1 to 4: A, B, C and D. */
  events: number;
  losers: LoserRule;
}

/** Where and when a template's games are played. */
export interface ScheduleOptions {
  /** The sheets to play on, in the order games fill them. */
  sheetIds: string[];
  /** `YYYY-MM-DDTHH:mm` */
  firstDrawStart: string;
  /** `HH:mm`: when the first draw starts on each day after the first. */
  dayStart: string;
  /** `HH:mm`: the latest a draw can start before play moves to the next day. */
  lastDrawStart: string;
  minutesBetweenDraws: number;
  /** Keeps a team from playing two draws in a row, unless a draw would
   *  otherwise have no games at all. */
  drawOff: boolean;
}

export const MAX_TEMPLATE_TEAMS = 64;
export const MAX_TEMPLATE_EVENTS = 4;

/** A side of a game still to be placed in an event, and the first round it
 *  can be played in. Rounds count across the whole bonspiel, so the B
 *  event's first round is the A event's second. */
interface Slot {
  side: BonspielSide;
  round: number;
}

interface Built {
  game: BonspielGame;
  event: number;
  round: number;
  /** The teams in the game when the template knows them, a pool's members
   *  whether placed yet or not, so no team plays twice at once. */
  players?: string[];
}

const largestPowerOfTwo = (n: number) => 2 ** Math.floor(Math.log2(n));

/**
 * Builds one event as a knockout of [entrants], round by round. Teams that
 * arrive later, the losers of other events' later rounds, join as they come.
 * Once no more are coming, the first round with a number of teams that is
 * not a power of two plays only enough games to get there, and the rest have
 * a bye: the entrants listed first, the way the top seeds would. Byes then
 * meet the winners, so nobody has two byes.
 *
 * Returns the event's games in the order they are played, the last being
 * its final.
 */
function buildEvent(entrants: Slot[], event: number, newId: () => string): Built[] {
  const built: Built[] = [];
  let pending = [...entrants].sort((a, b) => a.round - b.round);
  let waiting: Slot[] = [];
  let round = pending[0]?.round ?? 1;

  for (;;) {
    const arriving = pending.filter((s) => s.round === round);
    pending = pending.filter((s) => s.round !== round);
    const available = [...waiting, ...arriving];
    if (pending.length === 0 && available.length <= 1) return built;

    let playing: number;
    if (pending.length === 0) {
      const target = largestPowerOfTwo(available.length);
      playing = available.length === target ? target / 2 : available.length - target;
    } else {
      playing = Math.floor(available.length / 2);
    }
    const byes = available.slice(0, available.length - playing * 2);
    const players = available.slice(byes.length);

    const winners: Slot[] = [];
    for (let i = 0; i < players.length; i += 2) {
      const game: BonspielGame = {
        id: newId(),
        label: '',
        drawId: '',
        sheetId: '',
        eventId: '',
        team1: players[i].side,
        team2: players[i + 1].side,
      };
      built.push({ game, event, round });
      winners.push({ side: { from: game.id, result: 'winner' }, round: round + 1 });
    }
    // Each bye meets a winner, rather than another bye.
    waiting = [];
    for (let i = 0; i < Math.max(byes.length, winners.length); i++) {
      if (byes[i]) waiting.push({ ...byes[i], round: round + 1 });
      if (winners[i]) waiting.push(winners[i]);
    }
    round++;
  }
}

/** The event a game's loser goes to, or null when a loss ends it. */
function loserEvent(rule: LoserRule, event: number, round: number, events: number): number | null {
  const next = rule === 'byRound' ? (event === 0 ? round : null) : event + 1;
  return next !== null && next < events ? next : null;
}

const EVENT_LETTERS = ['A', 'B', 'C', 'D'];

/**
 * The events, games and draws of a knockout bonspiel. The first [options.teams]
 * of [teams] are placed in the A event's first round in the order given,
 * first against second, third against fourth, with any byes going to those
 * listed first. With fewer teams than that, the rest of the first round is
 * left to be decided.
 */
export function knockoutPlan(
  teams: BonspielTeam[],
  options: KnockoutOptions,
  newId: () => string = newBonspielId,
): Pick<Bonspiel, 'events' | 'draws' | 'games'> {
  const eventCount = Math.min(Math.max(options.events, 1), MAX_TEMPLATE_EVENTS);
  const entrants: Slot[][] = Array.from({ length: eventCount }, () => []);
  for (let i = 0; i < options.teams; i++) {
    entrants[0].push({ side: teams[i] ? { teamId: teams[i].id } : null, round: 1 });
  }

  const events: BonspielEvent[] = [];
  const built: Built[] = [];
  for (let e = 0; e < eventCount; e++) {
    const games = buildEvent(entrants[e], e, newId);
    // An event no losers reach, or only one, is left out.
    if (games.length === 0) continue;
    const event: BonspielEvent = { id: newId(), name: `${EVENT_LETTERS[e]} Event` };
    events.push(event);
    const final = games[games.length - 1];
    games.forEach((b, i) => {
      b.game.eventId = event.id;
      b.game.label = b === final ? `${EVENT_LETTERS[e]} Final` : `${EVENT_LETTERS[e]}${i + 1}`;
      if (b === final) return;
      const to = loserEvent(options.losers, e, b.round, eventCount);
      if (to !== null) entrants[to].push({ side: { from: b.game.id, result: 'loser' }, round: b.round + 1 });
    });
    built.push(...games);
  }

  const draws = schedule(built, options, newId);
  return { events, draws, games: built.map((b) => b.game) };
}

/**
 * Places the games into draws, as many to a draw as there are sheets, those
 * whose teams have waited longest first. A game only goes in a draw after the
 * ones its teams come from, and with [KnockoutOptions.drawOff] not in the
 * draw right after them, unless that would leave the draw empty.
 */
function schedule(built: Built[], options: ScheduleOptions, newId: () => string): BonspielDraw[] {
  const sheets = options.sheetIds.length > 0 ? options.sheetIds : [''];
  const drawOf = new Map<string, number>();
  // A place in a pool's standings comes after every game in the pool.
  const inEvent = new Map<string, string[]>();
  for (const b of built) inEvent.set(b.game.eventId, [...(inEvent.get(b.game.eventId) ?? []), b.game.id]);
  const sources = (game: BonspielGame) =>
    [game.team1, game.team2].flatMap((side) => {
      if (side && 'from' in side) return [side.from];
      if (side && 'rank' in side) return inEvent.get(side.eventId) ?? [];
      return [];
    });
  let remaining = [...built].sort((a, b) => a.round - b.round || a.event - b.event);
  const draws: BonspielDraw[] = [];
  // The draw a game's teams are last busy in, so the games whose teams have
  // waited longest go first. Otherwise a big A event's later rounds would
  // keep the first round's losers waiting a day for their B game.
  // The last draw each known player played in.
  const playedIn = new Map<string, number>();
  const lastDraws = (b: Built) => [
    ...sources(b.game).map((id) => drawOf.get(id)!),
    ...(b.players ?? []).flatMap((p) => (playedIn.has(p) ? [playedIn.get(p)!] : [])),
  ];
  const freedAfter = (b: Built) => Math.max(-1, ...lastDraws(b));

  for (let d = 0; remaining.length > 0; d++) {
    const ready = remaining
      .filter((b) => sources(b.game).every((id) => (drawOf.get(id) ?? Infinity) < d))
      .sort((a, b) => freedAfter(a) - freedAfter(b) || a.round - b.round || a.event - b.event);
    const rested = options.drawOff ? ready.filter((b) => lastDraws(b).every((at) => at < d - 1)) : ready;
    const chosen: Built[] = [];
    const busy = new Set<string>();
    // Rested games first, then any others, never a player twice in a draw.
    for (const b of [...rested, ...(rested.length > 0 ? [] : ready)]) {
      if (chosen.length >= sheets.length) break;
      if ((b.players ?? []).some((p) => busy.has(p))) continue;
      chosen.push(b);
      for (const p of b.players ?? []) busy.add(p);
    }
    const draw: BonspielDraw = {
      id: newId(),
      label: `Draw ${d + 1}`,
      start: d === 0 ? options.firstDrawStart : nextStart(draws[d - 1].start, options),
    };
    draws.push(draw);
    chosen.forEach((b, i) => {
      b.game.drawId = draw.id;
      b.game.sheetId = sheets[i];
      drawOf.set(b.game.id, d);
      for (const p of b.players ?? []) playedIn.set(p, d);
    });
    remaining = remaining.filter((b) => !chosen.includes(b));
  }
  return draws;
}

/** When the draw after one starting at [start] starts: a draw's length later,
 *  or the next morning once that would be past the day's last draw. */
function nextStart(start: string, options: ScheduleOptions): string {
  const next = addMinutes(start, options.minutesBetweenDraws);
  if (next.slice(0, 10) === start.slice(0, 10) && next.slice(11) <= options.lastDrawStart) return next;
  const nextDay = addMinutes(`${start.slice(0, 10)}T12:00`, 24 * 60).slice(0, 10);
  return `${nextDay}T${options.dayStart}`;
}

export interface PoolsOptions extends ScheduleOptions {
  teams: number;
  /** How many pools the teams are split into, 1 to 8. */
  pools: number;
  /** How many from the top of each pool go on to the playoffs. None, with
   *  one pool, leaves its standings to decide it. */
  qualifiers: number;
}

export const MAX_POOLS = 8;

/** The order a round robin of [n] teams plays in: rounds of pairs, by
 *  index, each team once a round. With an odd number one sits out each
 *  round. The circle method: one team stays put and the rest turn. */
export function roundRobin(n: number): [number, number][][] {
  const ids = Array.from({ length: n % 2 === 0 ? n : n + 1 }, (_, i) => i);
  const rounds: [number, number][][] = [];
  for (let r = 0; r < ids.length - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < ids.length / 2; i++) {
      const a = ids[i];
      const b = ids[ids.length - 1 - i];
      // The extra index is the bye.
      if (a < n && b < n) round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    ids.splice(1, 0, ids.pop()!);
  }
  return rounds;
}

/**
 * The events, games and draws of a bonspiel played in pools: the first
 * [options.teams] of [teams] dealt into pools in turn, A, B, C and back,
 * each a round robin. The top [options.qualifiers] of each pool go on to a
 * knockout playoff, seeded so pool winners meet runners up from other pools
 * first, with any byes to the best seeds. Pool games are named by their pool's
 * letter, playoff games P1, P2 and the Final.
 */
export function poolsPlan(
  teams: BonspielTeam[],
  options: PoolsOptions,
  newId: () => string = newBonspielId,
): Pick<Bonspiel, 'events' | 'draws' | 'games'> {
  const poolCount = Math.min(Math.max(options.pools, 1), MAX_POOLS, Math.floor(options.teams / 2) || 1);
  const pools: BonspielSide[][] = Array.from({ length: poolCount }, () => []);
  for (let i = 0; i < options.teams; i++) {
    pools[i % poolCount].push(teams[i] ? { teamId: teams[i].id } : null);
  }

  const letters = 'ABCDEFGH';
  const events: BonspielEvent[] = [];
  const built: Built[] = [];
  let lastRound = 0;
  pools.forEach((members, p) => {
    const event: BonspielEvent = { id: newId(), name: `Pool ${letters[p]}` };
    events.push(event);
    let n = 0;
    roundRobin(members.length).forEach((pairs, r) => {
      for (const [a, b] of pairs) {
        const game: BonspielGame = {
          id: newId(), label: `${letters[p]}${++n}`, drawId: '', sheetId: '', eventId: event.id,
          team1: members[a], team2: members[b],
        };
        built.push({ game, event: p, round: r + 1, players: [`${p}:${a}`, `${p}:${b}`] });
        lastRound = Math.max(lastRound, r + 1);
      }
    });
  });

  // Each place, best first, across the pools: every pool's winner, then
  // every runner up, and so on.
  const qualifiers = Math.min(Math.max(options.qualifiers, 0), Math.min(...pools.map((m) => m.length)));
  const seeds: BonspielSide[] = [];
  for (let place = 1; place <= qualifiers; place++) {
    for (const event of events) seeds.push({ rank: place, eventId: event.id });
  }
  if (seeds.length >= 2) {
    // Best against worst: with byes to the best, then the rest paired from
    // the outside in, which is the order buildEvent pairs them in.
    const byes = 2 ** Math.ceil(Math.log2(seeds.length)) - seeds.length;
    const rest = seeds.slice(byes);
    const order = [...seeds.slice(0, byes)];
    for (let i = 0; i < rest.length / 2; i++) order.push(rest[i], rest[rest.length - 1 - i]);
    const event: BonspielEvent = { id: newId(), name: 'Playoffs' };
    events.push(event);
    const games = buildEvent(order.map((side) => ({ side, round: lastRound + 1 })), poolCount, newId);
    games.forEach((b, i) => {
      b.game.eventId = event.id;
      b.game.label = i === games.length - 1 ? 'Final' : `P${i + 1}`;
    });
    built.push(...games);
  }

  const draws = schedule(built, options, newId);
  return { events, draws, games: built.map((b) => b.game) };
}

/** [items] in a random order, for drawing the first round from a hat. */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

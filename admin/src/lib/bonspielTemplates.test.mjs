// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { knockoutPlan, shuffled } from './bonspielTemplates.ts';
import { bonspielProblems, sortedDraws } from './bonspiels.ts';

const teams = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` }));

function options(extra = {}) {
  return {
    teams: 16,
    events: 4,
    losers: 'byRound',
    sheetIds: ['s1', 's2', 's3', 's4'],
    firstDrawStart: '2026-11-06T19:00',
    dayStart: '09:00',
    lastDrawStart: '19:00',
    minutesBetweenDraws: 150,
    drawOff: true,
    ...extra,
  };
}

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

/** The whole bonspiel a plan makes, with dates that cover its draws. */
function bonspiel(n, extra = {}) {
  const o = options({ teams: n, ...extra });
  const plan = knockoutPlan(teams(n), o, ids());
  const draws = sortedDraws(plan.draws);
  return {
    name: 'Spiel', active: true, numberOfEnds: 8, teams: teams(n),
    startDate: draws[0].start.slice(0, 10), endDate: draws[draws.length - 1].start.slice(0, 10),
    ...plan,
  };
}

const sources = (game) => [game.team1, game.team2].filter((s) => s && 'from' in s);
const eventGames = (b, name) => b.games.filter((g) => g.eventId === b.events.find((e) => e.name === name).id);

describe('knockoutPlan', () => {
  test('makes plans that pass every check, whatever the size', () => {
    for (const losers of ['byRound', 'dropOne']) {
      for (let events = 1; events <= 4; events++) {
        for (let n = 2; n <= 33; n++) {
          const b = bonspiel(n, { events, losers });
          const where = `${n} teams, ${events} events, ${losers}`;
          assert.deepEqual(bonspielProblems(b, new Set(['s1', 's2', 's3', 's4'])), [], where);

          // Every team is placed once, in the A event.
          const placed = b.games.flatMap((g) => [g.team1, g.team2]).filter((s) => s && 'teamId' in s);
          assert.equal(placed.length, n, where);
          assert.equal(new Set(placed.map((s) => s.teamId)).size, n, where);

          // A knockout of k teams takes k - 1 games, so each event has one
          // more team in it than games, and exactly one final.
          for (const event of b.events) {
            const games = b.games.filter((g) => g.eventId === event.id);
            const sentOn = new Set(games.flatMap((g) => sources(g))
              .filter((s) => s.result === 'winner').map((s) => s.from));
            const finals = games.filter((g) => !sentOn.has(g.id));
            assert.equal(finals.length, 1, `${where}: ${event.name}`);
            assert.equal(finals[0].label, `${event.name[0]} Final`, where);
          }
        }
      }
    }
  });

  test('drops each A round\'s losers to the next event, by round', () => {
    const b = bonspiel(16);
    assert.deepEqual(b.events.map((e) => e.name), ['A Event', 'B Event', 'C Event', 'D Event']);
    // 8 first round losers play 7 games in B, 4 second round losers 3 in C,
    // and the 2 semi final losers 1 in D.
    assert.deepEqual(['A Event', 'B Event', 'C Event', 'D Event'].map((e) => eventGames(b, e).length), [15, 7, 3, 1]);
    const dFinal = eventGames(b, 'D Event')[0];
    const aGames = new Map(eventGames(b, 'A Event').map((g) => [g.id, g]));
    assert.ok(sources(dFinal).every((s) => s.result === 'loser' && aGames.has(s.from)));
  });

  test('drops losers one event at a time in a triple knockout', () => {
    const b = bonspiel(16, { events: 3, losers: 'dropOne' });
    // Every A loss but the final's goes to B (14 teams), and every B loss
    // but its final's to C (12 teams).
    assert.deepEqual(['A Event', 'B Event', 'C Event'].map((e) => eventGames(b, e).length), [15, 13, 11]);
    const bIds = new Set(eventGames(b, 'B Event').map((g) => g.id));
    const cLosers = eventGames(b, 'C Event').flatMap(sources).filter((s) => s.result === 'loser');
    assert.equal(cLosers.length, 12);
    assert.ok(cLosers.every((s) => bIds.has(s.from)));
  });

  test('gives byes to the teams listed first, and has them meet winners', () => {
    const b = bonspiel(6, { events: 1 });
    const a = eventGames(b, 'A Event');
    // Two first round games among teams 3 to 6, then teams 1 and 2 each meet a winner.
    assert.deepEqual(a.slice(0, 2).map((g) => [g.team1.teamId, g.team2.teamId]), [['t3', 't4'], ['t5', 't6']]);
    assert.deepEqual(a[2].team1, { teamId: 't1' });
    assert.deepEqual(a[2].team2, { from: a[0].id, result: 'winner' });
    assert.deepEqual(a[3].team1, { teamId: 't2' });
    assert.equal(a.length, 5);
  });

  test('leaves out events too few losers reach', () => {
    // Four teams: A round 1 has two losers for B, the semis one for C, which
    // is not enough for a game.
    assert.deepEqual(bonspiel(4).events.map((e) => e.name), ['A Event', 'B Event']);
  });

  test('leaves the first round to be decided past the teams there are', () => {
    const plan = knockoutPlan(teams(3), options({ teams: 8, events: 1 }), ids());
    const first = plan.games.slice(0, 4).flatMap((g) => [g.team1, g.team2]);
    assert.equal(first.filter((s) => s === null).length, 5);
  });
});

describe('scheduling a knockout', () => {
  test('fills the sheets, and plays no game before the ones it comes from', () => {
    const b = bonspiel(32);
    const drawIndex = new Map(sortedDraws(b.draws).map((d, i) => [d.id, i]));
    const perDraw = new Map();
    for (const game of b.games) {
      perDraw.set(game.drawId, (perDraw.get(game.drawId) ?? 0) + 1);
      for (const s of sources(game)) {
        const source = b.games.find((g) => g.id === s.from);
        assert.ok(drawIndex.get(source.drawId) < drawIndex.get(game.drawId));
      }
    }
    assert.ok([...perDraw.values()].every((n) => n <= 4));
    // 56 games on 4 sheets need at least 14 draws.
    assert.equal(b.games.length, 56);
    assert.ok(b.draws.length >= 14);
  });

  test('gives teams a draw off where it can', () => {
    const backToBack = (b) => {
      const drawIndex = new Map(sortedDraws(b.draws).map((d, i) => [d.id, i]));
      const at = (id) => drawIndex.get(b.games.find((g) => g.id === id).drawId);
      return b.games.filter((g) => sources(g).some((s) => at(s.from) === drawIndex.get(g.drawId) - 1)).length;
    };
    const rested = backToBack(bonspiel(16));
    const unrested = backToBack(bonspiel(16, { drawOff: false }));
    assert.ok(rested < unrested, `${rested} back to back games with a draw off, ${unrested} without`);
  });

  test('moves to the next morning after the day\'s last draw', () => {
    const b = bonspiel(16);
    assert.deepEqual(sortedDraws(b.draws).slice(0, 4).map((d) => d.start), [
      '2026-11-06T19:00', '2026-11-07T09:00', '2026-11-07T11:30', '2026-11-07T14:00',
    ]);
    // The next draw would start at 21:30, after 19:00.
    assert.equal(sortedDraws(b.draws)[6].start, '2026-11-08T09:00');
  });

  test('uses only the sheets it is given', () => {
    const b = bonspiel(8, { sheetIds: ['s2', 's4'] });
    assert.deepEqual([...new Set(b.games.map((g) => g.sheetId))].sort(), ['s2', 's4']);
  });
});

describe('shuffled', () => {
  test('keeps every item', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const result = shuffled(items, random);
    assert.notDeepEqual(result, items);
    assert.deepEqual([...result].sort((a, b) => a - b), items);
  });
});

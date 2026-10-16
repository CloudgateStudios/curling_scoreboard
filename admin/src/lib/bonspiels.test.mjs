// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMinutes, bonspielData, bonspielFrom, bonspielProblems, daysBetween, describeSide,
  duplicateBonspiel, earlierGames, gamesPlacing, nextDrawStart, parseTeamNames, suggestedGameLabel,
  teamsPlacedInDraw, withoutGames, withoutTeam,
} from './bonspiels.ts';

const sheets = new Set(['s1', 's2']);

// Four teams on two sheets: two A event semis on Friday, the A final and the
// B game for their losers on Saturday.
function plan(extra = {}) {
  return {
    name: 'Fall Spiel',
    active: true,
    startDate: '2026-11-06',
    endDate: '2026-11-08',
    numberOfEnds: 8,
    events: [{ id: 'a', name: 'A Event' }, { id: 'b', name: 'B Event' }],
    teams: [
      { id: 't1', name: 'Smith' }, { id: 't2', name: 'Jones' },
      { id: 't3', name: 'Brown' }, { id: 't4', name: 'Lee' },
    ],
    draws: [
      { id: 'd1', label: 'Draw 1', start: '2026-11-06T19:00' },
      { id: 'd2', label: 'Draw 2', start: '2026-11-07T09:00' },
    ],
    games: [
      game('a1', 'A1', 'd1', 's1', 'a', { teamId: 't1' }, { teamId: 't2' }),
      game('a2', 'A2', 'd1', 's2', 'a', { teamId: 't3' }, { teamId: 't4' }),
      game('a3', 'A3', 'd2', 's1', 'a', { from: 'a1', result: 'winner' }, { from: 'a2', result: 'winner' }),
      game('b1', 'B1', 'd2', 's2', 'b', { from: 'a1', result: 'loser' }, { from: 'a2', result: 'loser' }),
    ],
    ...extra,
  };
}

function game(id, label, drawId, sheetId, eventId, team1, team2) {
  return { id, label, drawId, sheetId, eventId, team1, team2 };
}

const withGame = (id, change) => {
  const p = plan();
  return { ...p, games: p.games.map((g) => (g.id === id ? { ...g, ...change } : g)) };
};

describe('bonspielProblems', () => {
  test('finds nothing wrong with a sound plan', () => {
    assert.deepEqual(bonspielProblems(plan(), sheets), []);
  });

  test('needs a name, dates in order and a sensible number of ends', () => {
    assert.deepEqual(bonspielProblems(plan({ name: ' ', endDate: '2026-11-01', numberOfEnds: 13 }), sheets), [
      'Give the bonspiel a name.',
      'The bonspiel ends before it starts.',
      'Games have to be 1 to 12 ends.',
      'Draw 1 is outside the bonspiel\'s dates.',
      'Draw 2 is outside the bonspiel\'s dates.',
    ]);
  });

  test('refuses two teams, events or draws with one name', () => {
    const p = plan();
    assert.deepEqual(bonspielProblems({
      ...p,
      teams: [...p.teams, { id: 't5', name: 'smith ' }],
      events: [...p.events, { id: 'c', name: 'A Event' }],
      draws: [...p.draws, { id: 'd3', label: 'Draw 1', start: '2026-11-07T12:00' }],
    }, sheets), [
      'Two events are called "A Event".',
      'Two teams are called "smith".',
      'Two draws are called "Draw 1".',
    ]);
  });

  test('refuses two games on one sheet in one draw', () => {
    assert.deepEqual(bonspielProblems(withGame('a2', { sheetId: 's1' }), sheets),
      ['A1 and A2 are on the same sheet in the same draw.']);
  });

  test('refuses a team in two games of one draw', () => {
    assert.deepEqual(bonspielProblems(withGame('a2', { team1: { teamId: 't1' } }), sheets),
      ['Smith is in both A1 and A2, in the same draw.']);
  });

  test('refuses a game that comes from one in the same draw or later', () => {
    assert.deepEqual(bonspielProblems(withGame('a2', { team1: { from: 'a1', result: 'winner' } }), sheets), [
      'A2 comes from A1, which is not in an earlier draw.',
      'The winner of A1 goes to both A2 and A3.',
    ]);
  });

  test('refuses sending one game\'s winner to two games', () => {
    assert.deepEqual(bonspielProblems(withGame('b1', { team1: { from: 'a1', result: 'winner' } }), sheets),
      ['The winner of A1 goes to both A3 and B1.']);
  });

  test('refuses links to games, teams and sheets that are gone', () => {
    const p = withGame('a3', { team1: { from: 'gone', result: 'winner' }, sheetId: 's9' });
    assert.deepEqual(bonspielProblems({ ...p, teams: p.teams.filter((t) => t.id !== 't4') }, sheets), [
      'A2 has a team that has been removed.',
      'A3 is on a sheet the club no longer has.',
      'A3 comes from a game that has been removed.',
    ]);
  });

  test('refuses the same team on both sides', () => {
    assert.deepEqual(bonspielProblems(withGame('a1', { team2: { teamId: 't1' } }), sheets),
      ['A1 has the same team on both sides.']);
  });
});

describe('bonspielFrom and bonspielData', () => {
  test('round trips a plan, keeping draws in time order and games in draw order', () => {
    const p = plan();
    const shuffled = { ...p, draws: [...p.draws].reverse(), games: [...p.games].reverse() };
    const stored = bonspielData(shuffled);
    assert.deepEqual(stored.draws.map((d) => d.id), ['d1', 'd2']);
    assert.deepEqual(stored.games.map((g) => g.label), ['A1', 'A2', 'A3', 'B1']);
    assert.deepEqual(bonspielFrom('x', stored), { id: 'x', ...p });
  });

  test('stores a result with only the scores given', () => {
    const stored = bonspielData(withGame('a1', { result: { winner: 'team2', team1Score: undefined } }));
    assert.deepEqual(stored.games[0].result, { winner: 'team2' });
  });

  test('reads what an older or hand written document has', () => {
    const read = bonspielFrom('x', {
      name: 'Old', games: [{ label: 'no id' }, { id: 'g', team1: { teamId: '' }, result: { winner: 'nobody' } }],
    });
    assert.equal(read.numberOfEnds, 8);
    assert.deepEqual(read.games, [
      { id: 'g', label: '', drawId: '', sheetId: '', eventId: '', team1: null, team2: null },
    ]);
  });
});

describe('dates and times', () => {
  test('moves times on, across midnight and month ends', () => {
    assert.equal(addMinutes('2026-11-06T22:30', 150), '2026-11-07T01:00');
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-11-06T19:00', 7), '2026-11-13T19:00');
    assert.equal(daysBetween('2026-11-06', '2027-11-05'), 364);
  });

  test('puts the next draw a draw\'s length after the last', () => {
    assert.equal(nextDrawStart(plan()), '2026-11-07T11:30');
    assert.equal(nextDrawStart({ startDate: '2026-11-06', draws: [] }), '2026-11-06T09:00');
  });
});

describe('duplicateBonspiel', () => {
  test('moves the dates and draws, and leaves out teams and results', () => {
    const p = withGame('a1', { result: { winner: 'team1' } });
    const copy = duplicateBonspiel({ id: 'x', ...p }, 'Fall Spiel 2027', '2027-11-05');
    assert.equal(copy.endDate, '2027-11-07');
    assert.deepEqual(copy.draws.map((d) => d.start), ['2027-11-05T19:00', '2027-11-06T09:00']);
    assert.deepEqual(copy.teams, []);
    assert.equal(copy.games[0].result, undefined);
    assert.deepEqual([copy.games[0].team1, copy.games[2].team1], [null, { from: 'a1', result: 'winner' }]);
  });
});

describe('describing a plan', () => {
  test('says where each side comes from', () => {
    const p = plan();
    assert.equal(describeSide({ teamId: 't1' }, p), 'Smith');
    assert.equal(describeSide({ from: 'a1', result: 'loser' }, p), 'Loser of A1');
    assert.equal(describeSide(null, p), 'To be decided');
  });

  test('suggests the next free label in an event', () => {
    assert.equal(suggestedGameLabel(plan(), 'a'), 'A4');
    assert.equal(suggestedGameLabel(plan(), 'b'), 'B2');
  });

  test('offers only games in earlier draws to come from', () => {
    const p = plan();
    assert.deepEqual(earlierGames(p, p.games[2]).map((g) => g.label), ['A1', 'A2']);
    assert.deepEqual(earlierGames(p, p.games[0]), []);
  });

  test('knows which teams already play in a draw', () => {
    assert.deepEqual([...teamsPlacedInDraw(plan(), 'd1', 'a1')], ['t3', 't4']);
  });

  test('reads pasted team names, one to a line', () => {
    assert.deepEqual(parseTeamNames('Smith\n\n  Jones \r\nsmith\nBrown'), ['Smith', 'Jones', 'Brown']);
  });
});

describe('removing from a plan', () => {
  test('leaves the games that came from a removed game to be decided', () => {
    const p = withoutGames(plan(), new Set(['a1']));
    assert.deepEqual(p.games.map((g) => g.label), ['A2', 'A3', 'B1']);
    assert.deepEqual(p.games[1].team1, null);
    assert.deepEqual(p.games[1].team2, { from: 'a2', result: 'winner' });
    assert.deepEqual(bonspielProblems(p, sheets), []);
  });

  test('takes a removed team out of its games', () => {
    assert.equal(gamesPlacing(plan(), 't2'), 1);
    const p = withoutTeam(plan(), 't2');
    assert.equal(p.teams.length, 3);
    assert.deepEqual([p.games[0].team1, p.games[0].team2], [{ teamId: 't1' }, null]);
    assert.deepEqual(bonspielProblems(p, sheets), []);
  });
});

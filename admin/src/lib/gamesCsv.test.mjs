// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gamesCsv, gamesCsvFilename } from './gamesCsv.ts';

const at = (iso) => new Date(iso);

function game(overrides) {
  return {
    id: 'g', sheetName: 'Sheet 1', numberOfEnds: 3, league: null,
    startedAt: at('2026-10-05T18:30:00'), finishedAt: at('2026-10-05T20:10:00'),
    team1: { name: 'Smith', totalScore: 3, hadLastStoneFirstEnd: true },
    team2: { name: 'Jones', totalScore: 1, hadLastStoneFirstEnd: false },
    ends: [
      { endNumber: 1, scoringTeamSlot: 'team1', scoringTeam: 'Smith', score: 2, gameTimeInSeconds: 600 },
      { endNumber: 2, scoringTeamSlot: null, scoringTeam: null, score: 0, gameTimeInSeconds: 1200 },
      { endNumber: 3, scoringTeamSlot: 'team2', scoringTeam: 'Jones', score: 1, gameTimeInSeconds: 1800 },
    ],
    ...overrides,
  };
}

const rows = (csv) => csv.trimEnd().split('\r\n');

describe('gamesCsv', () => {
  test('writes one row per game with totals, winner and points per end', () => {
    const [header, row] = rows(gamesCsv([game()]));
    assert.equal(header,
      'Date,Started,Finished,Sheet,League,Team 1,Team 1 Color,Team 1 External ID,Team 1 Score,'
      + 'Team 2,Team 2 Color,Team 2 External ID,Team 2 Score,Winner,Ends Played,'
      + 'Team 1 End 1,Team 1 End 2,Team 1 End 3,Team 2 End 1,Team 2 End 2,Team 2 End 3');
    // A blank end is left empty for both teams.
    assert.equal(row, '2026-10-05,18:30,20:10,Sheet 1,,Smith,,,3,Jones,,,1,Smith,3,2,,0,0,,1');
  });

  test('includes the league, rock colors and external IDs of league games', () => {
    const [, row] = rows(gamesCsv([game({
      league: { id: 'l1', name: 'Monday Night' },
      team1: { name: 'Smith', totalScore: 3, color: { name: 'Blue', hex: '#2196F3' }, externalId: 'A1' },
      team2: { name: 'Jones', totalScore: 1, color: { name: 'Green', hex: '#4CAF50' }, externalId: 'B2' },
    })]));
    assert.match(row, /^2026-10-05,18:30,20:10,Sheet 1,Monday Night,Smith,Blue,A1,3,Jones,Green,B2,1,/);
  });

  test('sorts oldest first and pads shorter games', () => {
    const early = game({ id: 'early', sheetName: 'Early', startedAt: at('2026-10-01T09:00:00'), ends: [] });
    const csv = rows(gamesCsv([game(), early]));
    assert.match(csv[1], /^2026-10-01,09:00,20:10,Early,.*,Smith,0,,,,,,$/);
    assert.match(csv[2], /^2026-10-05,18:30,/);
  });

  test('quotes names with commas or quotes, and calls a level game a tie', () => {
    const [, row] = rows(gamesCsv([game({
      team1: { name: 'Smith, Jr.', totalScore: 2 },
      team2: { name: 'The "Rocks"', totalScore: 2 },
    })]));
    assert.match(row, /,"Smith, Jr\.",,,2,"The ""Rocks""",,,2,Tie,/);
  });

  test('has only a header when there are no games', () => {
    assert.equal(gamesCsv([]), 'Date,Started,Finished,Sheet,League,Team 1,Team 1 Color,Team 1 External ID,'
      + 'Team 1 Score,Team 2,Team 2 Color,Team 2 External ID,Team 2 Score,Winner,Ends Played\r\n');
  });
});

describe('gamesCsvFilename', () => {
  test('names the club and the range', () => {
    assert.equal(gamesCsvFilename('Granite Curling Club', at('2026-10-03T08:00'), at('2026-10-09T22:00')),
      'granite-curling-club-games-2026-10-03-to-2026-10-09.csv');
    assert.equal(gamesCsvFilename('Sheet 1', at('2026-10-03T08:00'), at('2026-10-03T22:00')),
      'sheet-1-games-2026-10-03.csv');
  });
});

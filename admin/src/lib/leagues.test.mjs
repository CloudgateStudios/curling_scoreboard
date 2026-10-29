// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLeagues, drawConflicts, formatConflict, formatDraws, leagueData, leagueFrom, scheduledDraws,
  sortTeams, suggestShortName,
} from './leagues.ts';

function league(name, draws = [], extra = {}) {
  return { id: name, name, active: true, draws, teams: [], ...extra };
}

const draw = (day, start, end) => ({ day, start, end });

describe('compareLeagues', () => {
  test('orders by first draw of a week that starts on Sunday', () => {
    const leagues = [
      league('Monday Mixed', [draw(1, '18:30', '20:30')]),
      league('Saturday Open', [draw(6, '10:00', '12:00')]),
      league('Sunday Evening', [draw(7, '18:00', '20:00')]),
      league('Sunday Brunch', [draw(7, '10:00', '12:00')]),
      // Plays Thursday too, but its Monday draw is what places it.
      league('Twice Weekly', [draw(4, '19:00', '21:00'), draw(1, '16:00', '18:00')]),
    ];
    assert.deepEqual(leagues.sort(compareLeagues).map((l) => l.name), [
      'Sunday Brunch', 'Sunday Evening', 'Twice Weekly', 'Monday Mixed', 'Saturday Open',
    ]);
  });

  test('breaks ties by name and puts leagues with no schedule last, by name', () => {
    const leagues = [
      league('Zeta'),
      league('Beta', [draw(2, '18:00', '20:00')]),
      league('Alpha'),
      league('Able', [draw(2, '18:00', '20:00')]),
    ];
    assert.deepEqual(
      leagues.sort(compareLeagues).map((l) => l.name),
      ['Able', 'Beta', 'Alpha', 'Zeta'],
    );
  });
});

describe('formatDraws', () => {
  test('lists draws Sunday first', () => {
    assert.equal(
      formatDraws([draw(1, '18:30', '20:30'), draw(7, '10:00', '12:00')]),
      'Sun 10:00–12:00, Mon 18:30–20:30',
    );
  });
});

describe('scheduledDraws', () => {
  test('leaves out draws that cannot be placed', () => {
    const placed = scheduledDraws([
      league('A', [draw(1, '18:00', '20:00'), draw(1, '', '20:00'), draw(2, '20:00', '18:00')]),
    ]);
    assert.equal(placed.length, 1);
    assert.equal(placed[0].start, 18 * 60);
  });
});

describe('drawConflicts', () => {
  test('finds draws on the same day at the same time', () => {
    const conflicts = drawConflicts([
      league('Early', [draw(1, '18:00', '20:00')]),
      league('Late', [draw(1, '19:00', '21:00')]),
      league('Tuesday', [draw(2, '19:00', '21:00')]),
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(formatConflict(conflicts[0]), 'Early and Late overlap on Mon 19:00–20:00');
  });

  test('allows draws that meet end to start', () => {
    assert.deepEqual(
      drawConflicts([
        league('Early', [draw(1, '18:00', '20:00')]),
        league('Late', [draw(1, '20:00', '22:00')]),
      ]),
      [],
    );
  });

  test('ignores inactive leagues and seasons that do not overlap', () => {
    const early = league('Early', [draw(1, '18:00', '20:00')], { seasonEnd: '2026-12-20' });
    assert.deepEqual(
      drawConflicts([
        early,
        league('Off', [draw(1, '18:00', '20:00')], { active: false }),
        league('Winter', [draw(1, '18:00', '20:00')], { seasonStart: '2027-01-04' }),
      ]),
      [],
    );
    assert.equal(
      drawConflicts([
        early,
        league('Fall', [draw(1, '18:00', '20:00')], { seasonStart: '2026-12-20' }),
      ]).length,
      1,
    );
  });

  test('catches a league that overlaps itself', () => {
    const conflicts = drawConflicts([
      league('Double', [draw(3, '18:00', '20:00'), draw(3, '19:30', '21:30')]),
    ]);
    assert.equal(
      formatConflict(conflicts[0]),
      'Double has two draws that overlap on Wed 19:30–20:00',
    );
  });
});

describe('sortTeams', () => {
  const team = (name) => ({ id: name, name });

  test('orders by name, ignoring case, with numbers in number order', () => {
    const teams = ['smith', 'Team 10', 'Anderson', 'Team 2', 'Brown'].map(team);
    assert.deepEqual(sortTeams(teams).map((t) => t.name), [
      'Anderson', 'Brown', 'smith', 'Team 2', 'Team 10',
    ]);
  });

  test('leagues are read and saved with their teams in order', () => {
    const teams = ['Wilson', 'Adams', 'Moore'].map(team);
    assert.deepEqual(leagueFrom('x', { name: 'L', teams }).teams.map((t) => t.name), ['Adams', 'Moore', 'Wilson']);
    assert.deepEqual(
      leagueData({ name: 'L', active: true, draws: [], teams }).teams.map((t) => t.name),
      ['Adams', 'Moore', 'Wilson'],
    );
  });
  test('a short name is kept trimmed, and left out when blank', () => {
    const base = { name: 'Monday Mixed 4s', active: true, draws: [], teams: [] };
    assert.equal(leagueData({ ...base, shortName: ' Mixed 4s ' }).shortName, 'Mixed 4s');
    assert.equal('shortName' in leagueData({ ...base, shortName: '  ' }), false);
    assert.equal(leagueFrom('x', { ...base, shortName: 'Mixed 4s' }).shortName, 'Mixed 4s');
  });
});

describe('suggestShortName', () => {
  test('leaves out when a league plays', () => {
    for (const [name, short] of [
      ['Monday Mixed 4s', 'Mixed 4s'],
      ['Thursday Night Competitive', 'Competitive'],
      ['Sunday Brunch League', 'Brunch League'],
      ['Tuesday Morning Seniors', 'Seniors'],
      ['Thurs. Night Open', 'Open'],
      ['Mondays Over/Under', 'Over/Under'],
      ['Monday & Wednesday Doubles', 'Doubles'],
      ['Fall 2026 – Wednesday Doubles', 'Doubles'],
      ['Winter Session 2: Friday Mixed', 'Mixed'],
      ['Mixed (Monday)', 'Mixed'],
      ['2026-27 Learn to Curl', 'Learn to Curl'],
      ['Founders Cup 2026', 'Founders Cup'],
    ]) {
      assert.equal(suggestShortName(name), short, name);
    }
  });

  test('keeps words that only look like a time', () => {
    assert.equal(suggestShortName('Monday Late Night Doubles'), 'Late Night Doubles');
    assert.equal(suggestShortName('Wednesday Wedding Party'), 'Wedding Party');
    assert.equal(suggestShortName('Sun Valley Open'), null);
  });

  test('suggests nothing when there is nothing to leave out, or nothing left', () => {
    assert.equal(suggestShortName('Open Teams'), null);
    assert.equal(suggestShortName('Monday Night'), null);
    assert.equal(suggestShortName('Monday Night League'), null);
    assert.equal(suggestShortName('Monday The Very Long Name of a Competitive Open League'), null);
  });
});

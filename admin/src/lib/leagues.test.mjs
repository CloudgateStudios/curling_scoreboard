// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLeagues, drawConflicts, formatConflict, formatDraws, scheduledDraws,
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

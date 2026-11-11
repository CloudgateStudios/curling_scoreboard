// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bonspielDay, bonspielToOpen, dateOf, drawsComingUp, drawsOnNow, localMinutes, parseLocalTime, setupSteps, timeOf,
} from './clubNow.ts';

// Tuesday 11 November 2026, on the club's clock.
const at = (hhmm, date = '2026-11-11') => parseLocalTime(`${date}T${hhmm}`);

function league(extra = {}) {
  return {
    id: 'mens', name: "Tuesday Men's", active: true, teams: [],
    draws: [{ day: 3, start: '19:00', end: '21:00' }],
    ...extra,
  };
}

function bonspiel(extra = {}) {
  return {
    id: 'fall', name: 'Fall Classic', active: true, startDate: '2026-11-11', endDate: '2026-11-12',
    numberOfEnds: 8, events: [], teams: [],
    draws: [
      { id: 'd1', label: 'Draw 1', start: '2026-11-11T09:00' },
      { id: 'd2', label: 'Draw 2', start: '2026-11-11T11:30' },
    ],
    games: [{ id: 'g1', label: 'A1', drawId: 'd1', sheetId: 's1', eventId: 'a', team1: null, team2: null }],
    ...extra,
  };
}

describe('local time', () => {
  test('reads the clock in the club zone', () => {
    const minutes = localMinutes('America/Chicago', new Date('2026-11-12T01:30:00Z'));
    assert.equal(dateOf(minutes), '2026-11-11');
    assert.equal(timeOf(minutes), '19:30');
  });

  test('falls back to the browser zone for one it does not know', () => {
    assert.equal(typeof localMinutes('Not/AZone', new Date()), 'number');
  });
});

describe('drawsOnNow', () => {
  test('a league is on from 30 minutes before its draw until it ends', () => {
    assert.equal(drawsOnNow([league()], [], at('18:29')).length, 0);
    assert.equal(drawsOnNow([league()], [], at('18:30')).length, 1);
    assert.equal(drawsOnNow([league()], [], at('21:00')).length, 1);
    assert.equal(drawsOnNow([league()], [], at('21:01')).length, 0);
  });

  test('a league is not on another day, out of season or when inactive', () => {
    assert.equal(drawsOnNow([league()], [], at('19:30', '2026-11-12')).length, 0);
    assert.equal(drawsOnNow([league({ seasonEnd: '2026-11-10' })], [], at('19:30')).length, 0);
    assert.equal(drawsOnNow([league({ active: false })], [], at('19:30')).length, 0);
  });

  test('a late league draw is still on after midnight', () => {
    const late = league({ draws: [{ day: 3, start: '22:00', end: '00:30' }] });
    const [draw] = drawsOnNow([late], [], at('00:15', '2026-11-12'));
    assert.equal(dateOf(draw.start), '2026-11-11');
  });

  test('a league that shares the ice keeps its sheets', () => {
    const shared = league({ draws: [{ day: 3, start: '19:00', end: '21:00', sheetIds: ['s1'] }] });
    assert.deepEqual(drawsOnNow([shared], [], at('19:30'))[0].sheetIds, ['s1']);
    assert.equal(drawsOnNow([league()], [], at('19:30'))[0].sheetIds, null);
  });

  test('a bonspiel draw is on until 30 minutes before the next', () => {
    assert.equal(drawsOnNow([], [bonspiel()], at('10:59'))[0].label, 'Draw 1');
    assert.equal(drawsOnNow([], [bonspiel()], at('11:00'))[0].label, 'Draw 2');
  });

  test("a bonspiel's last draw is on for three hours", () => {
    assert.equal(drawsOnNow([], [bonspiel()], at('14:30'))[0].label, 'Draw 2');
    assert.equal(drawsOnNow([], [bonspiel()], at('14:31')).length, 0);
  });

  test('bonspiels come before leagues', () => {
    const evening = bonspiel({ draws: [{ id: 'd1', label: 'Draw 1', start: '2026-11-11T19:00' }] });
    assert.deepEqual(drawsOnNow([league()], [evening], at('19:30')).map((d) => d.kind), ['bonspiel', 'league']);
  });
});

describe('drawsComingUp', () => {
  test('lists draws not yet on, soonest first', () => {
    const next = drawsComingUp([league()], [bonspiel()], at('08:00'));
    assert.deepEqual(next.map((d) => d.label ?? d.name), ['Draw 1', 'Draw 2', "Tuesday Men's"]);
    assert.equal(timeOf(next[2].start), '19:00');
  });

  test('looks a week ahead and no further', () => {
    assert.equal(dateOf(drawsComingUp([league()], [], at('19:30'))[0].start), '2026-11-18');
    const fortnightly = league({ seasonStart: '2026-11-25' });
    assert.equal(drawsComingUp([fortnightly], [], at('19:30')).length, 0);
  });

  test('leaves out what is on now and keeps to the limit', () => {
    const next = drawsComingUp([league()], [], at('19:30'), 1);
    assert.equal(next.length, 1);
    assert.equal(dateOf(next[0].start), '2026-11-18');
  });
});

describe('bonspielToOpen', () => {
  const b = (id, startDate, endDate, active = true) => bonspiel({ id, startDate, endDate, active });

  test('opens the one on today', () => {
    assert.equal(bonspielToOpen([b('later', '2026-12-01', '2026-12-02'), b('now', '2026-11-10', '2026-11-12')], '2026-11-11').id, 'now');
  });

  test('else the next to start', () => {
    assert.equal(bonspielToOpen([b('past', '2026-10-01', '2026-10-02'), b('next', '2026-12-01', '2026-12-02')], '2026-11-11').id, 'next');
  });

  test('prefers active ones, and is null when nothing is on or coming', () => {
    assert.equal(bonspielToOpen([b('off', '2026-11-11', '2026-11-11', false), b('on', '2026-12-01', '2026-12-01')], '2026-11-11').id, 'on');
    assert.equal(bonspielToOpen([b('past', '2026-10-01', '2026-10-02')], '2026-11-11'), null);
  });
});

describe('setupSteps', () => {
  const facts = (extra = {}) => ({
    sheets: [], timeZone: null, pinSet: false, leagueCount: 0, bonspielCount: 0, publicPage: false, webhook: false,
    ...extra,
  });
  const done = (steps) => steps.filter((s) => s.done).map((s) => s.id);

  test('a new club has nothing done', () => {
    assert.deepEqual(done(setupSteps(facts())), []);
  });

  test('scoreboards are done only when every sheet has one', () => {
    const sheets = [{ id: 's1', name: 'Sheet 1', scoreboardUid: 'u' }, { id: 's2', name: 'Sheet 2' }];
    assert.deepEqual(done(setupSteps(facts({ sheets }))), ['sheets']);
    sheets[1].scoreboardUid = 'v';
    assert.deepEqual(done(setupSteps(facts({ sheets }))), ['sheets', 'scoreboards']);
  });

  test('a set up club has every step done', () => {
    const steps = setupSteps(facts({
      sheets: [{ id: 's1', name: 'Sheet 1', scoreboardUid: 'u' }],
      timeZone: 'America/Chicago', pinSet: true, bonspielCount: 1, publicPage: true, webhook: true,
    }));
    assert.ok(steps.every((s) => s.done));
  });

  test('sharing scores and posting results are optional', () => {
    assert.deepEqual(setupSteps(facts()).filter((s) => s.optional).map((s) => s.id), ['publicPage', 'webhook']);
  });
});

describe('bonspielDay', () => {
  const three = bonspiel({
    draws: [
      { id: 'd1', label: 'Draw 1', start: '2026-11-11T09:00' },
      { id: 'd2', label: 'Draw 2', start: '2026-11-11T11:30' },
      { id: 'd3', label: 'Draw 3', start: '2026-11-11T14:00' },
      { id: 'd4', label: 'Draw 4', start: '2026-11-12T09:00' },
    ],
  });
  const statuses = (minutes) => bonspielDay(three, minutes).map((d) => `${d.drawId}:${d.status}`);

  test('lists only the day asked for', () => {
    assert.deepEqual(statuses(at('08:00', '2026-11-12')), ['d4:next']);
  });

  test('marks the draws done, on, next and later', () => {
    assert.deepEqual(statuses(at('08:00')), ['d1:next', 'd2:later', 'd3:later']);
    assert.deepEqual(statuses(at('12:00')), ['d1:done', 'd2:on', 'd3:next']);
    assert.deepEqual(statuses(at('18:00')), ['d1:done', 'd2:done', 'd3:done']);
  });

  test('counts an inactive bonspiel too', () => {
    assert.equal(bonspielDay({ ...three, active: false }, at('12:00')).length, 3);
  });
});

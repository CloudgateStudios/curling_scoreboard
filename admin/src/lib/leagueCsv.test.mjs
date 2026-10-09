// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CSV_EXAMPLE, parseCsvRows, parseDay, parseLeagueCsv, parseTime, planLeagueImport,
} from './leagueCsv.ts';

describe('parseCsvRows', () => {
  test('splits rows and cells', () => {
    assert.deepEqual(parseCsvRows('a,b\nc,d\n'), [['a', 'b'], ['c', 'd']]);
  });

  test('handles quotes, embedded commas, doubled quotes and CRLF', () => {
    assert.deepEqual(
      parseCsvRows('league,team\r\n"Monday, Late","The ""Rocks"""\r\n'),
      [['league', 'team'], ['Monday, Late', 'The "Rocks"']],
    );
  });

  test('ignores a byte order mark and keeps a last row with no newline', () => {
    assert.deepEqual(parseCsvRows('﻿league,team\nA,B'), [['league', 'team'], ['A', 'B']]);
  });
});

describe('parseDay and parseTime', () => {
  test('reads days by name or number', () => {
    assert.equal(parseDay('Mon'), 1);
    assert.equal(parseDay('thursday'), 4);
    assert.equal(parseDay(' Sun '), 7);
    assert.equal(parseDay('7'), 7);
    assert.equal(parseDay('M'), null);
    assert.equal(parseDay('8'), null);
    assert.equal(parseDay(''), null);
  });

  test('reads 24 hour and 12 hour times', () => {
    assert.equal(parseTime('18:30'), '18:30');
    assert.equal(parseTime('6:30 PM'), '18:30');
    assert.equal(parseTime('6pm'), '18:00');
    assert.equal(parseTime('12:15 am'), '00:15');
    assert.equal(parseTime('12pm'), '12:00');
    assert.equal(parseTime('0900'), '09:00');
    assert.equal(parseTime('25:00'), null);
    assert.equal(parseTime('13pm'), null);
    assert.equal(parseTime('evening'), null);
  });
});

describe('parseLeagueCsv', () => {
  test('reads the documented example', () => {
    const { leagues, problems } = parseLeagueCsv(CSV_EXAMPLE);
    assert.deepEqual(problems, []);
    assert.deepEqual(leagues, [
      {
        name: 'Monday Night',
        draws: [{ day: 1, start: '18:30', end: '20:30' }],
        teams: [{ name: 'Team Smith', externalId: '1042' }, { name: 'Team Jones', externalId: '1043' }],
      },
      {
        name: 'Thursday Doubles',
        draws: [{ day: 4, start: '19:00', end: '21:00' }],
        teams: [{ name: 'Stone Cold' }],
      },
    ]);
  });

  test('takes columns in any order and needs only league and team', () => {
    const { leagues, problems } = parseLeagueCsv('Team,League\nTeam Smith,Open League\n');
    assert.deepEqual(problems, []);
    assert.deepEqual(leagues, [{ name: 'Open League', draws: [], teams: [{ name: 'Team Smith' }] }]);
  });

  test('collects a league with two draws, listing each team once', () => {
    const { leagues } = parseLeagueCsv([
      'league,day,start,end,team',
      'Monday Night,Mon,18:30,20:30,Team Smith',
      'Monday Night,Mon,20:45,22:45,Team Jones',
      'monday night,Mon,20:45,22:45,team smith',
    ].join('\n'));
    assert.equal(leagues.length, 1);
    assert.equal(leagues[0].draws.length, 2);
    assert.deepEqual(leagues[0].teams.map((t) => t.name), ['Team Smith', 'Team Jones']);
  });

  test('reports a missing required column', () => {
    const { leagues, problems } = parseLeagueCsv('league,day\nMonday Night,Mon\n');
    assert.deepEqual(leagues, []);
    assert.deepEqual(problems, [{ line: 1, message: 'The header row has no "team" column.' }]);
  });

  test('reports bad rows by line and keeps the good ones', () => {
    const { leagues, problems } = parseLeagueCsv([
      'league,day,start,end,team',
      'Monday Night,Mon,18:30,20:30,Team Smith',
      ',Mon,18:30,20:30,Team Nowhere',
      'Monday Night,Funday,18:30,20:30,Team Jones',
      'Monday Night,Mon,20:30,18:30,Team Backwards',
      '',
      'Monday Night,Mon,18:30,20:30,',
    ].join('\n'));
    assert.deepEqual(leagues[0].teams, [{ name: 'Team Smith' }]);
    assert.deepEqual(problems.map((p) => p.line), [3, 4, 5, 7]);
  });

  test('reports an empty file', () => {
    assert.equal(parseLeagueCsv('').problems.length, 1);
  });
});

describe('planLeagueImport', () => {
  let next = 0;
  const newId = () => `new-${++next}`;
  const existing = [{
    id: 'league-1',
    name: 'Monday Night',
    active: false,
    seasonStart: '2026-10-01',
    draws: [{ day: 1, start: '18:30', end: '20:30' }],
    teams: [
      { id: 't-smith', name: 'Team Smith', externalId: '1042' },
      { id: 't-jones', name: 'Team Jones' },
      { id: 't-gone', name: 'Team Gone' },
    ],
  }];
  const incoming = [{
    name: 'monday night',
    draws: [],
    teams: [
      // Renamed, recognized by its external ID.
      { name: 'Team Smith-Lee', externalId: '1042' },
      // Recognized by name, and gains an external ID.
      { name: 'team jones', externalId: '1043' },
      { name: 'Team New' },
    ],
  }];

  test('merge keeps team IDs and the teams the file leaves out', () => {
    const [plan] = planLeagueImport(existing, incoming, 'merge', newId);
    assert.equal(plan.existingId, 'league-1');
    assert.deepEqual(plan.league.teams.map((t) => t.id), ['t-smith', 't-jones', plan.league.teams[2].id, 't-gone']);
    assert.match(plan.league.teams[2].id, /^new-/);
    assert.deepEqual(plan.league.teams[0], { id: 't-smith', name: 'Team Smith-Lee', externalId: '1042' });
    assert.equal(plan.league.teams[1].externalId, '1043');
    assert.deepEqual(plan.added, ['Team New']);
    assert.deepEqual(plan.renamed, [
      { from: 'Team Smith', to: 'Team Smith-Lee' },
      { from: 'Team Jones', to: 'team jones' },
    ]);
    assert.deepEqual(plan.removed, []);
    assert.equal(plan.unchanged, 1);
  });

  test('replace drops the teams the file leaves out', () => {
    const [plan] = planLeagueImport(existing, incoming, 'replace', newId);
    assert.deepEqual(plan.removed, ['Team Gone']);
    assert.equal(plan.league.teams.length, 3);
  });

  test('keeps the settings and schedule of a league the file gives none for', () => {
    const [plan] = planLeagueImport(existing, incoming, 'merge', newId);
    assert.equal(plan.league.name, 'Monday Night');
    assert.equal(plan.league.active, false);
    assert.equal(plan.league.seasonStart, '2026-10-01');
    assert.deepEqual(plan.league.draws, existing[0].draws);
  });

  test('a schedule in the file replaces the league schedule', () => {
    const draws = [{ day: 2, start: '19:00', end: '21:00' }];
    const [plan] = planLeagueImport(existing, [{ ...incoming[0], draws }], 'merge', newId);
    assert.deepEqual(plan.league.draws, draws);
  });

  test('creates leagues that do not exist yet, active', () => {
    const [plan] = planLeagueImport(existing, [{ name: 'Friday Fun', draws: [], teams: [{ name: 'A' }] }], 'replace', newId);
    assert.equal(plan.existingId, null);
    assert.equal(plan.league.active, true);
    assert.deepEqual(plan.added, ['A']);
  });

  test('importing the same file twice changes nothing', () => {
    const [first] = planLeagueImport([], incoming, 'replace', newId);
    const stored = [{ id: 'league-2', ...first.league }];
    const [second] = planLeagueImport(stored, incoming, 'replace', newId);
    assert.deepEqual(second.league.teams, first.league.teams);
    assert.deepEqual([second.added, second.renamed, second.removed], [[], [], []]);
    assert.equal(second.unchanged, 3);
  });
});

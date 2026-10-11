import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TEMPLATE, previewTemplate, unknownVariables } from './webhookMessage.ts';

test('previews the default message', () => {
  assert.equal(previewTemplate(DEFAULT_TEMPLATE), 'Monday Night, Sheet 2: Team Smith 7, Team Jones 4');
});

test('fills in game, league and date variables', () => {
  assert.equal(
    previewTemplate('{league}: {result} on {weekday}, {date}'),
    'Monday Night: Team Smith beat Team Jones 7-4 on Thursday, October 8, 2026',
  );
});

test('leaves names that are not variables as written', () => {
  assert.equal(previewTemplate('{team1} {teem2}'), 'Team Smith {teem2}');
});

test('lists each misspelled variable once', () => {
  assert.deepEqual(unknownVariables('{teem2} {team1} {teem2} {Date}'), ['teem2', 'Date']);
  assert.deepEqual(unknownVariables(DEFAULT_TEMPLATE), []);
});

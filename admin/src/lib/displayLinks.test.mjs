// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSettings, displayPreviewUrl, displayUrl, settingsToSave } from './displayLinks.ts';

const SITE = 'https://curlingscoreboard.app';
const TOKEN = 'abc123.0123456789abcdef0123456789abcdef';

describe('displayUrl', () => {
  test('is the link\'s own page for the club, with the token after the #', () => {
    assert.equal(displayUrl(SITE, 'windy-city', TOKEN), `${SITE}/display/windy-city#k=${TOKEN}`);
  });

  test('escapes the club ID so it stays one path segment', () => {
    assert.equal(displayUrl(SITE, 'a/b', TOKEN), `${SITE}/display/a%2Fb#k=${TOKEN}`);
  });
});

describe('displayPreviewUrl', () => {
  test('asks for preview mode before the token', () => {
    assert.equal(displayPreviewUrl(SITE, 'windy-city', TOKEN), `${SITE}/display/windy-city?preview#k=${TOKEN}`);
  });
});

describe('settingsToSave', () => {
  test('keeps a score bug\'s sheet and options, without the defaults', () => {
    assert.deepEqual(
      settingsToSave({ page: 'bug', sheetId: 's2', scale: 1.5, label: 'league', end: 'left', view: 'full' }),
      { page: 'bug', sheetId: 's2', scale: 1.5, label: 'league', end: 'left' },
    );
    assert.deepEqual(
      settingsToSave({ page: 'bug', sheetId: 's2', scale: 1, label: 'sheet', end: 'right' }),
      { page: 'bug', sheetId: 's2' },
    );
  });

  test('a score bug with no sheet falls back to the warm room', () => {
    assert.deepEqual(settingsToSave({ page: 'bug' }), { page: 'warm-room' });
  });

  test('keeps the warm room\'s view, and its timing only when cycling', () => {
    assert.deepEqual(settingsToSave({ page: 'warm-room', view: 'full', every: 30, scale: 2 }), { page: 'warm-room', view: 'full' });
    assert.deepEqual(settingsToSave({ page: 'warm-room', view: 'cycle', every: 30 }), { page: 'warm-room', view: 'cycle', every: 30 });
    assert.deepEqual(settingsToSave({ page: 'warm-room', view: 'cycle', every: 20 }), { page: 'warm-room', view: 'cycle' });
    assert.deepEqual(settingsToSave({ page: 'warm-room', view: 'totals' }), { page: 'warm-room' });
  });

  test('keeps the warm room\'s earlier results only when they are shown', () => {
    assert.deepEqual(settingsToSave({ page: 'warm-room', view: 'full', earlier: true }), { page: 'warm-room', view: 'full', earlier: true });
    assert.deepEqual(settingsToSave({ page: 'warm-room', earlier: false }), { page: 'warm-room' });
    assert.deepEqual(settingsToSave({ page: 'bug', sheetId: 's1', earlier: true }), { page: 'bug', sheetId: 's1' });
    assert.deepEqual(settingsToSave({ page: 'bonspiel', bonspielId: 'b1', earlier: true }), { page: 'bonspiel', bonspielId: 'b1' });
  });

  test('keeps the cycle timing within what the screen allows', () => {
    assert.equal(settingsToSave({ page: 'warm-room', view: 'cycle', every: 1 }).every, 5);
    assert.equal(settingsToSave({ page: 'warm-room', view: 'cycle', every: 9999 }).every, 300);
  });
});

describe('describeSettings', () => {
  const names = { s2: 'Sheet 2' };
  const sheetName = (id) => names[id];

  test('names the score bug\'s sheet and options', () => {
    assert.equal(describeSettings({ page: 'bug', sheetId: 's2' }, sheetName), 'Score bug for Sheet 2');
    assert.equal(
      describeSettings({ page: 'bug', sheetId: 's2', scale: 1.5, label: 'league', end: 'left' }, sheetName),
      'Score bug for Sheet 2, 1.5× size, league name, end on the left',
    );
    assert.equal(
      describeSettings({ page: 'bug', sheetId: 's2', label: 'both' }, sheetName),
      'Score bug for Sheet 2, league and sheet names',
    );
    assert.equal(describeSettings({ page: 'bug', sheetId: 'gone' }, sheetName), 'Score bug for a removed sheet');
  });

  test('names the warm room\'s view', () => {
    assert.equal(describeSettings(undefined, sheetName), 'Warm room, totals');
    assert.equal(describeSettings({ page: 'warm-room', view: 'full' }, sheetName), 'Warm room, end by end');
    assert.equal(
      describeSettings({ page: 'warm-room', view: 'cycle', every: 30 }, sheetName),
      'Warm room, totals and end by end in turn, every 30 seconds',
    );
    assert.equal(
      describeSettings({ page: 'warm-room', view: 'full', earlier: true }, sheetName),
      'Warm room, end by end, with earlier results',
    );
  });
});

describe('bonspiel screens', () => {
  test('keep their bonspiel and view, without the defaults', () => {
    assert.deepEqual(settingsToSave({ page: 'bonspiel', bonspielId: 'fall', view: 'now', scale: 2 }),
      { page: 'bonspiel', bonspielId: 'fall' });
    assert.deepEqual(settingsToSave({ page: 'bonspiel', bonspielId: 'fall', view: 'schedule', every: 30 }),
      { page: 'bonspiel', bonspielId: 'fall', view: 'schedule' });
  });

  test('keep their timing when there are screens in turn, brackets included', () => {
    assert.deepEqual(settingsToSave({ page: 'bonspiel', bonspielId: 'fall', view: 'brackets', every: 30 }),
      { page: 'bonspiel', bonspielId: 'fall', view: 'brackets', every: 30 });
    assert.equal(settingsToSave({ page: 'bonspiel', bonspielId: 'fall', view: 'cycle', every: 1 }).every, 5);
  });

  test('do not take a warm room view, nor give theirs to the warm room', () => {
    assert.deepEqual(settingsToSave({ page: 'bonspiel', bonspielId: 'fall', view: 'full' }),
      { page: 'bonspiel', bonspielId: 'fall' });
    assert.deepEqual(settingsToSave({ page: 'warm-room', view: 'brackets' }), { page: 'warm-room' });
  });

  test('fall back to the warm room without a bonspiel', () => {
    assert.deepEqual(settingsToSave({ page: 'bonspiel', view: 'schedule' }), { page: 'warm-room' });
  });

  test('are described by the bonspiel\'s name', () => {
    const name = (id) => (id === 'fall' ? 'Fall Spiel' : undefined);
    const none = () => undefined;
    assert.equal(describeSettings({ page: 'bonspiel', bonspielId: 'fall' }, none, name),
      'Fall Spiel, the draw on now and the next');
    assert.equal(describeSettings({ page: 'bonspiel', bonspielId: 'fall', view: 'brackets', every: 30 }, none, name),
      'Fall Spiel, the brackets in turn, every 30 seconds');
    assert.equal(describeSettings({ page: 'bonspiel', bonspielId: 'gone', view: 'schedule' }, none, name),
      'a removed bonspiel, every draw');
  });
});

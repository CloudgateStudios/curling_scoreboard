// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSettings, displayPreviewUrl, displayUrl, nextDisplayName, settingsToSave, showsSheet, withPage } from './displayLinks.ts';

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

  test('keeps a linescore\'s sheet, size and corner, without the bug\'s end side', () => {
    assert.deepEqual(
      settingsToSave({ page: 'linescore', sheetId: 's2', scale: 0.75, label: 'both', end: 'left', view: 'full' }),
      { page: 'linescore', sheetId: 's2', scale: 0.75, label: 'both' },
    );
    assert.deepEqual(
      settingsToSave({ page: 'linescore', sheetId: 's2', scale: 1, label: 'sheet' }),
      { page: 'linescore', sheetId: 's2' },
    );
    assert.deepEqual(settingsToSave({ page: 'linescore' }), { page: 'warm-room' });
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

describe('withPage', () => {
  const sheets = ['s1', 's2'];
  const bonspiels = ['b1'];

  test('gives a score bug or linescore the first sheet when it has none', () => {
    assert.deepEqual(withPage({ page: 'warm-room' }, 'bug', sheets, bonspiels), { page: 'bug', sheetId: 's1' });
    assert.deepEqual(withPage({ page: 'warm-room' }, 'linescore', sheets, bonspiels), { page: 'linescore', sheetId: 's1' });
  });

  test('keeps the sheet, size and caption moving between the score bug and the linescore', () => {
    assert.deepEqual(
      withPage({ page: 'bug', sheetId: 's2', scale: 1.5, label: 'both', end: 'left' }, 'linescore', sheets, bonspiels),
      { page: 'linescore', sheetId: 's2', scale: 1.5, label: 'both', end: 'left' },
    );
  });

  test('keeps a removed sheet until another is chosen', () => {
    assert.deepEqual(withPage({ page: 'bug', sheetId: 'gone' }, 'linescore', sheets, bonspiels), { page: 'linescore', sheetId: 'gone' });
  });

  test('stays as it was with no sheet or bonspiel to show', () => {
    assert.deepEqual(withPage({ page: 'warm-room' }, 'bug', [], bonspiels), { page: 'warm-room' });
    assert.deepEqual(withPage({ page: 'warm-room' }, 'bonspiel', sheets, []), { page: 'warm-room' });
  });

  test('starts the view afresh between the warm room and the bonspiel screen', () => {
    assert.deepEqual(withPage({ page: 'warm-room', view: 'full' }, 'bonspiel', sheets, bonspiels), { page: 'bonspiel', bonspielId: 'b1', view: undefined });
    assert.deepEqual(withPage({ page: 'bonspiel', bonspielId: 'b1', view: 'brackets' }, 'warm-room', sheets, bonspiels), { page: 'warm-room', bonspielId: 'b1', view: undefined });
  });

  test('a page that shows a sheet needs one', () => {
    assert.equal(showsSheet('bug'), true);
    assert.equal(showsSheet('linescore'), true);
    assert.equal(showsSheet('warm-room'), false);
    assert.equal(showsSheet('bonspiel'), false);
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

  test('names the linescore\'s sheet and options', () => {
    assert.equal(describeSettings({ page: 'linescore', sheetId: 's2' }, sheetName), 'Linescore for Sheet 2');
    assert.equal(
      describeSettings({ page: 'linescore', sheetId: 's2', scale: 1.5, label: 'league' }, sheetName),
      'Linescore for Sheet 2, 1.5× size, league name',
    );
    assert.equal(describeSettings({ page: 'linescore', sheetId: 'gone' }, sheetName), 'Linescore for a removed sheet');
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

describe('nextDisplayName', () => {
  test('is Display 1 for the first', () => {
    assert.equal(nextDisplayName([]), 'Display 1');
  });

  test('takes the first number not in use, ignoring case and spaces', () => {
    assert.equal(nextDisplayName(['display 1', ' Display 3 ', 'Warm room TV']), 'Display 2');
  });

  test('skips names that are taken in a row', () => {
    assert.equal(nextDisplayName(['Display 1', 'Display 2']), 'Display 3');
  });
});

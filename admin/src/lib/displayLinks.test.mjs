// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { displayUrl } from './displayLinks.ts';

const SITE = 'https://curlingscoreboard.app';
const TOKEN = 'abc123.0123456789abcdef0123456789abcdef';

describe('displayUrl', () => {
  test('opens the warm room screen with the token after the #', () => {
    assert.equal(
      displayUrl(SITE, 'windy-city', { kind: 'warmRoom' }, TOKEN),
      `${SITE}/display/windy-city/warm-room#k=${TOKEN}`,
    );
  });

  test('opens a sheet\'s score bug', () => {
    assert.equal(
      displayUrl(SITE, 'windy-city', { kind: 'scoreBug', sheetId: 'sheet2' }, TOKEN),
      `${SITE}/display/windy-city/sheets/sheet2/bug#k=${TOKEN}`,
    );
  });

  test('escapes IDs so they stay one path segment', () => {
    assert.equal(
      displayUrl(SITE, 'a b', { kind: 'scoreBug', sheetId: 'x/y' }, TOKEN),
      `${SITE}/display/a%20b/sheets/x%2Fy/bug#k=${TOKEN}`,
    );
  });
});

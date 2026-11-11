// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clockOf, formatHm, formatHour, timeOptions } from './clock.ts';

describe('clockOf', () => {
  test('is 24 hour only when saved as such, and 12 hour otherwise', () => {
    assert.equal(clockOf('24h'), '24h');
    assert.equal(clockOf('12h'), '12h');
    assert.equal(clockOf(undefined), '12h');
    assert.equal(clockOf('24'), '12h');
  });
});

describe('formatHm', () => {
  test('shows a draw time on the 12 hour clock', () => {
    assert.equal(formatHm('18:15', '12h'), '6:15 PM');
    assert.equal(formatHm('00:05', '12h'), '12:05 AM');
    assert.equal(formatHm('12:00', '12h'), '12:00 PM');
    assert.equal(formatHm('9:30', '12h'), '9:30 AM');
  });

  test('shows a draw time on the 24 hour clock, padded', () => {
    assert.equal(formatHm('18:15', '24h'), '18:15');
    assert.equal(formatHm('9:30', '24h'), '09:30');
  });

  test('leaves anything that is not a time alone', () => {
    assert.equal(formatHm('', '12h'), '');
    assert.equal(formatHm('soon', '24h'), 'soon');
  });
});

describe('formatHour', () => {
  test('labels a timeline hour on either clock', () => {
    assert.equal(formatHour(18, '12h'), '6 PM');
    assert.equal(formatHour(0, '12h'), '12 AM');
    assert.equal(formatHour(18, '24h'), '18:00');
    assert.equal(formatHour(7, '24h'), '07:00');
  });
});

describe('timeOptions', () => {
  test('formats a time on the clock asked for', () => {
    const at = new Date(Date.UTC(2026, 10, 11, 18, 15));
    const show = (clock) => at.toLocaleTimeString('en-US', { ...timeOptions(clock), timeZone: 'UTC' });
    assert.equal(show('24h'), '18:15');
    assert.match(show('12h'), /^6:15\sPM$/);
  });
});

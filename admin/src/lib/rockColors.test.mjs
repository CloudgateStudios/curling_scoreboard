// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ROCK_COLORS, ROCK_COLOR_PRESETS, isDefaultRockColors, rockColorPreset,
  rockColorsTooSimilar, rockTextColor,
} from './rockColors.ts';

const pair = (hex1, hex2) => ({ team1: { name: 'A', hex: hex1 }, team2: { name: 'B', hex: hex2 } });

describe('rockColorsTooSimilar', () => {
  test('passes every pair of presets', () => {
    for (const a of ROCK_COLOR_PRESETS) {
      for (const b of ROCK_COLOR_PRESETS) {
        if (a !== b) assert.equal(rockColorsTooSimilar(pair(a.hex, b.hex)), false, `${a.name}/${b.name}`);
      }
    }
  });

  test('flags close custom colors', () => {
    assert.equal(rockColorsTooSimilar(pair('#F44336', '#DC143C')), true);
    assert.equal(rockColorsTooSimilar(pair('#1B3A6B', '#1B3A6B')), true);
  });
});

describe('rockTextColor', () => {
  // The same choices the scoreboard app makes for the presets.
  test('matches the scoreboard for the presets', () => {
    const dark = ['Yellow', 'Orange', 'Grey'];
    for (const color of ROCK_COLOR_PRESETS) {
      assert.equal(rockTextColor(color.hex), dark.includes(color.name) ? '#000000' : '#FFFFFF', color.name);
    }
  });
});

describe('preset matching', () => {
  test('a preset hex under another name is a custom color', () => {
    assert.equal(rockColorPreset({ name: 'Crimson', hex: '#F44336' }), undefined);
    assert.equal(rockColorPreset({ name: 'Red', hex: '#f44336' })?.name, 'Red');
  });

  test('red and yellow are the defaults only under their own names', () => {
    assert.equal(isDefaultRockColors(DEFAULT_ROCK_COLORS), true);
    assert.equal(isDefaultRockColors({ ...DEFAULT_ROCK_COLORS, team1: { name: 'Crimson', hex: '#F44336' } }), false);
  });
});

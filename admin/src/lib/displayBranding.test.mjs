// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH, fitWithin } from './displayBranding.ts';

describe('fitWithin', () => {
  test('shrinks a wide logo to the width', () => {
    assert.deepEqual(fitWithin(2400, 600, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT), { width: 800, height: 200 });
    assert.deepEqual(fitWithin(3200, 400, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT), { width: 800, height: 100 });
  });

  test('shrinks a tall logo to the height', () => {
    assert.deepEqual(fitWithin(1000, 1000, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT), { width: 200, height: 200 });
  });

  test('never enlarges a small logo', () => {
    assert.deepEqual(fitWithin(120, 40, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT), { width: 120, height: 40 });
  });

  test('keeps at least a pixel each way', () => {
    assert.deepEqual(fitWithin(10000, 1, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT), { width: 800, height: 1 });
  });
});

// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword, generatePin } from './credentials.ts';

describe('generatePassword', () => {
  test('is 16 characters with every kind in it', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      assert.equal(password.length, 16);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[a-z]/);
      assert.match(password, /[2-9]/);
      assert.match(password, /[!#$%*+\-=?@]/);
    }
  });

  test('leaves out characters that are easy to misread', () => {
    const all = Array.from({ length: 200 }, () => generatePassword()).join('');
    assert.doesNotMatch(all, /[0O1lI]/);
  });

  test('is different each time', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));
    assert.equal(seen.size, 200);
  });

  test('meets the functions minimum of 8 characters at any length asked', () => {
    assert.equal(generatePassword(8).length, 8);
  });
});

describe('generatePin', () => {
  test('is six digits', () => {
    for (let i = 0; i < 100; i++) assert.match(generatePin(), /^[0-9]{6}$/);
  });
});

// Run with `npm test`. Node strips the types from the .ts imports itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { welcomeMessage } from './welcome.ts';

const base = { clubName: 'Granite CC', email: 'pat@example.com', password: 'tQ7#vR2m', portalUrl: 'https://admin.example.com' };

test('a first club admin gets the sign in and the PIN', () => {
  const text = welcomeMessage({ ...base, role: 'clubadmin', pin: '482913' });
  assert.match(text, /as a club admin for Granite CC/);
  assert.match(text, /Portal: https:\/\/admin\.example\.com\nEmail: pat@example\.com\nPassword: tQ7#vR2m/);
  assert.match(text, /PIN is 482913/);
});

test('a bonspiel admin gets the sign in only', () => {
  const text = welcomeMessage({ ...base, role: 'bonspieladmin' });
  assert.match(text, /as a bonspiel admin for Granite CC/);
  assert.doesNotMatch(text, /PIN/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webhookFailed, webhookSummary } from './gameWebhook.ts';

test('shows the response code of a delivered post', () => {
  assert.equal(webhookSummary({ ok: true, status: 204 }), 'Webhook delivered (204)');
});

test('shows the response code of a refused post', () => {
  assert.equal(
    webhookSummary({ ok: false, status: 404, error: 'The webhook answered 404.' }),
    'Webhook failed (404)',
  );
});

test('shows why a post got no answer', () => {
  assert.equal(
    webhookSummary({ ok: false, error: 'The webhook did not answer in time.' }),
    'Webhook failed: The webhook did not answer in time.',
  );
});

test('says so when the result was never recorded', () => {
  assert.equal(webhookSummary({}), 'Webhook sent, result unknown');
});

test('only a recorded failure counts as failed', () => {
  assert.equal(webhookFailed(undefined), false);
  assert.equal(webhookFailed({ ok: true }), false);
  assert.equal(webhookFailed({}), false);
  assert.equal(webhookFailed({ ok: false }), true);
});

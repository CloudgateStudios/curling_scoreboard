import type { GameWebhook } from '../types';

/** Whether the game was posted to the club's webhook and it did not go through. */
export function webhookFailed(webhook: GameWebhook | undefined): boolean {
  return webhook?.ok === false;
}

/** How posting a game went, with the receiver's response code when it gave one. */
export function webhookSummary(webhook: Pick<GameWebhook, 'ok' | 'status' | 'error'>): string {
  const code = webhook.status !== undefined ? ` (${webhook.status})` : '';
  if (webhook.ok === true) return `Webhook delivered${code}`;
  // The post was started and its result never recorded.
  if (webhook.ok === undefined) return 'Webhook sent, result unknown';
  // The error for an HTTP answer only repeats the code.
  if (webhook.status !== undefined || !webhook.error) return `Webhook failed${code}`;
  return `Webhook failed: ${webhook.error}`;
}

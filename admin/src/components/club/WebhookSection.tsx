import { useEffect, useState } from 'react';
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import { useUnsavedChanges } from '../../lib/unsavedChanges';
import type { WebhookGames, WebhookStatus } from '../../types';
import common from '../../styles/common.module.css';
import styles from './WebhookSection.module.css';

interface Props {
  clubId: string;
}

interface Saved {
  url: string;
  games: WebhookGames;
}

interface TestResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const GAMES_CHOICES: { value: WebhookGames; label: string }[] = [
  { value: 'all', label: 'Every completed game' },
  { value: 'league', label: 'Only league games, where a team was picked' },
];

// Matches the limit in firestore.rules.
const MAX_URL_LENGTH = 500;

/** Enough of the URL to recognize it by. Whoever has the whole thing can post
 *  to the club's channel, so it is not left on screen. */
function maskUrl(url: string): string {
  try {
    const { host } = new URL(url);
    return `https://${host}/…${url.slice(-4)}`;
  } catch {
    return '…';
  }
}

function describeStatus(status: WebhookStatus): string {
  const what = status.kind === 'test' ? 'Test message' : 'Last game';
  const outcome = status.ok ? 'delivered' : `failed: ${status.error ?? 'unknown error'}`;
  const when = status.at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `${what} ${outcome} (${when})`;
}

/** Where the club's completed games are posted, usually a Slack or Discord
 *  incoming webhook. */
export function WebhookSection({ clubId }: Props) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [status, setStatus] = useState<WebhookStatus | null>(null);
  const [url, setUrl] = useState('');
  const [games, setGames] = useState<WebhookGames>('all');
  // The saved URL is shown masked until the admin asks to replace it.
  const [editingUrl, setEditingUrl] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'webhook'), (snap) => {
      const data = snap.data();
      const next: Saved | null = typeof data?.url === 'string' && data.url
        ? { url: data.url, games: data.games === 'league' ? 'league' : 'all' }
        : null;
      setSaved(next);
      setUrl('');
      setGames(next?.games ?? 'all');
      setEditingUrl(false);
    });
  }, [clubId]);

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'webhookStatus'), (snap) => {
      const data = snap.data();
      setStatus(data?.at ? { ...(data as Omit<WebhookStatus, 'at'>), at: data.at.toDate() } : null);
    });
  }, [clubId]);

  const enteringUrl = !saved || editingUrl;
  const trimmedUrl = url.trim();
  const urlInvalid = enteringUrl && trimmedUrl !== '' && !/^https:\/\/.+/.test(trimmedUrl);
  const changed = enteringUrl ? trimmedUrl !== '' : games !== saved.games;
  const canSave = changed && !urlInvalid && busy === null;

  useUnsavedChanges(changed);

  async function handleSave() {
    setBusy('save');
    setError('');
    setTestResult(null);
    try {
      await setDoc(doc(db, 'clubs', clubId, 'private', 'webhook'), {
        url: enteringUrl ? trimmedUrl : saved.url,
        games,
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not save the webhook.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    if (!confirm('Remove the webhook? Completed games will no longer be posted.')) return;
    setBusy('remove');
    setError('');
    setTestResult(null);
    try {
      await deleteDoc(doc(db, 'clubs', clubId, 'private', 'webhook'));
    } catch (err) {
      setError(errorMessage(err, 'Could not remove the webhook.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    setBusy('test');
    setError('');
    setTestResult(null);
    try {
      const result = await httpsCallable<{ clubId: string }, TestResult>(functions, 'sendTestWebhook')({ clubId });
      setTestResult(result.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not send the test message.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Completed Game Webhook</h2>
      <p className={common.blurb}>
        Post each result to a Slack or Discord channel, or to your own server, as soon as Finish
        Game is tapped on a scoreboard. Paste the channel's incoming webhook URL here.
      </p>

      {enteringUrl ? (
        <label className={styles.field}>
          Webhook URL
          <input
            className={common.input}
            type="url"
            placeholder="https://hooks.slack.com/services/…"
            maxLength={MAX_URL_LENGTH}
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      ) : (
        <div className={styles.savedUrl}>
          <code>{maskUrl(saved.url)}</code>
          <button className={common.linkButton} onClick={() => setEditingUrl(true)}>Replace URL</button>
        </div>
      )}
      {urlInvalid && <p className={common.warning}>The URL must start with https://.</p>}

      <fieldset className={styles.choices}>
        <legend>Post</legend>
        {GAMES_CHOICES.map((choice) => (
          <label key={choice.value} className={styles.choice}>
            <input
              type="radio"
              name={`webhook-games-${clubId}`}
              checked={games === choice.value}
              onChange={() => setGames(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </fieldset>

      <div className={styles.actions}>
        <button className={common.primaryButton} onClick={handleSave} disabled={!canSave}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        {editingUrl && (
          <button className={common.ghostButton} onClick={() => { setEditingUrl(false); setUrl(''); }}>
            Cancel
          </button>
        )}
        {saved && !editingUrl && (
          <>
            <button className={common.ghostButton} onClick={handleTest} disabled={busy !== null || changed}>
              {busy === 'test' ? 'Sending…' : 'Send Test'}
            </button>
            <button className={common.ghostButton} onClick={handleRemove} disabled={busy !== null}>
              Remove
            </button>
          </>
        )}
      </div>

      {error && <p className={common.error}>{error}</p>}
      {testResult && (testResult.ok
        ? <p className={common.success}>Test message delivered. Check the channel for it.</p>
        : <p className={common.error}>Test message failed. {testResult.error}</p>)}
      {saved && status && !testResult && (
        <p className={styles.status}>{describeStatus(status)}</p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import { useUnsavedChanges } from '../../lib/unsavedChanges';
import {
  DEFAULT_TEMPLATE, MAX_TEMPLATE_LENGTH, MESSAGE_VARIABLES, previewTemplate, unknownVariables,
} from '../../lib/webhookMessage';
import type { WebhookGames, WebhookStatus } from '../../types';
import common from '../../styles/common.module.css';
import styles from './WebhookSection.module.css';

interface Props {
  clubId: string;
}

interface Saved {
  url: string;
  games: WebhookGames;
  /** Absent when the default message is used. */
  template?: string;
  /** Absent on webhooks saved before messages had dates, which post in UTC. */
  timeZone?: string;
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

const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Every zone the browser knows, with the browser's own and the saved one in
// case either is missing from the list.
function timeZoneChoices(saved: string | undefined): string[] {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = new Set(supportedValuesOf?.('timeZone') ?? []);
  zones.add(BROWSER_TIME_ZONE);
  if (saved) zones.add(saved);
  return [...zones].sort();
}

/** What is stored for the template: nothing when it is the default. */
function templateToSave(template: string): string | undefined {
  return template.trim() === '' || template === DEFAULT_TEMPLATE ? undefined : template;
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
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [timeZone, setTimeZone] = useState(BROWSER_TIME_ZONE);
  const templateRef = useRef<HTMLTextAreaElement>(null);
  // The saved URL is shown masked until the admin asks to replace it.
  const [editingUrl, setEditingUrl] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'webhook'), (snap) => {
      const data = snap.data();
      const next: Saved | null = typeof data?.url === 'string' && data.url
        ? {
            url: data.url,
            games: data.games === 'league' ? 'league' : 'all',
            ...(typeof data.template === 'string' && data.template.trim() !== '' && { template: data.template }),
            ...(typeof data.timeZone === 'string' && data.timeZone !== '' && { timeZone: data.timeZone }),
          }
        : null;
      setSaved(next);
      setUrl('');
      setGames(next?.games ?? 'all');
      setTemplate(next?.template ?? DEFAULT_TEMPLATE);
      setTimeZone(next?.timeZone ?? BROWSER_TIME_ZONE);
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
  const settingsChanged = games !== (saved?.games ?? 'all')
    || templateToSave(template) !== saved?.template
    || timeZone !== (saved?.timeZone ?? BROWSER_TIME_ZONE);
  const changed = (enteringUrl && trimmedUrl !== '') || settingsChanged;
  // A new webhook needs its URL; a saved one keeps its own unless replaced.
  const canSave = changed && (saved !== null || trimmedUrl !== '') && !urlInvalid && busy === null;
  const misspelled = unknownVariables(template);

  useUnsavedChanges(changed);

  async function handleSave() {
    setBusy('save');
    setError('');
    setTestResult(null);
    try {
      const savedTemplate = templateToSave(template);
      await setDoc(doc(db, 'clubs', clubId, 'private', 'webhook'), {
        url: enteringUrl && trimmedUrl !== '' ? trimmedUrl : saved!.url,
        games,
        ...(savedTemplate !== undefined && { template: savedTemplate }),
        timeZone,
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not save the webhook.'));
    } finally {
      setBusy(null);
    }
  }

  // Puts the variable where the cursor is, or in place of the selection.
  function insertVariable(name: string) {
    const textarea = templateRef.current;
    const start = textarea?.selectionStart ?? template.length;
    const end = textarea?.selectionEnd ?? template.length;
    const token = `{${name}}`;
    setTemplate(template.slice(0, start) + token + template.slice(end));
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
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

      <label className={styles.field}>
        Message
        <textarea
          ref={templateRef}
          className={`${common.input} ${styles.template}`}
          rows={3}
          maxLength={MAX_TEMPLATE_LENGTH}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
      </label>
      <div className={styles.templateTools}>
        <span className={styles.hint}>
          Click a variable to add it where the cursor is. The game's details are posted alongside
          the message for servers that read them.
        </span>
        {template !== DEFAULT_TEMPLATE && (
          <button className={common.linkButton} onClick={() => setTemplate(DEFAULT_TEMPLATE)}>
            Reset to default
          </button>
        )}
      </div>
      <div className={styles.variables}>
        {MESSAGE_VARIABLES.map((group) => (
          <div key={group.title} className={styles.variableGroup}>
            <span className={styles.variableGroupTitle}>{group.title}</span>
            <div className={styles.variableChips}>
              {group.variables.map((variable) => (
                <button
                  key={variable.name}
                  type="button"
                  className={styles.variableChip}
                  title={`${variable.description}, e.g. ${variable.sample}`}
                  onClick={() => insertVariable(variable.name)}
                >
                  {`{${variable.name}}`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {misspelled.length > 0 && (
        <p className={common.warning}>
          Not a variable, so it will be posted as written: {misspelled.map((name) => `{${name}}`).join(', ')}
        </p>
      )}
      <div className={styles.preview}>
        <span className={styles.previewLabel}>Preview</span>
        <p className={styles.previewText}>
          {template.trim() === '' ? previewTemplate(DEFAULT_TEMPLATE) : previewTemplate(template)}
        </p>
      </div>

      <label className={styles.field}>
        Time zone for dates and times
        <select
          className={`${common.input} ${styles.timeZone}`}
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
        >
          {timeZoneChoices(saved?.timeZone).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </label>
      {saved && !saved.timeZone && (
        <p className={styles.hint}>Games are posted with times in UTC until you save a time zone.</p>
      )}

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

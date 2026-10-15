import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, scoreboardSiteUrl } from '../../lib/firebase';
import {
  DEFAULT_EVERY, DEFAULT_SETTINGS, MAX_EVERY, MIN_EVERY, describeSettings, displayUrl, settingsToSave,
  type BugLabel, type DisplaySettings, type DisplayView,
} from '../../lib/displayLinks';
import { errorMessage, formatAgo } from '../../lib/format';
import type { DisplayLink, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import styles from './DisplaysSection.module.css';

interface Props {
  clubId: string;
  sheets: Sheet[];
}

// Matches the limit in the createDisplayLink function and firestore.rules.
const MAX_LABEL_LENGTH = 60;

interface LinkResult {
  linkId: string;
  token: string;
}

/** The link being edited, with its token while that can still be shown. */
interface Editing {
  link: DisplayLink;
  token?: string;
}

function describeUse(link: DisplayLink, now: Date): string {
  const created = link.createdAt
    ? `created ${link.createdAt.toDate().toLocaleDateString(undefined, { dateStyle: 'medium' })}`
    : 'created just now';
  const used = link.lastUsedAt ? `last used ${formatAgo(link.lastUsedAt.toDate(), now)}` : 'never used';
  return `${created}, ${used}`;
}

/** Links for the club's score bug and warm room screens. Each screen has its
 *  own, so one can be changed or removed without affecting the others. */
export function DisplaysSection({ clubId, sheets }: Props) {
  const [links, setLinks] = useState<DisplayLink[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  // Re-read each minute so "last used" stays current while the page is open.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'clubs', clubId, 'displayLinks'), orderBy('label'));
    return onSnapshot(q, (snap) => {
      setLinks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DisplayLink, 'id'>) })));
    });
  }, [clubId]);

  const sheetName = (sheetId: string) => sheets.find((sheet) => sheet.id === sheetId)?.name;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy('create');
    setError('');
    try {
      const result = await httpsCallable<{ clubId: string; label: string }, LinkResult>(
        functions, 'createDisplayLink',
      )({ clubId, label: trimmed });
      setEditing({
        link: { id: result.data.linkId, label: trimmed, settings: DEFAULT_SETTINGS },
        token: result.data.token,
      });
      setLabel('');
    } catch (err) {
      setError(errorMessage(err, 'Could not create the link.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleReset(link: DisplayLink) {
    if (!confirm(`Give "${link.label}" a new URL? Screens using the current one stop within the hour.`)) return;
    setBusy(link.id);
    setError('');
    try {
      const result = await httpsCallable<{ clubId: string; linkId: string }, LinkResult>(
        functions, 'resetDisplayLink',
      )({ clubId, linkId: link.id });
      setEditing({ link, token: result.data.token });
    } catch (err) {
      setError(errorMessage(err, 'Could not give the link a new URL.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(link: DisplayLink) {
    if (!confirm(`Remove "${link.label}"? A screen using it stops updating within the hour.`)) return;
    setBusy(link.id);
    setError('');
    try {
      await httpsCallable(functions, 'revokeDisplayLink')({ clubId, linkId: link.id });
    } catch (err) {
      setError(errorMessage(err, 'Could not remove the link.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Displays</h2>
      <p className={common.blurb}>
        Show live scores on a screen in the warm room, or as a score bug in an OBS live stream.
        Make a link for each screen. What a link shows can be changed here at any time, and its
        screens follow without anyone touching them. Anyone with a link can see the club's scores.
      </p>

      <form className={styles.createForm} onSubmit={handleCreate}>
        <input
          className={common.input}
          placeholder="Name, e.g. Warm room TV"
          aria-label="Display link name"
          maxLength={MAX_LABEL_LENGTH}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" className={common.primaryButton} disabled={busy !== null || label.trim() === ''}>
          {busy === 'create' ? 'Creating…' : 'Create Link'}
        </button>
      </form>

      {links.length === 0 ? (
        <p className={common.empty}>No display links yet.</p>
      ) : (
        <div className={common.list}>
          {links.map((link) => (
            <div key={link.id} className={common.row}>
              <div className={common.rowInfo}>
                <span className={common.rowName}>{link.label}</span>
                <span className={common.rowMeta}>{describeSettings(link.settings, sheetName)}</span>
                <span className={common.rowMeta}>{describeUse(link, now)}</span>
              </div>
              <div className={common.rowActions}>
                <button className={common.ghostButton} onClick={() => setEditing({ link })} disabled={busy !== null}>
                  Edit
                </button>
                <button className={common.ghostButton} onClick={() => handleReset(link)} disabled={busy !== null}>
                  New URL
                </button>
                <button className={common.ghostButton} onClick={() => handleRemove(link)} disabled={busy !== null}>
                  {busy === link.id ? 'Working…' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className={common.error}>{error}</p>}

      {editing && (
        <DisplayLinkDialog
          clubId={clubId}
          sheets={sheets}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const SIZES = [
  { value: 0.75, label: 'Small' },
  { value: 1, label: 'Normal' },
  { value: 1.5, label: 'Large' },
  { value: 2, label: 'Extra large' },
];

const BUG_LABELS: { value: BugLabel; label: string }[] = [
  { value: 'sheet', label: 'The sheet name' },
  { value: 'league', label: 'The league name' },
  { value: 'none', label: 'Nothing' },
];

const VIEWS: { value: DisplayView; label: string }[] = [
  { value: 'totals', label: 'Total scores' },
  { value: 'full', label: 'End by end' },
  { value: 'cycle', label: 'Both, in turn' },
];

interface DialogProps {
  clubId: string;
  sheets: Sheet[];
  editing: Editing;
  onClose: () => void;
}

/** Edits a link's name and what it shows, and shows a new link's URL while
 *  it can be: the token is not stored, so this is the only chance to copy it. */
function DisplayLinkDialog({ clubId, sheets, editing, onClose }: DialogProps) {
  const { link, token } = editing;
  // What is stored, kept here since the dialog stays open after saving
  // while a new link's URL is on screen.
  const [saved, setSaved] = useState({ label: link.label, settings: link.settings ?? DEFAULT_SETTINGS });
  const [label, setLabel] = useState(link.label);
  const [settings, setSettings] = useState<DisplaySettings>(saved.settings);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toSave = settingsToSave(settings);
  const trimmedLabel = label.trim();
  const changed = trimmedLabel !== saved.label
    || JSON.stringify(toSave) !== JSON.stringify(settingsToSave(saved.settings));
  const url = token ? displayUrl(scoreboardSiteUrl, clubId, token) : null;
  // 'warmRoom', or the ID of the sheet whose score bug to show.
  const shows = settings.page === 'bug' && settings.sheetId ? settings.sheetId : 'warmRoom';

  function choosePage(value: string) {
    setSettings(value === 'warmRoom'
      ? { ...settings, page: 'warm-room' }
      : { ...settings, page: 'bug', sheetId: value });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'clubs', clubId, 'displayLinks', link.id), { label: trimmedLabel, settings: toSave });
      setSaved({ label: trimmedLabel, settings: toSave });
      if (!url) onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the link.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the URL is on screen to copy by hand.
    }
  }

  function handleClose() {
    if (url && !copied && !confirm('Close without copying the URL? It cannot be shown again.')) return;
    if (changed && !confirm('Close without saving your changes?')) return;
    onClose();
  }

  return (
    <div className={common.modal}>
      <div className={`${common.modalCard} ${common.wideModalCard}`}>
        <h2 className={common.modalTitle}>{token && !link.createdAt ? 'New display link' : link.label}</h2>
        <div className={common.form}>
          {url && (
            <>
              <code className={styles.url}>{url}</code>
              <div className={styles.urlActions}>
                <button className={common.primaryButton} onClick={handleCopy}>
                  {copied ? 'Copied' : 'Copy URL'}
                </button>
                <a className={common.ghostButton} href={url} target="_blank" rel="noopener noreferrer">Open</a>
              </div>
              <p className={common.warning}>
                Copy the URL now: it is not shown again. Put it on the screen, or add it to OBS as a
                Browser source. It never needs to change: the screen follows whatever this link is
                set to show below.
              </p>
            </>
          )}

          <label className={styles.field}>
            Name
            <input
              className={common.input}
              maxLength={MAX_LABEL_LENGTH}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            Shows
            <select className={common.input} value={shows} onChange={(e) => choosePage(e.target.value)}>
              <option value="warmRoom">Warm room screen, every sheet</option>
              {sheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>Score bug for {sheet.name}</option>
              ))}
            </select>
          </label>

          {toSave.page === 'warm-room' ? (
            <div className={styles.options}>
              <label className={styles.field}>
                View
                <select
                  className={common.input}
                  value={settings.view ?? 'totals'}
                  onChange={(e) => setSettings({ ...settings, view: e.target.value as DisplayView })}
                >
                  {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </label>
              {settings.view === 'cycle' && (
                <label className={styles.field}>
                  Seconds on each
                  <input
                    className={common.input}
                    type="number"
                    min={MIN_EVERY}
                    max={MAX_EVERY}
                    value={settings.every ?? DEFAULT_EVERY}
                    onChange={(e) => setSettings({ ...settings, every: Number(e.target.value) || DEFAULT_EVERY })}
                  />
                </label>
              )}
            </div>
          ) : (
            <div className={styles.options}>
              <label className={styles.field}>
                Size
                <select
                  className={common.input}
                  value={settings.scale ?? 1}
                  onChange={(e) => setSettings({ ...settings, scale: Number(e.target.value) })}
                >
                  {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                Under the scores
                <select
                  className={common.input}
                  value={settings.label ?? 'sheet'}
                  onChange={(e) => setSettings({ ...settings, label: e.target.value as BugLabel })}
                >
                  {BUG_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </label>
            </div>
          )}

          {error && <p className={common.error}>{error}</p>}
          <div className={common.modalActions}>
            <button className={common.ghostButton} onClick={handleClose}>{url ? 'Done' : 'Cancel'}</button>
            <button
              className={common.primaryButton}
              onClick={handleSave}
              disabled={!changed || saving || trimmedLabel === ''}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

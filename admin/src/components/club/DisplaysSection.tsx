import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, scoreboardSiteUrl } from '../../lib/firebase';
import { displayUrl, type DisplayPage } from '../../lib/displayLinks';
import { errorMessage, formatAgo } from '../../lib/format';
import type { DisplayLink, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import styles from './DisplaysSection.module.css';

interface Props {
  clubId: string;
  sheets: Sheet[];
}

// Matches the limit in the createDisplayLink function.
const MAX_LABEL_LENGTH = 60;

/** A link that has just been made, while its token can still be shown. */
interface NewLink {
  label: string;
  token: string;
}

function describeUse(link: DisplayLink, now: Date): string {
  const created = link.createdAt
    ? `Created ${link.createdAt.toDate().toLocaleDateString(undefined, { dateStyle: 'medium' })}`
    : 'Created just now';
  const used = link.lastUsedAt ? `last used ${formatAgo(link.lastUsedAt.toDate(), now)}` : 'never used';
  return `${created}, ${used}`;
}

/** Links for the club's score bug and warm room screens. Each screen signs in
 *  with its own, so one can be removed without touching the others. */
export function DisplaysSection({ clubId, sheets }: Props) {
  const [links, setLinks] = useState<DisplayLink[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [newLink, setNewLink] = useState<NewLink | null>(null);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy('create');
    setError('');
    try {
      const result = await httpsCallable<{ clubId: string; label: string }, { linkId: string; token: string }>(
        functions, 'createDisplayLink',
      )({ clubId, label: trimmed });
      setNewLink({ label: trimmed, token: result.data.token });
      setLabel('');
    } catch (err) {
      setError(errorMessage(err, 'Could not create the link.'));
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
        Make a link for each screen, so any one of them can be removed without affecting the
        others. Anyone with a link can see the club's scores.
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
                <span className={common.rowMeta}>{describeUse(link, now)}</span>
              </div>
              <div className={common.rowActions}>
                <button
                  className={common.ghostButton}
                  onClick={() => handleRemove(link)}
                  disabled={busy !== null}
                >
                  {busy === link.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className={common.error}>{error}</p>}

      {newLink && (
        <NewLinkDialog clubId={clubId} sheets={sheets} link={newLink} onClose={() => setNewLink(null)} />
      )}
    </div>
  );
}

interface DialogProps {
  clubId: string;
  sheets: Sheet[];
  link: NewLink;
  onClose: () => void;
}

/** Shows the new link's URL for the page the screen will show. The token is
 *  not stored, so this is the only chance to copy it. */
function NewLinkDialog({ clubId, sheets, link, onClose }: DialogProps) {
  // 'warmRoom', or the ID of the sheet whose score bug to show.
  const [choice, setChoice] = useState('warmRoom');
  const [copied, setCopied] = useState(false);

  const page: DisplayPage = choice === 'warmRoom' ? { kind: 'warmRoom' } : { kind: 'scoreBug', sheetId: choice };
  const url = displayUrl(scoreboardSiteUrl, clubId, page, link.token);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the URL is on screen to copy by hand.
    }
  }

  function handleClose() {
    if (!copied && !confirm('Close without copying? The link cannot be shown again.')) return;
    onClose();
  }

  return (
    <div className={common.modal}>
      <div className={`${common.modalCard} ${common.wideModalCard}`}>
        <h2 className={common.modalTitle}>{link.label}</h2>
        <div className={common.form}>
          <label className={styles.field}>
            Show
            <select
              className={common.input}
              value={choice}
              onChange={(e) => { setChoice(e.target.value); setCopied(false); }}
            >
              <option value="warmRoom">Warm room screen, every sheet</option>
              {sheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>Score bug for {sheet.name}</option>
              ))}
            </select>
          </label>
          <code className={styles.url}>{url}</code>
          <div className={styles.urlActions}>
            <button className={common.primaryButton} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy URL'}
            </button>
            <a className={common.ghostButton} href={url} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </div>
          <p className={common.warning}>
            Copy the URL now: it is not shown again. The same link works for any of these pages,
            so pick another and copy that too if you need it. For a score bug, add the URL to OBS
            as a Browser source.
          </p>
          <div className={common.modalActions}>
            <button className={common.ghostButton} onClick={handleClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

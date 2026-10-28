import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, scoreboardSiteUrl } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import common from '../../styles/common.module.css';
import styles from './PublicScoresSection.module.css';

interface Props {
  clubId: string;
}

/** The public scores page's address for [clubId]. */
export function publicScoresUrl(siteUrl: string, clubId: string): string {
  return `${siteUrl}/display/${encodeURIComponent(clubId)}/scores`;
}

/** Turns the club's public scores page, for members' phones, on and off.
 *  It needs no link: anyone with the address can follow the club's games. */
export function PublicScoresSection({ clubId }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const url = publicScoresUrl(scoreboardSiteUrl, clubId);

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'publicScores'), (snap) => {
      setEnabled(snap.get('enabled') === true);
    });
  }, [clubId]);

  async function handleToggle(next: boolean) {
    setBusy(true);
    setError('');
    try {
      await setDoc(doc(db, 'clubs', clubId, 'private', 'publicScores'), { enabled: next });
    } catch (err) {
      setError(errorMessage(err, 'Could not change the public scores page.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the address. Select it and copy it instead.');
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Public Scores Page</h2>
      <p className={common.blurb}>
        A page for members to follow every sheet on their phones, with the day's results. Anyone
        with the address can see it, team names included. It updates about every half minute.
      </p>

      <label className={common.checkboxLabel}>
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null || busy}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        Turn on the public scores page
      </label>

      {enabled && (
        <div className={styles.urlRow}>
          <code className={styles.url}>{url}</code>
          <button className={common.ghostButton} onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a className={common.linkButton} href={url} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      )}
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

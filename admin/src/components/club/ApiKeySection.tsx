import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generateApiKey } from '../../lib/credentials';
import { errorMessage } from '../../lib/format';
import common from '../../styles/common.module.css';
import styles from './ApiKeySection.module.css';

interface Props {
  clubId: string;
  canRegenerate: boolean;
}

/** The club's REST API key, and a switch to turn the club's API off. Only
 *  super admins may replace the key; club admins may use the switch. */
export function ApiKeySection({ clubId, canRegenerate }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keyRef = doc(db, 'clubs', clubId, 'private', 'apiKey');

  // The API key is kept out of the club doc in a subcollection that only the
  // club's admins can read.
  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'apiKey'), (snap) => {
      setApiKey((snap.get('key') as string | undefined) ?? null);
      setEnabled(snap.get('enabled') !== false);
    });
  }, [clubId]);

  async function handleRegenerate() {
    if (!confirm(
      'Regenerate API key? Existing integrations using the current key will break. '
      + 'The new key starts working, and the old one stops, within a minute.',
    )) return;
    try {
      // Merged, so a club whose API is switched off stays off.
      await setDoc(keyRef, { key: generateApiKey() }, { merge: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not regenerate the API key.'));
    }
  }

  async function handleToggle(next: boolean) {
    if (!next && !confirm(
      'Turn off the API for this club? Every integration using it, such as your website or '
      + 'streaming tool, gets an error until you turn it back on. The key stays the same.',
    )) return;
    setBusy(true);
    setError('');
    try {
      await setDoc(keyRef, { enabled: next }, { merge: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not change the API switch.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>API Access</h2>
      <p className={common.blurb}>
        Read the club's live and recent games from your own website or tools.{' '}
        <a href="https://curlingscoreboard.app/api-docs/" target="_blank" rel="noopener noreferrer">
          API documentation
        </a>
      </p>
      <div className={styles.apiKeyRow}>
        <code className={styles.apiKey}>{apiKey || '—'}</code>
        {canRegenerate && (
          <>
            <button className={common.ghostButton} onClick={handleRegenerate}>
              Regenerate Key
            </button>
            <span className={common.adminTag}>Super admin</span>
          </>
        )}
      </div>
      <label className={common.checkboxLabel}>
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null || apiKey === null || busy}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        Turn on the API
      </label>
      {enabled === false && (
        <p className={common.blurb}>
          The API is off. Integrations get an error until it is turned back on, within a minute
          of ticking the box.
        </p>
      )}
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

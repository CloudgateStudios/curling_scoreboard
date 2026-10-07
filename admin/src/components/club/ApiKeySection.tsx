import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generateApiKey } from '../../lib/credentials';
import { errorMessage } from '../../lib/format';
import styles from '../../pages/ClubDetail.module.css';

interface Props {
  clubId: string;
  canRegenerate: boolean;
}

/** The club's REST API key. Only super admins may replace it. */
export function ApiKeySection({ clubId, canRegenerate }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  // The API key is kept out of the club doc in a subcollection that only the
  // club's admins can read.
  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'apiKey'), (snap) => {
      setApiKey((snap.get('key') as string | undefined) ?? null);
    });
  }, [clubId]);

  async function handleRegenerate() {
    if (!confirm('Regenerate API key? Existing integrations using the current key will break.')) return;
    try {
      await setDoc(doc(db, 'clubs', clubId, 'private', 'apiKey'), { key: generateApiKey() });
    } catch (err) {
      setError(errorMessage(err, 'Could not regenerate the API key.'));
    }
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>API Access</h2>
      <p className={styles.apiDocsBlurb}>
        Want to know how to use the API?{' '}
        <a href="https://curlingscoreboard.app/api-docs/" target="_blank" rel="noopener noreferrer">
          View the API documentation
        </a>
      </p>
      <div className={styles.apiKeyRow}>
        <code className={styles.apiKey}>{apiKey || '—'}</code>
        {canRegenerate && (
          <button className={styles.ghostButton} onClick={handleRegenerate}>
            Regenerate Key
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

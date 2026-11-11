import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import { BROWSER_TIME_ZONE, timeZoneChoices } from '../../lib/timeZones';
import { useUnsavedChanges } from '../../lib/unsavedChanges';
import common from '../../styles/common.module.css';
import styles from './TimeZoneSection.module.css';

interface Props {
  clubId: string;
}

/** The club's time zone. League and bonspiel times are written in it, and
 *  the functions need it to tell what is on the ice now. */
export function TimeZoneSection({ clubId }: Props) {
  // Undefined until the setting is known; null when the club has none.
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState(BROWSER_TIME_ZONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'config', 'club'), (snap) => {
      const timeZone = snap.get('timeZone');
      const next = typeof timeZone === 'string' && timeZone !== '' ? timeZone : null;
      setSaved(next);
      // A club with none is offered the admin's own zone, as the webhook is.
      setDraft(next ?? BROWSER_TIME_ZONE);
    });
  }, [clubId]);

  const changed = saved !== undefined && draft !== saved;

  // The zone offered to a club with none is a suggestion, not an edit, so it
  // only counts as unsaved once the admin picks another.
  useUnsavedChanges(saved !== undefined && draft !== (saved ?? BROWSER_TIME_ZONE), {
    label: 'the time zone',
    save: handleSave,
    discard: () => setDraft(saved ?? BROWSER_TIME_ZONE),
  });

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'clubs', clubId, 'config', 'club'), { timeZone: draft }, { merge: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not save the time zone.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Time Zone</h2>
      <p className={common.blurb}>
        Where your club is. League and bonspiel times are in this zone, and the API uses it to work
        out what is on each sheet now, for stream titles.
      </p>

      <div className={styles.row}>
        <select
          className={`${common.input} ${styles.select}`}
          aria-label="Time zone"
          value={draft}
          disabled={saved === undefined}
          onChange={(e) => setDraft(e.target.value)}
        >
          {timeZoneChoices(saved ?? undefined).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>
        <button className={common.primaryButton} onClick={handleSave} disabled={saving || !changed}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {saved === null && (
        <p className={common.warning}>
          No time zone is saved yet. Until one is, stream titles from the API need the local time sent
          with each request.
        </p>
      )}
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CLOCKS, DEFAULT_CLOCK, clockOf, type Clock } from '../../lib/clock';
import { errorMessage } from '../../lib/format';
import { BROWSER_TIME_ZONE, timeZoneChoices } from '../../lib/timeZones';
import { useUnsavedChanges } from '../../lib/unsavedChanges';
import common from '../../styles/common.module.css';
import styles from './TimeZoneSection.module.css';

interface Props {
  clubId: string;
}

interface Saved {
  /** Null when the club has none. */
  timeZone: string | null;
  clock: Clock;
}

/** The club's time zone and clock. League and bonspiel times are written in
 *  the zone, and the functions need it to tell what is on the ice now. The
 *  clock is how times are shown here and on the club's screens. */
export function TimeZoneSection({ clubId }: Props) {
  // Undefined until the settings are known.
  const [saved, setSaved] = useState<Saved | undefined>(undefined);
  const [zone, setZone] = useState(BROWSER_TIME_ZONE);
  const [clock, setClock] = useState<Clock>(DEFAULT_CLOCK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'config', 'club'), (snap) => {
      const timeZone = snap.get('timeZone');
      const next: Saved = {
        timeZone: typeof timeZone === 'string' && timeZone !== '' ? timeZone : null,
        clock: clockOf(snap.get('clock')),
      };
      setSaved(next);
      // A club with no zone is offered the admin's own, as the webhook is.
      setZone(next.timeZone ?? BROWSER_TIME_ZONE);
      setClock(next.clock);
    });
  }, [clubId]);

  const zoneChanged = saved !== undefined && zone !== saved.timeZone;
  const clockChanged = saved !== undefined && clock !== saved.clock;

  // The zone offered to a club with none is a suggestion, not an edit, so it
  // only counts as unsaved once the admin picks another.
  useUnsavedChanges(
    saved !== undefined && (zone !== (saved.timeZone ?? BROWSER_TIME_ZONE) || clockChanged),
    {
      label: 'the time zone',
      save: handleSave,
      discard: () => {
        setZone(saved?.timeZone ?? BROWSER_TIME_ZONE);
        setClock(saved?.clock ?? DEFAULT_CLOCK);
      },
    },
  );

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'clubs', clubId, 'config', 'club'), { timeZone: zone, clock }, { merge: true });
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
        out what is on each sheet now, for stream titles. The clock is how times are shown here, on
        the club's screens and on the public scores page.
      </p>

      <div className={styles.row}>
        <select
          className={`${common.input} ${styles.select}`}
          aria-label="Time zone"
          value={zone}
          disabled={saved === undefined}
          onChange={(e) => setZone(e.target.value)}
        >
          {timeZoneChoices(saved?.timeZone ?? undefined).map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <select
          className={`${common.input} ${styles.clock}`}
          aria-label="Clock"
          value={clock}
          disabled={saved === undefined}
          onChange={(e) => setClock(e.target.value as Clock)}
        >
          {CLOCKS.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.example})</option>)}
        </select>
        <button className={common.primaryButton} onClick={handleSave} disabled={saving || !(zoneChanged || clockChanged)}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {saved?.timeZone === null && (
        <p className={common.warning}>
          No time zone is saved yet. Until one is, stream titles from the API need the local time sent
          with each request.
        </p>
      )}
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

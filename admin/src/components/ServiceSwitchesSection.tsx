import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { errorMessage } from '../lib/format';
import common from '../styles/common.module.css';

/** The switches in adminConfig/switches, which the functions read; see
 *  functions/src/switches.ts. Each is on unless set to false. */
const SWITCHES = [
  {
    name: 'api',
    label: 'REST API',
    detail: 'Every club\'s website and streaming tool integrations get an error.',
  },
  {
    name: 'scoresPage',
    label: 'Public scores pages',
    detail: 'Every club\'s page shows itself offline and keeps trying.',
  },
  {
    name: 'displaySessions',
    label: 'Display sign-ins',
    detail: 'No display can sign in with its link. Displays already showing carry on.',
  },
  {
    name: 'pairing',
    label: 'Scoreboard pairing',
    detail: 'No scoreboard can connect to a sheet or disconnect from one. Scoring carries on.',
  },
] as const;

type SwitchName = (typeof SWITCHES)[number]['name'];

/** Turns public parts of the service off for every club at once, when one
 *  is being flooded or misused. For a single club, use the club's own
 *  settings instead. */
export function ServiceSwitchesSection() {
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = doc(db, 'adminConfig', 'switches');

  useEffect(() => {
    return onSnapshot(
      doc(db, 'adminConfig', 'switches'),
      (snap) => setValues(snap.data() ?? {}),
      (err) => setError(errorMessage(err, 'Could not read the service switches.')),
    );
  }, []);

  async function handleToggle(name: SwitchName, label: string, next: boolean) {
    if (!next && !confirm(`Turn off ${label} for every club?`)) return;
    setBusy(true);
    setError('');
    try {
      await setDoc(ref, { [name]: next }, { merge: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not change the switch.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Service Switches</h2>
      <p className={common.blurb}>
        For when something is being flooded or misused. Each turns a part of the service off for
        every club within half a minute. Scoring on the sheets always carries on.
      </p>
      {SWITCHES.map(({ name, label, detail }) => {
        const on = values?.[name] !== false;
        return (
          <div key={name}>
            <label className={common.checkboxLabel}>
              <input
                type="checkbox"
                checked={values !== null && on}
                disabled={values === null || busy}
                onChange={(e) => handleToggle(name, label, e.target.checked)}
              />
              {label}
            </label>
            <p className={common.blurb}>{on ? `When off: ${detail}` : `Off now. ${detail}`}</p>
          </div>
        );
      })}
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

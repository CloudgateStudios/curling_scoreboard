import { useEffect, useState } from 'react';
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
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
  const [address, setAddress] = useState('');
  const ref = doc(db, 'adminConfig', 'switches');
  const blocked = Array.isArray(values?.['blockedIps'])
    ? (values['blockedIps'] as unknown[]).filter((ip): ip is string => typeof ip === 'string')
    : [];

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

  async function changeBlocked(change: ReturnType<typeof arrayUnion>, failed: string) {
    setBusy(true);
    setError('');
    try {
      await setDoc(ref, { blockedIps: change }, { merge: true });
      return true;
    } catch (err) {
      setError(errorMessage(err, failed));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault();
    const ip = address.trim();
    if (!ip) return;
    if (await changeBlocked(arrayUnion(ip), 'Could not block the address.')) setAddress('');
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

      <h3>Blocked addresses</h3>
      <p className={common.blurb}>
        For a single caller found in the logs. An address here is turned away from the REST API,
        display sign-ins and scoreboard pairing within half a minute. The logs can show two
        addresses for a request: block the caller's, not a Google server's. The runbook in
        docs/architecture/monitoring.md says how to tell them apart.
      </p>
      {blocked.map((ip) => (
        <div key={ip} className={common.row}>
          <code>{ip}</code>
          <button
            className={common.ghostButton}
            disabled={busy}
            onClick={() => changeBlocked(arrayRemove(ip), 'Could not unblock the address.')}
          >
            Unblock
          </button>
        </div>
      ))}
      <form onSubmit={handleBlock} className={common.inlineForm}>
        <input
          className={common.input}
          placeholder="IP address, such as 203.0.113.7"
          aria-label="IP address to block"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button className={common.ghostButton} type="submit" disabled={busy || values === null || !address.trim()}>
          Block
        </button>
      </form>
      {error && <p className={common.error}>{error}</p>}
    </div>
  );
}

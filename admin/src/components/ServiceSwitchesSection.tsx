import { useEffect, useState } from 'react';
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { errorMessage } from '../lib/format';
import { PageHeader } from './PageHeader';
import common from '../styles/common.module.css';
import styles from './ServiceSwitchesSection.module.css';

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

  const offCount = values === null ? 0 : SWITCHES.filter(({ name }) => values[name] === false).length;

  return (
    <section className={styles.area} aria-labelledby="service-heading">
      <PageHeader
        title={<span id="service-heading">Service controls</span>}
        subtitle="For when something is being flooded or misused. Changes reach every club within half a minute. Scoring on the sheets always carries on."
      />

      <div className={styles.grid}>
        <div className={`${common.section} ${styles.card}`}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Service switches</h3>
            {values !== null && (
              <span className={offCount ? common.errorChip : common.onlineChip}>
                {offCount ? `${offCount} off` : 'All on'}
              </span>
            )}
          </div>
          <ul className={styles.switchList}>
            {SWITCHES.map(({ name, label, detail }) => {
              const on = values?.[name] !== false;
              const id = `switch-${name}`;
              return (
                <li key={name} className={`${styles.switchRow} ${on ? '' : styles.switchRowOff}`}>
                  <div className={styles.switchText}>
                    <label htmlFor={id} className={styles.switchLabel}>
                      {label}
                    </label>
                    <span className={styles.switchDetail}>
                      {on ? <>When off: {detail}</> : <><strong>Off now.</strong> {detail}</>}
                    </span>
                  </div>
                  <input
                    id={id}
                    type="checkbox"
                    role="switch"
                    className={styles.toggle}
                    checked={values !== null && on}
                    disabled={values === null || busy}
                    onChange={(e) => handleToggle(name, label, e.target.checked)}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${common.section} ${styles.card}`}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Blocked addresses</h3>
            {blocked.length > 0 && <span className={common.errorChip}>{blocked.length} blocked</span>}
          </div>
          <p className={styles.cardBlurb}>
            For a single caller found in the logs. A blocked address is turned away from the REST
            API, display sign-ins and scoreboard pairing.
          </p>
          <form onSubmit={handleBlock} className={styles.blockForm}>
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
          <p className={styles.hint}>
            The logs can show two addresses for a request. Block the caller's, not a Google
            server's; the runbook in <code>docs/architecture/monitoring.md</code> says how to tell
            them apart.
          </p>
          {blocked.length === 0 ? (
            <p className={styles.emptyList}>No addresses are blocked.</p>
          ) : (
            <ul className={styles.blockedList}>
              {blocked.map((ip) => (
                <li key={ip} className={styles.blockedRow}>
                  <code className={styles.ip}>{ip}</code>
                  <button
                    className={common.linkButton}
                    disabled={busy}
                    onClick={() => changeBlocked(arrayRemove(ip), 'Could not unblock the address.')}
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {error && <p className={common.error}>{error}</p>}
    </section>
  );
}

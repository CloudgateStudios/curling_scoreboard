import { useState } from 'react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { SecretField } from '../components/SecretField';
import { PageHeader } from '../components/PageHeader';
import { SystemShell } from '../components/SystemShell';
import { clubPath } from '../lib/clubPaths';
import { generatePassword, generatePin } from '../lib/credentials';
import { db, functions } from '../lib/firebase';
import { errorMessage } from '../lib/format';
import { BROWSER_TIME_ZONE, timeZoneChoices } from '../lib/timeZones';
import { welcomeMessage } from '../lib/welcome';
import common from '../styles/common.module.css';
import styles from './NewClub.module.css';

const STEPS = ['Club', 'First admin', 'Check and create'] as const;
const MAX_SHEETS = 12;

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Sets a club up in three short steps: the club, its first admin, then a
 *  check before anything is made. It ends with the message to send the
 *  admin, and a way into the club's setup. Super admins only. */
export function NewClub() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [clubName, setClubName] = useState('');
  const [clubId, setClubId] = useState('');
  const [clubIdEdited, setClubIdEdited] = useState(false);
  const [timeZone, setTimeZone] = useState(BROWSER_TIME_ZONE);
  const [sheetCount, setSheetCount] = useState(4);

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [pin, setPin] = useState(() => generatePin());

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // Set once the club exists: its ID, and anything that did not finish.
  const [created, setCreated] = useState<{ id: string; warning: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const message = welcomeMessage({
    clubName, role: 'clubadmin', email: adminEmail, password, pin, portalUrl: window.location.origin,
  });

  function next(e: React.FormEvent) {
    e.preventDefault();
    setStep((s) => s + 1);
  }

  async function create() {
    setCreating(true);
    setError('');
    let id: string;
    try {
      const result = await httpsCallable<unknown, { clubId: string }>(functions, 'provisionClub')({
        clubName, clubId: clubId || undefined, adminName, adminEmail, adminPassword: password, scoreboardPin: pin,
      });
      id = result.data.clubId;
    } catch (err) {
      setError(errorMessage(err, 'Could not create the club.'));
      setCreating(false);
      return;
    }
    // The club and its admin exist now. The time zone and sheets are
    // written by a super admin, as anywhere else; if they fail the club
    // still works, and they can be added from its pages.
    let warning: string | null = null;
    try {
      await setDoc(doc(db, 'clubs', id, 'config', 'club'), { timeZone }, { merge: true });
      for (let n = 1; n <= sheetCount; n++) {
        await addDoc(collection(db, 'clubs', id, 'sheets'), { name: `Sheet ${n}` });
      }
    } catch (err) {
      warning = errorMessage(err, 'Could not save the time zone or add every sheet.');
    }
    setCreated({ id, warning });
    setCreating(false);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      // Blocked: the message is on screen to copy by hand.
    }
  }

  if (created) {
    return (
      <SystemShell>
        <div className={styles.page}>
          <PageHeader title={`${clubName} is ready`} />
          {created.warning && <p className={common.warning}>{created.warning} Add them from the club's pages.</p>}
          <section className={common.section}>
            <h2 className={common.sectionTitle}>Send this to {adminName || adminEmail}</h2>
            <p className={common.blurb}>The password is not shown again. Send it somewhere private.</p>
            <pre className={styles.message}>{message}</pre>
            <div className={styles.actions}>
              <button className={common.ghostButton} onClick={copyMessage}>{copied ? 'Copied' : 'Copy message'}</button>
              <button className={common.primaryButton} onClick={() => navigate(clubPath(created.id, 'overview'))}>
                Open {clubName}
              </button>
            </div>
          </section>
        </div>
      </SystemShell>
    );
  }

  return (
    <SystemShell>
      <div className={styles.page}>
        <PageHeader title="New club" subtitle={`Step ${step + 1} of ${STEPS.length}`} />
        <ol className={styles.steps}>
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? styles.stepOn : i < step ? styles.stepDone : styles.step}>
              {i < step ? '✓ ' : `${i + 1} · `}{label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <form className={`${common.section} ${common.form}`} onSubmit={next}>
            <label className={common.label}>
              Club name
              <input
                className={common.input}
                value={clubName}
                onChange={(e) => {
                  setClubName(e.target.value);
                  if (!clubIdEdited) setClubId(toSlug(e.target.value));
                }}
                maxLength={80}
                required
                autoFocus
              />
            </label>
            <label className={common.label}>
              Club ID
              <input
                className={common.input}
                value={clubId}
                onChange={(e) => {
                  setClubId(e.target.value);
                  setClubIdEdited(e.target.value !== toSlug(clubName));
                }}
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers and hyphens only"
                required
              />
              <span className={styles.hint}>In every address for the club. It cannot be changed later.</span>
            </label>
            <label className={common.label}>
              Time zone
              <select className={common.input} value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                {timeZoneChoices(timeZone).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </label>
            <label className={common.label}>
              Sheets
              <select className={common.input} value={sheetCount} onChange={(e) => setSheetCount(Number(e.target.value))}>
                {Array.from({ length: MAX_SHEETS + 1 }, (_, n) => (
                  <option key={n} value={n}>{n === 0 ? 'None yet' : n === 1 ? '1: Sheet 1' : `${n}: Sheet 1 to Sheet ${n}`}</option>
                ))}
              </select>
              <span className={styles.hint}>They can be renamed, added or removed later.</span>
            </label>
            <div className={styles.actions}>
              <button type="button" className={common.ghostButton} onClick={() => navigate('/')}>Cancel</button>
              <button type="submit" className={common.primaryButton}>Next: first admin</button>
            </div>
          </form>
        )}

        {step === 1 && (
          <form className={`${common.section} ${common.form}`} onSubmit={next}>
            <label className={common.label}>
              Name
              <input className={common.input} value={adminName} onChange={(e) => setAdminName(e.target.value)} maxLength={80} required autoFocus />
            </label>
            <label className={common.label}>
              Email
              <input type="email" className={common.input} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
            </label>
            <SecretField
              id="new-club-password"
              label="Password"
              value={password}
              onChange={setPassword}
              onGenerate={generatePassword}
              minLength={8}
              hint="Made for you. You send it to them with the rest of what they need when the club is made."
            />
            <SecretField
              id="new-club-pin"
              label="Scoreboard admin PIN"
              value={pin}
              onChange={(value) => setPin(value.replace(/\D/g, ''))}
              onGenerate={generatePin}
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              maxLength={8}
              title="4 to 8 digits"
              hint="Entered on a scoreboard to disconnect it. The club's admins can change it."
            />
            <div className={styles.actions}>
              <button type="button" className={common.ghostButton} onClick={() => setStep(0)}>Back</button>
              <button type="submit" className={common.primaryButton}>Next: check</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <section className={common.section}>
            <dl className={styles.review}>
              <dt>Club</dt><dd>{clubName} <span className={styles.mono}>{clubId || '(made from the name)'}</span></dd>
              <dt>Time zone</dt><dd>{timeZone}</dd>
              <dt>Sheets</dt><dd>{sheetCount === 0 ? 'None yet' : `Sheet 1 to Sheet ${sheetCount}`}</dd>
              <dt>First admin</dt><dd>{adminName}, {adminEmail}</dd>
              <dt>Scoreboard PIN</dt><dd className={styles.mono}>{pin}</dd>
            </dl>
            {error && <p className={common.error}>{error}</p>}
            <div className={styles.actions}>
              <button type="button" className={common.ghostButton} onClick={() => setStep(1)} disabled={creating}>Back</button>
              <button type="button" className={common.primaryButton} onClick={create} disabled={creating}>
                {creating ? 'Creating…' : 'Create club'}
              </button>
            </div>
          </section>
        )}
      </div>
    </SystemShell>
  );
}

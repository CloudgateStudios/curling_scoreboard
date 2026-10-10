import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import common from '../../styles/common.module.css';
import styles from './ScoreboardPinSection.module.css';

interface Props {
  clubId: string;
}

const PIN_PATTERN = /^[0-9]{4,8}$/;

/** The PIN that has to be entered on a scoreboard to disconnect it from its
 *  sheet. One PIN covers every scoreboard at the club. */
export function ScoreboardPinSection({ clubId }: Props) {
  const [pin, setPin] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Kept with the API key, where only the club's admins can read it. The
  // scoreboards never see it: the unpairSheet function checks what is typed.
  useEffect(() => {
    return onSnapshot(doc(db, 'clubs', clubId, 'private', 'scoreboardPin'), (snap) => {
      setPin((snap.get('pin') as string | undefined) ?? null);
    });
  }, [clubId]);

  const valid = PIN_PATTERN.test(draft);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await setDoc(doc(db, 'clubs', clubId, 'private', 'scoreboardPin'), { pin: draft });
      setDraft('');
      setSuccess('PIN saved. It applies to every scoreboard straight away.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save the PIN.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={common.section}>
      <h2 className={common.sectionTitle}>Scoreboard Admin PIN</h2>
      <p className={common.blurb}>
        Entered on a scoreboard to disconnect it from its sheet, so nobody can do it by accident.
        The same PIN works on every scoreboard at the club.
        {!pin && ' Until one is set, scoreboards cannot be disconnected.'}
      </p>

      <div className={styles.pinRow}>
        <code className={styles.pin}>
          {pin ? (revealed ? pin : '•'.repeat(pin.length)) : 'Not set'}
        </code>
        {pin && (
          <button className={common.ghostButton} onClick={() => setRevealed((r) => !r)}>
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>

      <form className={styles.pinForm} onSubmit={handleSave}>
        <input
          className={common.input}
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder={pin ? 'New PIN (4 to 8 digits)' : 'PIN (4 to 8 digits)'}
          aria-label="Scoreboard admin PIN"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        />
        <button type="submit" className={common.primaryButton} disabled={saving || !valid}>
          {saving ? 'Saving…' : pin ? 'Change PIN' : 'Set PIN'}
        </button>
      </form>
      {error && <p className={common.error}>{error}</p>}
      {success && <p className={common.success}>{success}</p>}
    </div>
  );
}

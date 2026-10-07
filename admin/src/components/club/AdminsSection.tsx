import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import styles from '../../pages/ClubDetail.module.css';

interface ClubAdmin {
  uid: string;
  email: string;
  displayName: string | null;
}

interface Props {
  clubId: string;
  clubName: string;
}

/** The club's admin accounts. Shown to super admins only. */
export function AdminsSection({ clubId, clubName }: Props) {
  const [admins, setAdmins] = useState<ClubAdmin[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', clubId, 'admins'), (snap) => {
      setAdmins(
        snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<ClubAdmin, 'uid'>) }))
      );
    });
  }, [clubId]);

  function openForm() {
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError('');
    setSuccess('');
    try {
      const addClubAdmin = httpsCallable(functions, 'addClubAdmin');
      await addClubAdmin({ clubId, adminEmail: email, adminPassword: password });
      setSuccess(`Admin account created for ${email}.`);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add admin.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Admins ({admins.length})</h2>
        <button className={styles.primaryButton} onClick={openForm}>
          + Add Admin
        </button>
      </div>

      <div className={styles.adminList}>
        {admins.map((a) => (
          <div key={a.uid} className={styles.adminRow}>
            {a.displayName && <span className={styles.adminName}>{a.displayName}</span>}
            <span className={styles.adminEmail}>{a.email}</span>
          </div>
        ))}
        {admins.length === 0 && <p className={styles.empty}>No admins yet.</p>}
      </div>

      {showForm && (
        <div className={styles.modal}>
          <div className={styles.modalCard}>
            <h2 className={styles.modalTitle}>Add Admin to {clubName}</h2>
            <form onSubmit={handleAdd} className={styles.form}>
              <label className={styles.label}>
                Admin Email
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className={styles.label}>
                Password
                <input
                  type="password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </label>
              {error && <p className={styles.error}>{error}</p>}
              {success && <p className={styles.success}>{success}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostButton} onClick={() => setShowForm(false)}>
                  Close
                </button>
                <button type="submit" className={styles.primaryButton} disabled={adding}>
                  {adding ? 'Adding…' : 'Add Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import common from '../../styles/common.module.css';
import styles from './AdminsSection.module.css';

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
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState('');

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

  async function handleRemove(admin: ClubAdmin) {
    if (!confirm(`Remove ${admin.email} from ${clubName}? Their account is deleted and they are signed out within the hour.`)) return;
    setRemovingUid(admin.uid);
    setRemoveError('');
    try {
      await httpsCallable(functions, 'removeClubAdmin')({ clubId, uid: admin.uid });
    } catch (err) {
      setRemoveError(errorMessage(err, `Could not remove ${admin.email}.`));
    } finally {
      setRemovingUid(null);
    }
  }

  return (
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Admins ({admins.length})</h2>
        <button className={common.primaryButton} onClick={openForm}>
          + Add Admin
        </button>
      </div>

      <div className={styles.adminList}>
        {admins.map((a) => (
          <div key={a.uid} className={styles.adminRow}>
            {a.displayName && <span className={styles.adminName}>{a.displayName}</span>}
            <span className={styles.adminEmail}>{a.email}</span>
            <button
              className={`${common.linkButton} ${styles.removeButton}`}
              onClick={() => handleRemove(a)}
              disabled={removingUid !== null}
            >
              {removingUid === a.uid ? 'Removing…' : 'Remove'}
            </button>
          </div>
        ))}
        {admins.length === 0 && <p className={common.empty}>No admins yet.</p>}
      </div>
      {removeError && <p className={common.error}>{removeError}</p>}

      {showForm && (
        <div className={common.modal}>
          <div className={common.modalCard}>
            <h2 className={common.modalTitle}>Add Admin to {clubName}</h2>
            <form onSubmit={handleAdd} className={common.form}>
              <label className={common.label}>
                Admin Email
                <input
                  type="email"
                  className={common.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className={common.label}>
                Password
                <input
                  type="password"
                  className={common.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </label>
              {error && <p className={common.error}>{error}</p>}
              {success && <p className={common.success}>{success}</p>}
              <div className={common.modalActions}>
                <button type="button" className={common.ghostButton} onClick={() => setShowForm(false)}>
                  Close
                </button>
                <button type="submit" className={common.primaryButton} disabled={adding}>
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

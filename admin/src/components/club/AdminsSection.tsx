import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { errorMessage } from '../../lib/format';
import type { ClubUser, ClubUserRole } from '../../types';
import common from '../../styles/common.module.css';
import styles from './AdminsSection.module.css';

const ROLES: { id: ClubUserRole; label: string; description: string }[] = [
  { id: 'clubadmin', label: 'Club admin', description: 'Manages everything about the club.' },
  {
    id: 'bonspieladmin',
    label: 'Bonspiel admin',
    description: 'Sees the sheets and their games without changing them, and runs bonspiels.',
  },
];

const roleLabel = (role: ClubUserRole) => ROLES.find((r) => r.id === role)!.label;

interface Props {
  clubId: string;
  clubName: string;
}

/** The people who can sign in to the portal for the club, and what they can
 *  do there. Shown to super admins only. */
export function AdminsSection({ clubId, clubName }: Props) {
  const [users, setUsers] = useState<ClubUser[]>([]);

  // The form adds a user when `editing` is null and changes that user otherwise.
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClubUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ClubUserRole>('clubadmin');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'clubs', clubId, 'admins'), (snap) => {
      setUsers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            email: data.email as string,
            displayName: (data.displayName as string | null | undefined) ?? null,
            // Listings made before roles are all club admins.
            role: data.role === 'bonspieladmin' ? 'bonspieladmin' : 'clubadmin',
          };
        })
      );
    });
  }, [clubId]);

  function openForm(user: ClubUser | null) {
    setEditing(user);
    setName(user?.displayName ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'clubadmin');
    setPassword('');
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editing) {
        await httpsCallable(functions, 'updateClubAdmin')({
          clubId,
          uid: editing.uid,
          displayName: name,
          email,
          role,
          password,
        });
        setShowForm(false);
      } else {
        await httpsCallable(functions, 'addClubAdmin')({
          clubId,
          adminName: name,
          adminEmail: email,
          adminPassword: password,
          role,
        });
        setSuccess(`Account created for ${name || email}.`);
        setName('');
        setEmail('');
        setPassword('');
      }
    } catch (err) {
      setError(errorMessage(err, editing ? `Could not update ${editing.email}.` : 'Could not add the user.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(user: ClubUser) {
    if (!confirm(`Remove ${user.email} from ${clubName}? Their account is deleted and they are signed out within the hour.`)) return;
    setRemovingUid(user.uid);
    setRemoveError('');
    try {
      await httpsCallable(functions, 'removeClubAdmin')({ clubId, uid: user.uid });
    } catch (err) {
      setRemoveError(errorMessage(err, `Could not remove ${user.email}.`));
    } finally {
      setRemovingUid(null);
    }
  }

  // Signing out is what makes a new role or password take hold.
  const signsOut = editing !== null && (role !== editing.role || password !== '');

  return (
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>
          Users ({users.length}) <span className={common.adminTag}>Super admin</span>
        </h2>
        <button className={common.primaryButton} onClick={() => openForm(null)}>
          + Add User
        </button>
      </div>

      <p className={common.blurb}>People who can sign in to the portal for this club, and what they can do there.</p>

      <div className={styles.adminList}>
        {users.map((u) => (
          <div key={u.uid} className={styles.adminRow}>
            {u.displayName && <span className={styles.adminName}>{u.displayName}</span>}
            <span className={styles.adminEmail}>{u.email}</span>
            <span className={u.role === 'bonspieladmin' ? styles.bonspielRole : styles.clubRole}>
              {roleLabel(u.role)}
            </span>
            <div className={styles.rowActions}>
              <button className={common.linkButton} onClick={() => openForm(u)} disabled={removingUid !== null}>
                Edit
              </button>
              <button
                className={`${common.linkButton} ${styles.removeButton}`}
                onClick={() => handleRemove(u)}
                disabled={removingUid !== null}
              >
                {removingUid === u.uid ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && <p className={common.empty}>No users yet.</p>}
      </div>
      {removeError && <p className={common.error}>{removeError}</p>}

      {showForm && (
        <div className={common.modal}>
          <div className={common.modalCard}>
            <h2 className={common.modalTitle}>
              {editing ? `Edit ${editing.displayName || editing.email}` : `Add User to ${clubName}`}
            </h2>
            <form onSubmit={handleSave} className={common.form}>
              <label className={common.label}>
                Name
                <input
                  className={common.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <label className={common.label}>
                Email
                <input
                  type="email"
                  className={common.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <fieldset className={styles.roles}>
                <legend className={common.label}>Role</legend>
                {ROLES.map((r) => (
                  <label key={r.id} className={styles.roleOption}>
                    <input
                      type="radio"
                      name="role"
                      value={r.id}
                      checked={role === r.id}
                      onChange={() => setRole(r.id)}
                    />
                    <span>
                      <span className={styles.roleLabel}>{r.label}</span>
                      <span className={styles.roleDescription}>{r.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className={common.label}>
                {editing ? 'New Password' : 'Password'}
                <input
                  type="password"
                  className={common.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editing ? 'Leave blank to keep the current one' : undefined}
                  autoComplete="new-password"
                  required={!editing}
                  minLength={8}
                />
              </label>
              {signsOut && (
                <p className={styles.note}>
                  Saving signs {editing.displayName || editing.email} out of the portal, so they sign in again
                  {password !== '' ? ' with the new password' : ' as a ' + roleLabel(role).toLowerCase()}.
                </p>
              )}
              {error && <p className={common.error}>{error}</p>}
              {success && <p className={common.success}>{success}</p>}
              <div className={common.modalActions}>
                <button type="button" className={common.ghostButton} onClick={() => setShowForm(false)}>
                  {editing ? 'Cancel' : 'Close'}
                </button>
                <button type="submit" className={common.primaryButton} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

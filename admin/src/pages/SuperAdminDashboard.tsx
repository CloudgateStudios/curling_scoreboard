import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { db, functions } from '../lib/firebase';
import type { Club } from '../types';
import styles from './SuperAdminDashboard.module.css';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [clubId, setClubId] = useState('');
  const [clubIdEdited, setClubIdEdited] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'clubs'), (snap) => {
      setClubs(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Club, 'id'>) }))
      );
    });
  }, []);

  function handleClubNameChange(name: string) {
    setNewClubName(name);
    if (!clubIdEdited) {
      setClubId(toSlug(name));
    }
  }

  function handleClubIdChange(id: string) {
    setClubId(id);
    setClubIdEdited(id !== toSlug(newClubName));
  }

  async function handleCreateClub(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const provisionClub = httpsCallable(functions, 'provisionClub');
      await provisionClub({ clubName: newClubName, clubId: clubId || undefined, adminEmail, adminPassword });
      setNewClubName('');
      setClubId('');
      setClubIdEdited(false);
      setAdminEmail('');
      setAdminPassword('');
      setShowCreateClub(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create club.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>All Clubs</h1>
          <p className={styles.subtitle}>{clubs.length} club{clubs.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button className={styles.primaryButton} onClick={() => setShowCreateClub(true)}>
          + New Club
        </button>
      </div>

      {showCreateClub && (
        <div className={styles.modal}>
          <div className={styles.modalCard}>
            <h2 className={styles.modalTitle}>Create New Club</h2>
            <form onSubmit={handleCreateClub} className={styles.form}>
              <label className={styles.label}>
                Club Name
                <input
                  className={styles.input}
                  value={newClubName}
                  onChange={(e) => handleClubNameChange(e.target.value)}
                  required
                />
              </label>
              <label className={styles.label}>
                Club ID
                <input
                  className={styles.input}
                  value={clubId}
                  onChange={(e) => handleClubIdChange(e.target.value)}
                  pattern="[a-z0-9-]+"
                  title="Lowercase letters, numbers, and hyphens only"
                  required
                />
              </label>
              <label className={styles.label}>
                Admin Email
                <input
                  type="email"
                  className={styles.input}
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </label>
              <label className={styles.label}>
                Admin Password
                <input
                  type="password"
                  className={styles.input}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </label>
              {createError && <p className={styles.error}>{createError}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostButton} onClick={() => setShowCreateClub(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton} disabled={creating}>
                  {creating ? 'Creating…' : 'Create Club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={styles.clubGrid}>
        {clubs.map((club) => (
          <button
            key={club.id}
            className={styles.clubCard}
            onClick={() => navigate(`/clubs/${club.id}`)}
          >
            <span className={styles.clubName}>{club.name}</span>
            <span className={styles.clubId}>{club.id}</span>
            <span className={styles.viewLink}>View details →</span>
          </button>
        ))}
        {clubs.length === 0 && (
          <p className={styles.empty}>No clubs yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}

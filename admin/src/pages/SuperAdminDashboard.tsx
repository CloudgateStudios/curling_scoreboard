import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import type { Club } from '../types';
import { ClubDetail } from './ClubDetail';
import styles from './SuperAdminDashboard.module.css';

export function SuperAdminDashboard() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
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

  async function handleCreateClub(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const provisionClub = httpsCallable(functions, 'provisionClub');
      await provisionClub({ clubName: newClubName, adminEmail, adminPassword });
      setNewClubName('');
      setAdminEmail('');
      setAdminPassword('');
      setShowCreateClub(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create club.');
    } finally {
      setCreating(false);
    }
  }

  if (selectedClubId) {
    const club = clubs.find((c) => c.id === selectedClubId)!;
    return <ClubDetail club={club} onBack={() => setSelectedClubId(null)} />;
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
                  onChange={(e) => setNewClubName(e.target.value)}
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
            onClick={() => setSelectedClubId(club.id)}
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

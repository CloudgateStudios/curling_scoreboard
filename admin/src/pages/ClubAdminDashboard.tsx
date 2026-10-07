import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Club, AuthUser } from '../types';
import { ClubDetail } from './ClubDetail';
import styles from './ClubAdminDashboard.module.css';

interface Props {
  user: AuthUser;
}

export function ClubAdminDashboard({ user }: Props) {
  const [club, setClub] = useState<Club | null>(null);
  // Without a clubId there is nothing to load, so the page goes straight to
  // the "Club not found" message below instead of spinning forever.
  const [loading, setLoading] = useState(Boolean(user.clubId));

  useEffect(() => {
    if (!user.clubId) return;
    return onSnapshot(doc(db, 'clubs', user.clubId), (snap) => {
      if (snap.exists()) {
        setClub({ id: snap.id, ...(snap.data() as Omit<Club, 'id'>) });
      }
      setLoading(false);
    });
  }, [user.clubId]);

  if (loading) return <p className={styles.loading}>Loading…</p>;
  if (!club) return <p className={styles.error}>Club not found. Contact your administrator.</p>;

  // Pass club directly so ClubDetail doesn't need to re-fetch it
  return <ClubDetail club={club} isClubAdmin />;
}

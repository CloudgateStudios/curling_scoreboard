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
  const [loading, setLoading] = useState(true);

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

  return <ClubDetail club={club} />;
}

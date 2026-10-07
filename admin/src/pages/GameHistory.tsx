import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit, getDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import type { Game } from '../types';
import { GameCard } from '../components/GameCard';
import styles from './GameHistory.module.css';

export function GameHistory() {
  // Super admin route: /clubs/:clubId/sheets/:sheetId/games
  // Club admin route:  /sheets/:sheetId/games (clubId comes from auth token, but we
  //                    still need it for the Firestore path — fetch it from the sheet)
  const { clubId: routeClubId, sheetId } = useParams<{ clubId?: string; sheetId: string }>();
  const navigate = useNavigate();

  const [clubId, setClubId] = useState<string | null>(routeClubId ?? null);
  const [clubName, setClubName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // For club admin routes the clubId isn't in the URL — resolve it via the sheet doc
  useEffect(() => {
    if (routeClubId || !sheetId) return;
    // collectionGroup query isn't available client-side without indexes, so we stored
    // clubId on the auth token. Read it from the current user's token claims instead.
    import('../lib/firebase').then(async ({ auth }) => {
      const token = await auth.currentUser?.getIdTokenResult();
      const cid = token?.claims['clubId'] as string | undefined;
      if (cid) setClubId(cid);
    });
  }, [routeClubId, sheetId]);

  // Fetch club and sheet names for display
  useEffect(() => {
    if (!clubId || !sheetId) return;
    getDoc(doc(db, 'clubs', clubId)).then((snap) => {
      if (snap.exists()) setClubName((snap.data() as { name: string }).name);
    });
    getDoc(doc(db, 'clubs', clubId, 'sheets', sheetId)).then((snap) => {
      if (snap.exists()) setSheetName((snap.data() as { name: string }).name);
    });
  }, [clubId, sheetId]);

  // Subscribe to games once we have both IDs
  useEffect(() => {
    if (!clubId || !sheetId) return;
    const q = query(
      collection(db, 'clubs', clubId, 'sheets', sheetId!, 'games'),
      orderBy('finishedAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setGames(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            startedAt: data.startedAt?.toDate?.() ?? new Date(),
            finishedAt: data.finishedAt?.toDate?.() ?? new Date(),
          } as Game;
        })
      );
    });
  }, [clubId, sheetId]);

  return (
    <div>
      <div className={styles.breadcrumb}>
        <button className={styles.backButton} onClick={() => navigate(-1)}>
          ← {clubName || 'Back'}
        </button>
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{sheetName || '…'}</h1>
          <p className={styles.subtitle}>{games.length} completed game{games.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className={styles.gameList}>
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            styles={styles}
            expanded={expandedId === game.id}
            onToggle={() => setExpandedId(expandedId === game.id ? null : game.id)}
            meta={<span>{game.finishedAt.toLocaleDateString()}</span>}
          />
        ))}
        {games.length === 0 && <p className={styles.empty}>No completed games for this sheet yet.</p>}
      </div>
    </div>
  );
}

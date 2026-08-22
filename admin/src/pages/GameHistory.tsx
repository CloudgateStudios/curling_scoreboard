import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit, getDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import type { Game } from '../types';
import { endScoredBy, endScoreLabel } from '../lib/gameEnds';
import styles from './GameHistory.module.css';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

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
          <div key={game.id} className={styles.gameCard}>
            <button
              className={styles.gameHeader}
              onClick={() => setExpandedId(expandedId === game.id ? null : game.id)}
            >
              <div className={styles.gameScore}>
                <span className={game.team1.totalScore >= game.team2.totalScore ? styles.winnerName : styles.loserName}>
                  {game.team1.name}
                </span>
                <span className={styles.scoreDisplay}>
                  {game.team1.totalScore} – {game.team2.totalScore}
                </span>
                <span className={game.team2.totalScore >= game.team1.totalScore ? styles.winnerName : styles.loserName}>
                  {game.team2.name}
                </span>
              </div>
              <div className={styles.gameMeta}>
                <span>{game.finishedAt.toLocaleDateString()}</span>
                {game.ends.length > 0 && (
                  <span>{formatDuration(game.ends[game.ends.length - 1].gameTimeInSeconds)}</span>
                )}
                <span>{game.numberOfEnds} ends</span>
                <span className={styles.expandIcon}>{expandedId === game.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expandedId === game.id && (
              <div className={styles.endsTable}>
                <table>
                  <thead>
                    <tr>
                      <th>End</th>
                      {game.ends.map((e: Game['ends'][number]) => <th key={e.endNumber}>{e.endNumber}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={styles.teamLabel}>{game.team1.name}</td>
                      {game.ends.map((e: Game['ends'][number]) => (
                        <td key={e.endNumber} className={endScoredBy(e, 'team1', game) ? styles.scoringEnd : ''}>
                          {endScoreLabel(e, 'team1', game)}
                        </td>
                      ))}
                      <td className={styles.totalCell}>{game.team1.totalScore}</td>
                    </tr>
                    <tr>
                      <td className={styles.teamLabel}>{game.team2.name}</td>
                      {game.ends.map((e: Game['ends'][number]) => (
                        <td key={e.endNumber} className={endScoredBy(e, 'team2', game) ? styles.scoringEnd : ''}>
                          {endScoreLabel(e, 'team2', game)}
                        </td>
                      ))}
                      <td className={styles.totalCell}>{game.team2.totalScore}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {games.length === 0 && <p className={styles.empty}>No completed games for this sheet yet.</p>}
      </div>
    </div>
  );
}

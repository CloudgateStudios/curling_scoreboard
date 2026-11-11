import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit, getDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { clubPath } from '../lib/clubPaths';
import { downloadCsv, gamesCsv, gamesCsvFilename } from '../lib/gamesCsv';
import type { Game } from '../types';
import { GameCard } from '../components/GameCard';
import { PageHeader } from '../components/PageHeader';
import common from '../styles/common.module.css';
import styles from './GameHistory.module.css';

/** Games loaded at first, and added each time more are asked for. */
const PAGE_SIZE = 50;

interface Props {
  clubId: string;
}

/** Every finished game on one sheet, newest first. */
export function GameHistory({ clubId }: Props) {
  const { sheetId } = useParams<{ sheetId: string }>();
  const navigate = useNavigate();

  const [clubName, setClubName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gameLimit, setGameLimit] = useState(PAGE_SIZE);
  // A full page means there may be more; anything short of it is everything.
  const mayHaveMore = games.length >= gameLimit;

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
      limit(gameLimit)
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
  }, [clubId, sheetId, gameLimit]);

  function handleExport() {
    // Newest first here, so the last game is the oldest.
    const filename = gamesCsvFilename(
      `${clubName} ${sheetName}`, games[games.length - 1].startedAt, games[0].startedAt,
    );
    downloadCsv(filename, gamesCsv(games.map((game) => ({ ...game, sheetName }))));
  }

  return (
    <div>
      <div className={styles.breadcrumb}>
        <button className={styles.backButton} onClick={() => navigate(clubPath(clubId, 'sheets'))}>
          ← {clubName || 'Back'}
        </button>
      </div>

      <PageHeader
        title={sheetName || '…'}
        subtitle={`${mayHaveMore ? `Latest ${games.length}` : games.length} completed game${games.length !== 1 ? 's' : ''}`}
        actions={games.length > 0 && (
          <button className={common.ghostButton} onClick={handleExport}>
            Export CSV
          </button>
        )}
      />

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
      {mayHaveMore && (
        <button className={`${common.ghostButton} ${styles.loadMore}`} onClick={() => setGameLimit(gameLimit + PAGE_SIZE)}>
          Load {PAGE_SIZE} more
        </button>
      )}
    </div>
  );
}

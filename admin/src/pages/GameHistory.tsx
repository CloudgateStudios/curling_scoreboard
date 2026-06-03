import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Club, Sheet, Game } from '../types';
import styles from './GameHistory.module.css';

interface Props {
  club: Club;
  sheet: Sheet;
  onBack: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function GameHistory({ club, sheet, onBack }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'clubs', club.id, 'sheets', sheet.id, 'games'),
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
  }, [club.id, sheet.id]);

  return (
    <div>
      <div className={styles.breadcrumb}>
        <button className={styles.backButton} onClick={onBack}>
          ← {club.name}
        </button>
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{sheet.name}</h1>
          <p className={styles.subtitle}>{games.length} completed game{games.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className={styles.gameList}>
        {games.map((game) => {
          return (
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
                          <td key={e.endNumber} className={e.scoringTeam === 1 ? styles.scoringEnd : ''}>
                            {e.scoringTeam === 1 ? e.score : e.scoringTeam === null ? '—' : '0'}
                          </td>
                        ))}
                        <td className={styles.totalCell}>{game.team1.totalScore}</td>
                      </tr>
                      <tr>
                        <td className={styles.teamLabel}>{game.team2.name}</td>
                        {game.ends.map((e) => (
                          <td key={e.endNumber} className={e.scoringTeam === 2 ? styles.scoringEnd : ''}>
                            {e.scoringTeam === 2 ? e.score : e.scoringTeam === null ? '—' : '0'}
                          </td>
                        ))}
                        <td className={styles.totalCell}>{game.team2.totalScore}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {games.length === 0 && <p className={styles.empty}>No completed games for this sheet yet.</p>}
      </div>
    </div>
  );
}

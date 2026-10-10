import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { downloadCsv, gamesCsv, gamesCsvFilename } from '../../lib/gamesCsv';
import type { Game, Sheet } from '../../types';
import { GameCard } from '../GameCard';
import common from '../../styles/common.module.css';
import styles from './RecentGames.module.css';

interface RecentGame extends Game {
  sheetId: string;
  sheetName: string;
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Days with games shown until the rest are asked for, to keep a busy week short. */
const DAYS_SHOWN = 2;

function groupByDay(games: RecentGame[]): { label: string; games: RecentGame[] }[] {
  const map = new Map<string, RecentGame[]>();
  for (const game of games) {
    const key = game.startedAt.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(game);
  }
  return Array.from(map.entries()).map(([label, games]) => ({ label, games }));
}

interface Props {
  clubId: string;
  clubName: string;
  sheets: Sheet[];
}

/** Completed games from every sheet in the club over the last seven days. */
export function RecentGames({ clubId, clubName, sheets }: Props) {
  // Sheets update on every live score. Key the fetch on sheet ids and names
  // only, so a score change doesn't refetch every sheet's games.
  const sheetKey = JSON.stringify(sheets.map(({ id, name }) => ({ id, name })));
  const requestKey = `${clubId}|${sheetKey}`;
  const hasSheets = sheets.length > 0;

  // Results remember which request they answer, so loading is derived rather
  // than set at the start of the effect.
  const [result, setResult] = useState<{ key: string; games: RecentGame[] } | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const sheetMeta = JSON.parse(sheetKey) as { id: string; name: string }[];
    if (!sheetMeta.length) return;
    let cancelled = false;
    const since = Timestamp.fromDate(new Date(Date.now() - WINDOW_MS));
    Promise.all(
      sheetMeta.map((sheet) =>
        getDocs(query(
          collection(db, 'clubs', clubId, 'sheets', sheet.id, 'games'),
          where('startedAt', '>=', since),
          orderBy('startedAt', 'desc'),
        )).then((snap) =>
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              sheetId: sheet.id,
              sheetName: sheet.name,
              startedAt: data.startedAt?.toDate?.() ?? new Date(),
              finishedAt: data.finishedAt?.toDate?.() ?? new Date(),
            } as RecentGame;
          }),
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      const games = results.flat().sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      setResult({ key: requestKey, games });
    });
    return () => { cancelled = true; };
  }, [clubId, sheetKey, requestKey]);

  const loading = hasSheets && result?.key !== requestKey;
  const games = hasSheets && !loading ? result!.games : [];
  const days = groupByDay(games);
  const shownDays = showAll ? days : days.slice(0, DAYS_SHOWN);
  const hiddenGames = games.length - shownDays.reduce((n, day) => n + day.games.length, 0);

  return (
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Recent Games — Last 7 Days</h2>
        <div className={styles.headerActions}>
          <span className={styles.gameCount}>
            {loading ? '…' : `${games.length} game${games.length !== 1 ? 's' : ''}`}
          </span>
          {!loading && games.length > 0 && (
            <button
              className={common.ghostButton}
              onClick={() => downloadCsv(
                gamesCsvFilename(clubName, new Date(Date.now() - WINDOW_MS), new Date()),
                gamesCsv(games),
              )}
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {loading && <p className={common.empty}>Loading…</p>}

      {!loading && games.length === 0 && (
        <p className={common.empty}>No completed games in the last 7 days.</p>
      )}

      {!loading && shownDays.map(({ label, games: dayGames }) => (
        <div key={label} className={styles.dayGroup}>
          <h3 className={styles.dayLabel}>{label}</h3>
          <div className={styles.gameList}>
            {dayGames.map((game) => (
              <GameCard
                key={`${game.sheetId}-${game.id}`}
                game={game}
                styles={styles}
                expanded={expandedGameId === game.id}
                onToggle={() => setExpandedGameId(expandedGameId === game.id ? null : game.id)}
                meta={
                  <>
                    <span className={styles.sheetChip}>{game.sheetName}</span>
                    <span>{game.startedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                  </>
                }
              />
            ))}
          </div>
        </div>
      ))}

      {!loading && days.length > DAYS_SHOWN && (
        <button className={common.linkButton} onClick={() => setShowAll(!showAll)}>
          {showAll
            ? 'Show fewer'
            : `Show ${hiddenGames} more game${hiddenGames !== 1 ? 's' : ''} from earlier this week`}
        </button>
      )}
    </div>
  );
}

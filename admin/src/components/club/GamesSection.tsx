import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { downloadCsv, gamesCsv, gamesCsvFilename } from '../../lib/gamesCsv';
import type { Game, Sheet } from '../../types';
import { GameCard } from '../GameCard';
import common from '../../styles/common.module.css';
import styles from './GamesSection.module.css';
import { useClubClock } from '../../hooks/useClubClock';
import { timeOptions } from '../../lib/clock';

interface ClubGame extends Game {
  sheetId: string;
  sheetName: string;
}

/** Games shown at first, and added each time more are asked for. */
const PAGE_SIZE = 25;

function groupByDay(games: ClubGame[]): { label: string; games: ClubGame[] }[] {
  const map = new Map<string, ClubGame[]>();
  for (const game of games) {
    const key = game.finishedAt.toLocaleDateString(undefined, {
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

/** Every finished game in the club, newest first, from every sheet or from
 *  the one picked. The sheet is kept in the address (`?sheet=`), so the
 *  Sheets page can link straight to one sheet's games. */
export function GamesSection({ clubId, clubName, sheets }: Props) {
  const clock = useClubClock();
  const [searchParams, setSearchParams] = useSearchParams();
  const sorted = [...sheets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const picked = searchParams.get('sheet');
  const sheetId = sorted.some((s) => s.id === picked) ? picked : null;

  // Sheets update on every live score. Key the fetch on sheet ids and names
  // only, so a score change doesn't refetch every sheet's games.
  const sheetKey = JSON.stringify(sorted.map(({ id, name }) => ({ id, name })));
  const [gameLimit, setGameLimit] = useState(PAGE_SIZE);
  const requestKey = `${clubId}|${sheetKey}|${sheetId ?? ''}|${gameLimit}`;
  const hasSheets = sheets.length > 0;

  // Results remember which request they answer, so loading is derived rather
  // than set at the start of the effect.
  const [result, setResult] = useState<{ key: string; games: ClubGame[]; mayHaveMore: boolean } | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  useEffect(() => {
    const all = JSON.parse(sheetKey) as { id: string; name: string }[];
    const sheetMeta = sheetId ? all.filter((s) => s.id === sheetId) : all;
    if (!sheetMeta.length) return;
    // Aborted when the sheets or the filter change, or the page closes, so a
    // slow answer to an old request is dropped.
    const request = new AbortController();
    // The newest games of the club are among the newest of each sheet, so
    // asking each sheet for as many as are shown is enough.
    Promise.all(
      sheetMeta.map((sheet) =>
        getDocs(query(
          collection(db, 'clubs', clubId, 'sheets', sheet.id, 'games'),
          orderBy('finishedAt', 'desc'),
          limit(gameLimit),
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
            } as ClubGame;
          }),
        ),
      ),
    ).then((results) => {
      if (request.signal.aborted) return;
      const games = results.flat().sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());
      // More than a page between them, or a full page from any one sheet,
      // means there are, or may be, more.
      const mayHaveMore = games.length > gameLimit || results.some((r) => r.length >= gameLimit);
      setResult({ key: requestKey, games: games.slice(0, gameLimit), mayHaveMore });
    }).catch(() => {
      if (!request.signal.aborted) setResult({ key: requestKey, games: [], mayHaveMore: false });
    });
    return () => request.abort();
  }, [clubId, sheetKey, sheetId, gameLimit, requestKey]);

  // What was shown stays up while more, or another sheet, loads.
  const loading = hasSheets && result?.key !== requestKey;
  const games = hasSheets && result ? result.games : [];
  const days = groupByDay(games);
  const sheetName = sorted.find((s) => s.id === sheetId)?.name;

  function pick(id: string | null) {
    setGameLimit(PAGE_SIZE);
    setExpandedGameId(null);
    setSearchParams((params) => {
      if (id) params.set('sheet', id);
      else params.delete('sheet');
      return params;
    }, { replace: true });
  }

  function handleExport() {
    // Newest first, so the last game is the oldest.
    downloadCsv(
      gamesCsvFilename(sheetName ? `${clubName} ${sheetName}` : clubName, games[games.length - 1].finishedAt, games[0].finishedAt),
      gamesCsv(games),
    );
  }

  return (
    <div className={common.section}>
      <div className={styles.toolbar}>
        <div className={styles.filter} role="group" aria-label="Sheet">
          <button type="button" aria-pressed={!sheetId} className={!sheetId ? styles.filterOn : styles.filterOff} onClick={() => pick(null)}>
            All sheets
          </button>
          {sorted.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              aria-pressed={sheetId === sheet.id}
              className={sheetId === sheet.id ? styles.filterOn : styles.filterOff}
              onClick={() => pick(sheet.id)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
        <div className={styles.headerActions}>
          <span className={styles.gameCount}>
            {result ? `${result.mayHaveMore ? 'Latest ' : ''}${games.length} game${games.length !== 1 ? 's' : ''}` : '…'}
          </span>
          {games.length > 0 && (
            <button className={common.ghostButton} onClick={handleExport} title="The games shown, a row each">
              Export CSV
            </button>
          )}
        </div>
      </div>

      {!hasSheets && <p className={common.empty}>No sheets yet.</p>}
      {hasSheets && !result && <p className={common.empty}>Loading…</p>}
      {result && !loading && games.length === 0 && (
        <p className={common.empty}>{sheetName ? `No finished games on ${sheetName} yet.` : 'No finished games yet.'}</p>
      )}

      {days.map(({ label, games: dayGames }) => (
        <div key={label} className={styles.dayGroup}>
          <h3 className={styles.dayLabel}>{label}</h3>
          <div className={styles.gameList}>
            {dayGames.map((game) => (
              <GameCard
                key={`${game.sheetId}-${game.id}`}
                game={game}
                styles={styles}
                expanded={expandedGameId === `${game.sheetId}-${game.id}`}
                onToggle={() => {
                  const key = `${game.sheetId}-${game.id}`;
                  setExpandedGameId(expandedGameId === key ? null : key);
                }}
                meta={
                  <>
                    {!sheetId && <span className={styles.sheetChip}>{game.sheetName}</span>}
                    <span>{game.finishedAt.toLocaleTimeString(undefined, timeOptions(clock))}</span>
                  </>
                }
              />
            ))}
          </div>
        </div>
      ))}

      {result?.mayHaveMore && (
        <button className={`${common.ghostButton} ${styles.loadMore}`} disabled={loading} onClick={() => setGameLimit(gameLimit + PAGE_SIZE)}>
          {loading ? 'Loading…' : `Load ${PAGE_SIZE} more`}
        </button>
      )}
    </div>
  );
}

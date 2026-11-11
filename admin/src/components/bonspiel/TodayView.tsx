import { useEffect, useState } from 'react';
import { bonspielDay, localMinutes, timeOf, type DayDrawStatus } from '../../lib/clubNow';
import { activeLiveGame } from '../../lib/liveGame';
import type { Bonspiel, BonspielGame, BonspielState, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import { GameCard } from './GameCard';
import styles from './TodayView.module.css';
import { useClubClock } from '../../hooks/useClubClock';
import { formatHm } from '../../lib/clock';

interface Props {
  bonspiel: Bonspiel;
  sheets: Sheet[];
  state: BonspielState | null;
  onOpenGame: (game: BonspielGame) => void;
}

const STATUS: Record<DayDrawStatus, { label: string; chip: string }> = {
  done: { label: 'Done', chip: common.idleChip },
  on: { label: 'On now', chip: common.liveChip },
  next: { label: 'Next', chip: common.pairedChip },
  later: { label: 'Later', chip: common.idleChip },
};

/**
 * The bonspiel's draws today, for running it on the day: the draw on now,
 * each game's live score from its sheet, and what needs a hand first.
 * Times are the browser's clock, which is the club's for anyone at the
 * club; bonspiel admins cannot read the club's time zone.
 */
export function TodayView({ bonspiel, sheets, state, onOpenGame }: Props) {
  const clock = useClubClock();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const day = bonspielDay(bonspiel, localMinutes(undefined, now));
  const sheetOrder = new Map(sheets.map((s, i) => [s.id, i]));
  const sheetOf = (id: string) => sheets.find((s) => s.id === id);
  const gamesIn = (drawId: string) =>
    bonspiel.games
      .filter((g) => g.drawId === drawId)
      .sort((a, b) => (sheetOrder.get(a.sheetId) ?? 99) - (sheetOrder.get(b.sheetId) ?? 99));

  // What a coordinator has to step in for: a tie in a game others come
  // from, or a game still to play on a sheet with no scoreboard.
  const needs: { key: string; game: BonspielGame; text: string }[] = [];
  for (const d of day) {
    for (const game of gamesIn(d.drawId)) {
      const label = game.label || 'A game';
      if (state?.games[game.id]?.tied) {
        needs.push({ key: `${game.id}-tie`, game, text: `${label} is tied and needs a winner.` });
      }
      const sheet = sheetOf(game.sheetId);
      if (d.status !== 'done' && sheet && !sheet.scoreboardUid) {
        needs.push({ key: `${game.id}-sheet`, game, text: `${label}: ${sheet.name} has no scoreboard, so its result has to be entered here.` });
      }
    }
  }

  if (day.length === 0) {
    return <p className={common.empty}>No draws today.</p>;
  }

  return (
    <div className={styles.today}>
      {needs.length > 0 && (
        <div className={styles.needs}>
          <strong>Needs a hand</strong>
          <ul>
            {needs.map((n) => (
              <li key={n.key}>
                <button className={common.linkButton} onClick={() => onOpenGame(n.game)}>{n.text}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {day.map((d) => (
        <section key={d.drawId} className={d.status === 'on' ? styles.drawOn : d.status === 'done' ? styles.drawDone : styles.draw}>
          <div className={styles.drawHeader}>
            <span className={styles.drawLabel}>{d.label || 'Draw'}</span>
            <span className={styles.drawTime}>{formatHm(timeOf(d.start), clock)}</span>
            <span className={STATUS[d.status].chip}>{STATUS[d.status].label}</span>
          </div>
          <div className={styles.games}>
            {gamesIn(d.drawId).map((game) => {
              const sheet = sheetOf(game.sheetId);
              const live = sheet ? activeLiveGame(sheet.liveGame, now.getTime()) : null;
              const isThis = live?.bonspiel?.gameId === game.id;
              return (
                <div key={game.id} className={styles.game}>
                  <span className={styles.sheetName}>{sheet?.name ?? 'Removed sheet'}</span>
                  <GameCard bonspiel={bonspiel} game={game} state={state?.games[game.id]} onOpen={() => onOpenGame(game)} />
                  {live && isThis && (
                    <span className={common.liveChip}>
                      Live · End {live.currentEnd} · {live.team1.score}–{live.team2.score}
                    </span>
                  )}
                </div>
              );
            })}
            {gamesIn(d.drawId).length === 0 && <p className={common.empty}>No games in this draw.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

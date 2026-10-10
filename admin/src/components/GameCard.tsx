import type { ReactNode } from 'react';
import type { Game } from '../types';
import { endScoredBy, endScoreLabel } from '../lib/gameEnds';
import { formatDuration } from '../lib/format';
import { webhookFailed, webhookSummary } from '../lib/gameWebhook';
import own from './GameCard.module.css';

interface Props {
  game: Game;
  /** Shown in the header after the score, before the duration and end count. */
  meta: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** The page's CSS module. Pages size the card differently, so each brings
   *  its own gameCard, gameHeader, endsTable and related classes. */
  styles: CSSModuleClasses;
}

/** A completed game: the final score, and the end by end scores when expanded. */
export function GameCard({ game, meta, expanded, onToggle, styles }: Props) {
  const lastEnd = game.ends[game.ends.length - 1];
  return (
    <div className={styles.gameCard}>
      <button className={styles.gameHeader} onClick={onToggle}>
        <div className={styles.gameScore}>
          <span className={game.team1.totalScore > game.team2.totalScore ? styles.winnerName : styles.loserName}>
            {game.team1.name}
          </span>
          <span className={styles.scoreDisplay}>
            {game.team1.totalScore} – {game.team2.totalScore}
          </span>
          <span className={game.team2.totalScore > game.team1.totalScore ? styles.winnerName : styles.loserName}>
            {game.team2.name}
          </span>
        </div>
        <div className={styles.gameMeta}>
          {meta}
          {webhookFailed(game.webhook) && <span className={own.webhookFailedChip}>Webhook failed</span>}
          {lastEnd && <span>{formatDuration(lastEnd.gameTimeInSeconds)}</span>}
          <span>{game.numberOfEnds} ends</span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className={styles.endsTable}>
          <table>
            <thead>
              <tr>
                <th>End</th>
                {game.ends.map((e) => <th key={e.endNumber}>{e.endNumber}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(['team1', 'team2'] as const).map((slot) => (
                <tr key={slot}>
                  <td className={styles.teamLabel}>{game[slot].name}</td>
                  {game.ends.map((e) => (
                    <td key={e.endNumber} className={endScoredBy(e, slot, game) ? styles.scoringEnd : ''}>
                      {endScoreLabel(e, slot, game)}
                    </td>
                  ))}
                  <td className={styles.totalCell}>{game[slot].totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {game.webhook && (
            <p className={webhookFailed(game.webhook) ? own.webhookFailed : own.webhook}>
              {webhookSummary(game.webhook)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

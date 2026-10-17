import { bracketRounds } from '../../lib/bonspiels';
import type { Bonspiel, BonspielGame, BonspielState, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import { GameCard } from './GameCard';
import styles from './BracketView.module.css';

interface Props {
  bonspiel: Bonspiel;
  sheets: Sheet[];
  state: BonspielState | null;
  onOpenGame: (game: BonspielGame) => void;
}

/** Each event as a bracket: its rounds in columns, left to right, ending with
 *  the final and, once it is played, the event's winner. */
export function BracketView({ bonspiel, sheets, state, onOpenGame }: Props) {
  if (bonspiel.games.length === 0) {
    return <p className={common.empty}>No games yet. Add them on the draw board, or use a template.</p>;
  }

  const drawLabel = new Map(bonspiel.draws.map((d) => [d.id, d.label]));
  const sheetName = new Map(sheets.map((s) => [s.id, s.name]));

  return (
    <div className={styles.events}>
      {bonspiel.events.map((event) => {
        const rounds = bracketRounds(bonspiel, event.id);
        if (rounds.length === 0) return null;
        const winner = state?.events[event.id]?.winner;
        return (
          <section key={event.id} className={styles.event} aria-label={event.name}>
            <h3 className={styles.eventName}>
              {event.name || 'Unnamed event'}
              {winner && <span className={styles.winner}>Won by {winner.name}</span>}
            </h3>
            <div className={styles.scroller}>
              <div className={styles.rounds}>
                {rounds.map((games, i) => (
                  <div key={i} className={styles.round}>
                    <span className={styles.roundName}>
                      {i === rounds.length - 1 && games.length === 1 ? 'Final' : `Round ${i + 1}`}
                    </span>
                    <div className={styles.games}>
                      {games.map((game) => (
                        <GameCard
                          key={game.id}
                          bonspiel={bonspiel}
                          game={game}
                          state={state?.games[game.id]}
                          detail={`${drawLabel.get(game.drawId) ?? 'No draw'} · ${sheetName.get(game.sheetId) ?? 'No sheet'}`}
                          onOpen={() => onOpenGame(game)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

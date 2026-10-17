import { bracketRounds, isPool, withTiebreak } from '../../lib/bonspiels';
import type { Bonspiel, BonspielEvent, BonspielGame, BonspielState, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import { GameCard } from './GameCard';
import styles from './BracketView.module.css';

interface Props {
  bonspiel: Bonspiel;
  sheets: Sheet[];
  state: BonspielState | null;
  onOpenGame: (game: BonspielGame) => void;
  /** Sets the order that breaks a pool's ties. */
  onTiebreak: (eventId: string, tiebreak: string[]) => void;
}

/** Each event as a bracket: its rounds in columns, left to right, ending with
 *  the final and, once it is played, the event's winner. */
export function BracketView({ bonspiel, sheets, state, onOpenGame, onTiebreak }: Props) {
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
        if (isPool(bonspiel, event.id)) {
          const detail = (game: BonspielGame) =>
            `${drawLabel.get(game.drawId) ?? 'No draw'} · ${sheetName.get(game.sheetId) ?? 'No sheet'}`;
          return (
            <PoolView key={event.id} bonspiel={bonspiel} event={event} state={state}
              detail={detail} onOpenGame={onOpenGame} onTiebreak={onTiebreak} />
          );
        }
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

/** A pool: its standings, with a way to break ties its games leave, and its
 *  games in the order they are played. */
function PoolView({ bonspiel, event, state, detail, onOpenGame, onTiebreak }: {
  bonspiel: Bonspiel;
  event: BonspielEvent;
  state: BonspielState | null;
  detail: (game: BonspielGame) => string;
  onOpenGame: (game: BonspielGame) => void;
  onTiebreak: (eventId: string, tiebreak: string[]) => void;
}) {
  const eventState = state?.events[event.id];
  // Teams sharing a place in the order the coordinator has given them, so
  // an order not yet saved shows, and moves on from where it is.
  const rank = (teamId: string | undefined) => {
    const at = teamId === undefined ? -1 : (event.tiebreak ?? []).indexOf(teamId);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  const rows = [...(eventState?.standings ?? [])]
    .sort((a, b) => a.place - b.place || (a.tied && b.tied ? rank(a.teamId) - rank(b.teamId) : 0));
  const drawOrder = new Map(bonspiel.draws.map((d) => [d.id, d.start]));
  const games = bonspiel.games
    .filter((g) => g.eventId === event.id)
    .sort((a, b) => (drawOrder.get(a.drawId) ?? '').localeCompare(drawOrder.get(b.drawId) ?? ''));
  const tied = rows.some((r) => r.tied);

  // Moves a team above the one before it in a shared place, which puts the
  // whole tie in that order.
  function moveUp(index: number) {
    const place = rows[index].place;
    const tie = rows.filter((r) => r.place === place && r.teamId !== undefined);
    const at = tie.findIndex((r) => r === rows[index]);
    if (at <= 0) return;
    const order = tie.map((r) => r.teamId!);
    [order[at - 1], order[at]] = [order[at], order[at - 1]];
    onTiebreak(event.id, withTiebreak(event.tiebreak, order));
  }

  return (
    <section className={styles.event} aria-label={event.name}>
      <h3 className={styles.eventName}>
        {event.name || 'Unnamed event'}
        {eventState?.complete && <span className={styles.winner}>All games played</span>}
      </h3>
      {rows.length > 0 ? (
        <table className={styles.standings}>
          <thead>
            <tr>
              <th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th aria-label="Order" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const previous = rows[i - 1];
              const canMoveUp = row.tied && previous?.place === row.place && row.teamId !== undefined;
              return (
                <tr key={row.teamId ?? row.name}>
                  <td>{row.place}{row.tied ? '=' : ''}</td>
                  <td>{row.name}</td>
                  <td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.ties}</td>
                  <td><strong>{row.points}</strong></td>
                  <td>
                    {canMoveUp && (
                      <button className={common.linkButton} onClick={() => moveUp(i)}
                        title={`Put ${row.name} above ${previous.name}`}>
                        Move up
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={common.empty}>The standings show once the bonspiel is saved and its games have teams.</p>
      )}
      {(tied || event.tiebreak?.length) ? (
        <p className={common.blurb}>
          Teams level on points after the games between them share a place. Order them, by a last
          stone draw or a tiebreak game, with Move up, and save to update the standings.
          {event.tiebreak?.length ? (
            <> <button className={common.linkButton} onClick={() => onTiebreak(event.id, [])}>Clear the order</button></>
          ) : null}
        </p>
      ) : null}
      <div className={styles.poolGames}>
        {games.map((game) => (
          <GameCard key={game.id} bonspiel={bonspiel} game={game} state={state?.games[game.id]}
            detail={detail(game)} onOpen={() => onOpenGame(game)} />
        ))}
      </div>
    </section>
  );
}

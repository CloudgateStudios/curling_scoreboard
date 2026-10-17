import { formatDrawStart } from '../../lib/bonspiels';
import type { Bonspiel, BonspielDraw, BonspielGame, BonspielState, Sheet } from '../../types';
import common from '../../styles/common.module.css';
import { GameCard } from './GameCard';
import styles from './DrawBoard.module.css';

interface Props {
  bonspiel: Bonspiel;
  /** In the order they are played. */
  draws: BonspielDraw[];
  sheets: Sheet[];
  /** As the functions last worked it out from the saved plan. */
  state: BonspielState | null;
  onEditDraw: (drawId: string, change: Partial<BonspielDraw>) => void;
  onRemoveDraw: (draw: BonspielDraw) => void;
  onOpenGame: (game: BonspielGame) => void;
  onAddGame: (drawId: string, sheetId: string) => void;
}

/** The bonspiel's draws down the side and the club's sheets across, with a
 *  game in each cell that has one. It scrolls sideways on a narrow screen,
 *  with the draws kept in view. */
export function DrawBoard({
  bonspiel, draws, sheets, state, onEditDraw, onRemoveDraw, onOpenGame, onAddGame,
}: Props) {
  if (draws.length === 0) {
    return <p className={common.empty}>No draws yet. Add the first one to start placing games.</p>;
  }
  if (sheets.length === 0) {
    return <p className={common.empty}>The club has no sheets for games to be played on.</p>;
  }

  // A game on a sheet the club no longer has is still shown, so it can be
  // moved.
  const sheetIds = new Set(sheets.map((s) => s.id));
  const strays = bonspiel.games.filter((g) => !sheetIds.has(g.sheetId));

  return (
    <div className={styles.scroller}>
      <table className={styles.board}>
        <thead>
          <tr>
            <th className={styles.drawHeading}>Draw</th>
            {sheets.map((sheet) => <th key={sheet.id}>{sheet.name}</th>)}
            {strays.length > 0 && <th>Removed sheet</th>}
          </tr>
        </thead>
        <tbody>
          {draws.map((draw) => (
            <tr key={draw.id}>
              <th scope="row" className={styles.drawCell}>
                <div className={styles.drawFields}>
                  <input
                    className={styles.drawLabel}
                    aria-label="Draw name"
                    value={draw.label}
                    maxLength={30}
                    onChange={(e) => onEditDraw(draw.id, { label: e.target.value })}
                  />
                  <input
                    type="datetime-local"
                    className={styles.drawStart}
                    aria-label="Starts"
                    value={draw.start}
                    onChange={(e) => onEditDraw(draw.id, { start: e.target.value })}
                  />
                  <span className={styles.drawWhen}>{formatDrawStart(draw.start)}</span>
                  <button className={styles.removeDraw} onClick={() => onRemoveDraw(draw)}>Remove draw</button>
                </div>
              </th>
              {sheets.map((sheet) => {
                const game = bonspiel.games.find((g) => g.drawId === draw.id && g.sheetId === sheet.id);
                return (
                  <td key={sheet.id}>
                    {game ? (
                      <GameCard bonspiel={bonspiel} game={game} state={state?.games[game.id]} onOpen={() => onOpenGame(game)} />
                    ) : (
                      <button
                        className={styles.addGame}
                        aria-label={`Add a game on ${sheet.name} in ${draw.label}`}
                        onClick={() => onAddGame(draw.id, sheet.id)}
                      >
                        +
                      </button>
                    )}
                  </td>
                );
              })}
              {strays.length > 0 && (
                <td>
                  {strays.filter((g) => g.drawId === draw.id).map((game) => (
                    <GameCard key={game.id} bonspiel={bonspiel} game={game} state={state?.games[game.id]}
                      onOpen={() => onOpenGame(game)} />
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

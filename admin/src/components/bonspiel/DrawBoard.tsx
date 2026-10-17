import { describeSide, formatDrawStart } from '../../lib/bonspiels';
import type {
  Bonspiel, BonspielDraw, BonspielGame, BonspielSide, BonspielState, BonspielStateGame, BonspielStateTeam,
  Sheet, TeamSlot,
} from '../../types';
import common from '../../styles/common.module.css';
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

function GameCard({ bonspiel, game, state, onOpen }: {
  bonspiel: Bonspiel;
  game: BonspielGame;
  state: BonspielStateGame | undefined;
  onOpen: () => void;
}) {
  const event = bonspiel.events.find((e) => e.id === game.eventId);
  // A result given here wins over the saved one, so it shows before saving.
  const shown = withPlannedResult(game, state);
  const final = shown?.status === 'final';
  return (
    <button className={final ? styles.gameFinal : styles.game} onClick={onOpen}>
      <span className={styles.gameHeading}>
        <span className={styles.gameLabel}>{game.label || 'Game'}</span>
        <span className={styles.gameEvent}>{event?.name ?? 'No event'}</span>
      </span>
      <SideLine bonspiel={bonspiel} side={game.team1} slot="team1" state={shown} />
      <SideLine bonspiel={bonspiel} side={game.team2} slot="team2" state={shown} />
      {shown?.tied && <span className={common.warningChip}>Tied: needs a winner</span>}
    </button>
  );
}

/** The game as last worked out, with the result in the plan laid over it,
 *  as the functions will once it is saved. Scores the coordinator left out
 *  are the ones a scoreboard recorded. */
function withPlannedResult(game: BonspielGame, state: BonspielStateGame | undefined): BonspielStateGame | undefined {
  if (!game.result) {
    // A result taken away before saving.
    return state?.resultFrom === 'coordinator'
      ? {
        ...state,
        status: state.team1 && state.team2 ? 'ready' : 'waiting',
        winner: undefined,
        team1Score: undefined,
        team2Score: undefined,
      }
      : state;
  }
  const recorded = state?.sheetGameId ? state : undefined;
  return {
    team1: null,
    team2: null,
    ...state,
    status: 'final',
    winner: game.result.winner,
    tied: undefined,
    team1Score: game.result.team1Score ?? recorded?.team1Score,
    team2Score: game.result.team2Score ?? recorded?.team2Score,
  };
}

/** One side of a game: who it is, once known, and where it came from. */
function SideLine({ bonspiel, side, slot, state }: {
  bonspiel: Bonspiel;
  side: BonspielSide;
  slot: TeamSlot;
  state: BonspielStateGame | undefined;
}) {
  const planned = describeSide(side, bonspiel);
  // A team placed in the plan is shown as it is now, unsaved edits and all.
  // The state, worked out from the saved plan, knows the rest: who came out
  // of earlier games, and who a scoreboard says actually played.
  const team: BonspielStateTeam | null | undefined =
    side !== null && 'teamId' in side && !state?.sheetGameId ? { name: planned } : state?.[slot];
  const linked = side !== null && 'from' in side;
  const score = slot === 'team1' ? state?.team1Score : state?.team2Score;
  const won = state?.winner === slot;
  return (
    <span className={won ? styles.sideWon : styles.side}>
      <span className={styles.sideName}>
        {team?.name ?? <span className={styles.unknown}>{planned}</span>}
        {/* Where a team that has filled in came from. */}
        {team && linked && <span className={styles.sideFrom}>{planned}</span>}
      </span>
      {score !== undefined && <span className={styles.score}>{score}</span>}
      {score === undefined && won && <span className={styles.score}>W</span>}
    </span>
  );
}

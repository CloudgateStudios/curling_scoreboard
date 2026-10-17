import { describeSide } from '../../lib/bonspiels';
import type {
  Bonspiel, BonspielGame, BonspielSide, BonspielStateGame, BonspielStateTeam, TeamSlot,
} from '../../types';
import common from '../../styles/common.module.css';
import styles from './GameCard.module.css';

/** A game of a bonspiel as a button that opens it: its name, both sides and,
 *  once it has one, its result. */
export function GameCard({ bonspiel, game, state, detail, onOpen }: {
  bonspiel: Bonspiel;
  game: BonspielGame;
  /** As the functions last worked it out from the saved plan. */
  state: BonspielStateGame | undefined;
  /** Beside the name: the game's event when absent. */
  detail?: string;
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
        <span className={styles.gameEvent}>{detail ?? event?.name ?? 'No event'}</span>
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

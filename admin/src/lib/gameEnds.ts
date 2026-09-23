import type { Game, GameEnd, TeamSlot } from '../types';

/**
 * Works out whether an end was scored by the given team slot.
 *
 * Games saved since ends were attributed by slot carry scoringTeamSlot, which
 * is unambiguous. Older games only recorded the scoring team's display name,
 * so those fall back to comparing names -- which is wrong if both teams share
 * one, but is the only information those records contain.
 */
export function endScoredBy(
  end: GameEnd,
  slot: TeamSlot,
  game: Pick<Game, 'team1' | 'team2'>,
): boolean {
  if (end.scoringTeamSlot != null) {
    return end.scoringTeamSlot === slot;
  }

  if (end.scoringTeam == null) {
    return false;
  }

  return end.scoringTeam === game[slot].name;
}

/** Score to show for a team in an end: the points, a dash for a blank end. */
export function endScoreLabel(
  end: GameEnd,
  slot: TeamSlot,
  game: Pick<Game, 'team1' | 'team2'>,
): string {
  if (endScoredBy(end, slot, game)) {
    return String(end.score);
  }

  const isBlankEnd = end.scoringTeamSlot == null && end.scoringTeam == null;
  return isBlankEnd ? '—' : '0';
}

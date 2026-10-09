import type { League, LeagueDraw, LeagueTeam } from '../types';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Mon 18:30–20:30, Thu 19:00–21:00", or a note that there is no schedule. */
export function formatDraws(draws: LeagueDraw[]): string {
  if (draws.length === 0) return 'No schedule';
  return sortDraws(draws)
    .map((d) => `${DAY_NAMES[d.day - 1].slice(0, 3)} ${d.start}–${d.end}`)
    .join(', ');
}

export function sortDraws(draws: LeagueDraw[]): LeagueDraw[] {
  return [...draws].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

export function newTeamId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Reads a league document defensively: it may have been written by an
 *  older portal or by hand. */
export function leagueFrom(id: string, data: Record<string, unknown>): League {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    active: data.active !== false,
    seasonStart: typeof data.seasonStart === 'string' ? data.seasonStart : undefined,
    seasonEnd: typeof data.seasonEnd === 'string' ? data.seasonEnd : undefined,
    draws: Array.isArray(data.draws) ? (data.draws as LeagueDraw[]) : [],
    teams: Array.isArray(data.teams) ? (data.teams as LeagueTeam[]) : [],
  };
}

/** The fields stored for a league. Firestore rejects undefined, so optional
 *  values that are not set are left out. */
export function leagueData(league: Omit<League, 'id'>): Record<string, unknown> {
  return {
    name: league.name.trim(),
    active: league.active,
    ...(league.seasonStart ? { seasonStart: league.seasonStart } : {}),
    ...(league.seasonEnd ? { seasonEnd: league.seasonEnd } : {}),
    draws: sortDraws(league.draws),
    teams: league.teams.map((t) => ({
      id: t.id,
      name: t.name.trim(),
      ...(t.externalId ? { externalId: t.externalId } : {}),
    })),
  };
}

/** What is wrong with a league as edited, or null when it can be saved. */
export function leagueProblem(league: Omit<League, 'id'>): string | null {
  if (!league.name.trim()) return 'Give the league a name.';
  if (league.seasonStart && league.seasonEnd && league.seasonEnd < league.seasonStart) {
    return 'The season ends before it starts.';
  }
  for (const draw of league.draws) {
    if (!draw.start || !draw.end) return 'Every draw needs a start and an end time.';
    if (draw.end <= draw.start) return 'A draw has to end after it starts.';
  }
  const names = new Set<string>();
  for (const team of league.teams) {
    const name = team.name.trim().toLowerCase();
    if (!name) return 'Every team needs a name.';
    if (names.has(name)) return `Two teams are called "${team.name.trim()}".`;
    names.add(name);
  }
  return null;
}

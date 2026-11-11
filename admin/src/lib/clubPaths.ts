/** Where each page of a club lives. Every role uses the same paths, so a
 *  link a club admin sends opens the same page for a super admin. */

export type ClubSection =
  | 'overview'
  | 'sheets'
  | 'games'
  | 'leagues'
  | 'bonspiels'
  | 'displays'
  | 'devices'
  | 'settings/club'
  | 'settings/scoreboards'
  | 'settings/public-page'
  | 'settings/integrations'
  | 'users';

export function clubPath(clubId: string, section?: ClubSection): string {
  return section ? `/clubs/${clubId}/${section}` : `/clubs/${clubId}`;
}

export const sheetGamesPath = (clubId: string, sheetId: string) =>
  `/clubs/${clubId}/sheets/${sheetId}/games`;

export const leaguePath = (clubId: string, leagueId: string) =>
  `/clubs/${clubId}/leagues/${leagueId}`;

export const bonspielPath = (clubId: string, bonspielId: string) =>
  `/clubs/${clubId}/bonspiels/${bonspielId}`;

/** The section a club opens on: bonspiel admins have only bonspiels to run,
 *  and open on the one on now when there is one; see bonspielToOpen. */
export function landingSection(role: string | null): ClubSection {
  return role === 'bonspieladmin' ? 'bonspiels' : 'overview';
}

// The club page used to keep its tab, and its settings group, in the query.
const OLD_TABS: Record<string, ClubSection> = {
  sheets: 'sheets',
  leagues: 'leagues',
  bonspiels: 'bonspiels',
  displays: 'displays',
};

const OLD_SETTINGS: Record<string, ClubSection> = {
  scoreboards: 'settings/scoreboards',
  integrations: 'settings/integrations',
  admins: 'users',
};

/** The section an old `?tab=…&section=…` link meant, or null when the query
 *  names none, so bookmarks from before the sidebar still land right. */
export function sectionFromOldQuery(search: string): ClubSection | null {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (!tab) return null;
  if (tab === 'settings') return OLD_SETTINGS[params.get('section') ?? ''] ?? 'settings/scoreboards';
  return OLD_TABS[tab] ?? null;
}

import type { ClubSection } from '../../lib/clubPaths';
import type { UserRole } from '../../types';

export interface SectionInfo {
  id: ClubSection;
  /** In the sidebar. */
  label: string;
  /** At the top of the page. */
  title: string;
  /** Where it sits in the sidebar. Super admin sections are hidden from the
   *  club's own admins. */
  group: 'club' | 'settings' | 'superAdmin';
  /** The guide in docs/guides linked from the page, if there is one. */
  guide: string | null;
  /** Bonspiel admins get the sheets, read only, and the bonspiels. */
  bonspielAdmin: boolean;
}

export const SECTIONS: readonly SectionInfo[] = [
  { id: 'sheets', label: 'Sheets & Games', title: 'Sheets & Games', group: 'club', guide: 'connect-a-scoreboard', bonspielAdmin: true },
  { id: 'leagues', label: 'Leagues', title: 'Leagues', group: 'club', guide: 'set-up-leagues', bonspielAdmin: false },
  { id: 'bonspiels', label: 'Bonspiels', title: 'Bonspiels', group: 'club', guide: 'run-a-bonspiel', bonspielAdmin: true },
  { id: 'displays', label: 'Displays', title: 'Displays', group: 'club', guide: 'set-up-a-display', bonspielAdmin: false },
  { id: 'settings/club', label: 'Club', title: 'Club settings', group: 'settings', guide: null, bonspielAdmin: false },
  { id: 'settings/scoreboards', label: 'Scoreboards', title: 'Scoreboard settings', group: 'settings', guide: 'connect-a-scoreboard', bonspielAdmin: false },
  { id: 'settings/public-page', label: 'Public page', title: 'Public scores page', group: 'settings', guide: 'share-scores-with-members', bonspielAdmin: false },
  { id: 'settings/integrations', label: 'Integrations', title: 'Integrations', group: 'settings', guide: 'post-results-to-chat', bonspielAdmin: false },
  { id: 'users', label: 'Users', title: 'Users', group: 'superAdmin', guide: null, bonspielAdmin: false },
];

/** The sections a role can open, in sidebar order. */
export function sectionsFor(role: Exclude<UserRole, null>): SectionInfo[] {
  return SECTIONS.filter((s) =>
    role === 'superadmin' ? true : role === 'bonspieladmin' ? s.bonspielAdmin : s.group !== 'superAdmin',
  );
}

/** The section a path inside a club belongs to, such as `leagues` for
 *  `leagues/abc`, so the sidebar can mark it while a league is open. */
export function sectionOfPath(rest: string, sections: SectionInfo[]): SectionInfo | undefined {
  return sections.find((s) => rest === s.id || rest.startsWith(`${s.id}/`));
}

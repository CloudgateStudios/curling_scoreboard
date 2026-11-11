// The clubs a super admin opened last, for the sidebar on their own pages.
// Kept in this browser only, and the portal works the same without it.

const KEY = 'recentClubs';
const KEPT = 3;

export function recentClubIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, KEPT) : [];
  } catch {
    return [];
  }
}

export function rememberClub(clubId: string): void {
  try {
    const ids = [clubId, ...recentClubIds().filter((id) => id !== clubId)].slice(0, KEPT);
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked or full: the list just stays as it was.
  }
}

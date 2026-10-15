/** A page a display link can open on the scoreboard site. */
export type DisplayPage =
  | { kind: 'warmRoom' }
  | { kind: 'scoreBug'; sheetId: string };

/**
 * The full URL of a display page. The token goes after the #, which browsers
 * never send to a server, so it stays out of request logs; the page reads it
 * from there and trades it for a sign-in.
 */
export function displayUrl(siteUrl: string, clubId: string, page: DisplayPage, token: string): string {
  const club = `${siteUrl}/display/${encodeURIComponent(clubId)}`;
  const path = page.kind === 'warmRoom'
    ? `${club}/warm-room`
    : `${club}/sheets/${encodeURIComponent(page.sheetId)}/bug`;
  return `${path}#k=${encodeURIComponent(token)}`;
}

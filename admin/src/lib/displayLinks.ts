/** The warm room's views: totals, end by end, or the two in turn. */
export type DisplayView = 'totals' | 'full' | 'cycle';
/** What the score bug's bottom line names. */
export type BugLabel = 'sheet' | 'league' | 'none';

/**
 * What a display link's screens show. Matches isDisplaySettings in
 * firestore.rules and linkPageUrl in functions/src/display/assets/display.js.
 */
export interface DisplaySettings {
  page: 'bug' | 'warm-room';
  /** The score bug's sheet. */
  sheetId?: string;
  /** The warm room's view; totals when absent. */
  view?: DisplayView;
  /** Seconds on each view when cycling; 20 when absent. */
  every?: number;
  /** The score bug's size; 1 when absent. */
  scale?: number;
  /** The score bug's bottom line; the sheet name when absent. */
  label?: BugLabel;
}

export const DEFAULT_SETTINGS: DisplaySettings = { page: 'warm-room' };
export const DEFAULT_EVERY = 20;
export const MIN_EVERY = 5;
export const MAX_EVERY = 300;

/**
 * A link's own URL. It opens whatever the link's settings name and follows
 * them as they change, so it never needs to change itself. The token goes
 * after the #, which browsers never send to a server, so it stays out of
 * request logs.
 */
export function displayUrl(siteUrl: string, clubId: string, token: string): string {
  return `${siteUrl}/display/${encodeURIComponent(clubId)}#k=${encodeURIComponent(token)}`;
}

/**
 * The link's URL in preview mode, for checking a screen while setting it up:
 * a score bug shows an outlined placeholder while its sheet has no game,
 * rather than nothing.
 */
export function displayPreviewUrl(siteUrl: string, clubId: string, token: string): string {
  return displayUrl(siteUrl, clubId, token).replace('#', '?preview#');
}

/** The settings as they are stored: only what the page uses, defaults left out. */
export function settingsToSave(settings: DisplaySettings): DisplaySettings {
  if (settings.page === 'bug' && settings.sheetId) {
    return {
      page: 'bug',
      sheetId: settings.sheetId,
      ...(settings.scale !== undefined && settings.scale !== 1 && { scale: settings.scale }),
      ...(settings.label !== undefined && settings.label !== 'sheet' && { label: settings.label }),
    };
  }
  const view = settings.view ?? 'totals';
  const every = Math.round(settings.every ?? DEFAULT_EVERY);
  return {
    page: 'warm-room',
    ...(view !== 'totals' && { view }),
    ...(view === 'cycle' && every !== DEFAULT_EVERY && { every: Math.min(Math.max(every, MIN_EVERY), MAX_EVERY) }),
  };
}

const VIEW_NAMES: Record<DisplayView, string> = {
  totals: 'totals',
  full: 'end by end',
  cycle: 'totals and end by end in turn',
};

/** A line saying what a link shows, for the portal's list of links. */
export function describeSettings(
  settings: DisplaySettings | undefined,
  sheetName: (sheetId: string) => string | undefined,
): string {
  const s = settings ?? DEFAULT_SETTINGS;
  if (s.page === 'bug') {
    const parts = [`Score bug for ${(s.sheetId && sheetName(s.sheetId)) ?? 'a removed sheet'}`];
    if (s.scale !== undefined && s.scale !== 1) parts.push(`${s.scale}× size`);
    if (s.label === 'league') parts.push('league name');
    if (s.label === 'none') parts.push('no name');
    return parts.join(', ');
  }
  const view = s.view ?? 'totals';
  const every = view === 'cycle' ? `, every ${s.every ?? DEFAULT_EVERY} seconds` : '';
  return `Warm room, ${VIEW_NAMES[view]}${every}`;
}

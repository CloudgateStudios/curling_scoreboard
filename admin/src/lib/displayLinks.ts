/** The warm room's views: totals, end by end, or the two in turn. */
export type DisplayView = 'totals' | 'full' | 'cycle';
/** A bonspiel screen's views: the draw on now and the next, every draw, each
 *  event's bracket, or all of them in turn. */
export type BonspielView = 'now' | 'schedule' | 'brackets' | 'cycle';
/** What the score bug's caption names. */
export type BugLabel = 'sheet' | 'league' | 'none';
/** Which side of the score bug the end box sits on. */
export type BugEndSide = 'left' | 'right';

/**
 * What a display link's screens show. Matches isDisplaySettings in
 * firestore.rules and linkPageUrl in functions/src/display/assets/display.js.
 */
export interface DisplaySettings {
  page: 'bug' | 'warm-room' | 'bonspiel';
  /** The score bug's sheet. */
  sheetId?: string;
  /** The bonspiel screen's bonspiel. */
  bonspielId?: string;
  /** The warm room's view, totals when absent; or the bonspiel screen's, now
   *  when absent. */
  view?: DisplayView | BonspielView;
  /** Seconds on each view when there are several in turn; 20 when absent. */
  every?: number;
  /** The score bug's size; 1 when absent. */
  scale?: number;
  /** The score bug's caption; the sheet name when absent. */
  label?: BugLabel;
  /** The side of the score bug the end box is on; the right when absent. */
  end?: BugEndSide;
  /** Whether the warm room lists the day's finished games beside the
   *  sheets; not when absent. */
  earlier?: boolean;
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
  const every = Math.min(Math.max(Math.round(settings.every ?? DEFAULT_EVERY), MIN_EVERY), MAX_EVERY);
  if (settings.page === 'bonspiel' && settings.bonspielId) {
    const view = BONSPIEL_VIEWS.includes(settings.view as BonspielView) ? settings.view as BonspielView : 'now';
    // Brackets take turns too, an event at a time.
    const turns = view === 'cycle' || view === 'brackets';
    return {
      page: 'bonspiel',
      bonspielId: settings.bonspielId,
      ...(view !== 'now' && { view }),
      ...(turns && every !== DEFAULT_EVERY && { every }),
    };
  }
  if (settings.page === 'bug' && settings.sheetId) {
    return {
      page: 'bug',
      sheetId: settings.sheetId,
      ...(settings.scale !== undefined && settings.scale !== 1 && { scale: settings.scale }),
      ...(settings.label !== undefined && settings.label !== 'sheet' && { label: settings.label }),
      ...(settings.end === 'left' && { end: 'left' as const }),
    };
  }
  const view = WARM_ROOM_VIEWS.includes(settings.view as DisplayView) ? settings.view as DisplayView : 'totals';
  return {
    page: 'warm-room',
    ...(view !== 'totals' && { view }),
    ...(view === 'cycle' && every !== DEFAULT_EVERY && { every }),
    ...(settings.earlier === true && { earlier: true }),
  };
}

const WARM_ROOM_VIEWS: DisplayView[] = ['totals', 'full', 'cycle'];
const BONSPIEL_VIEWS: BonspielView[] = ['now', 'schedule', 'brackets', 'cycle'];

const VIEW_NAMES: Record<DisplayView, string> = {
  totals: 'totals',
  full: 'end by end',
  cycle: 'totals and end by end in turn',
};

const BONSPIEL_VIEW_NAMES: Record<BonspielView, string> = {
  now: 'the draw on now and the next',
  schedule: 'every draw',
  brackets: 'the brackets in turn',
  cycle: 'the draws and brackets in turn',
};

/** A line saying what a link shows, for the portal's list of links. */
export function describeSettings(
  settings: DisplaySettings | undefined,
  sheetName: (sheetId: string) => string | undefined,
  bonspielName: (bonspielId: string) => string | undefined = () => undefined,
): string {
  const s = settings ?? DEFAULT_SETTINGS;
  if (s.page === 'bonspiel') {
    const view = (s.view ?? 'now') as BonspielView;
    const turns = view === 'cycle' || view === 'brackets';
    const every = turns ? `, every ${s.every ?? DEFAULT_EVERY} seconds` : '';
    const name = (s.bonspielId && bonspielName(s.bonspielId)) ?? 'a removed bonspiel';
    return `${name}, ${BONSPIEL_VIEW_NAMES[view] ?? BONSPIEL_VIEW_NAMES.now}${every}`;
  }
  if (s.page === 'bug') {
    const parts = [`Score bug for ${(s.sheetId && sheetName(s.sheetId)) ?? 'a removed sheet'}`];
    if (s.scale !== undefined && s.scale !== 1) parts.push(`${s.scale}× size`);
    if (s.label === 'league') parts.push('league name');
    if (s.label === 'none') parts.push('no name');
    if (s.end === 'left') parts.push('end on the left');
    return parts.join(', ');
  }
  const view = (s.view ?? 'totals') as DisplayView;
  const every = view === 'cycle' ? `, every ${s.every ?? DEFAULT_EVERY} seconds` : '';
  const earlier = s.earlier === true ? ', with earlier results' : '';
  return `Warm room, ${VIEW_NAMES[view] ?? VIEW_NAMES.totals}${every}${earlier}`;
}

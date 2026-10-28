import crypto from 'crypto';
import {
  DisplayEnd, DisplayLeagueDraw, DisplayResult, DisplaySummary, DisplayTeam, sheetView,
} from './state';

// What the public scores page fetches: the club's display summary (see
// ./state.ts) cut down to what a phone shows, in three parts that change at
// different rates, so each can be cached for as long as it allows:
//
//   live.json     every sheet and what it shows now, about a kilobyte, which
//                 changes with each end
//   results.json  the day's finished games, which change when a game ends
//   logo          the club's logo as an image, which changes when an admin
//                 picks another
//
// live.json carries a version of the other two, so a phone fetches them
// again only when they have changed.
//
// Nothing here imports Firebase, so the emulator tests can call it from the
// compiled file. Times are sent as milliseconds.

/** A team as the scores page shows it. */
export interface ScoresTeam {
  name: string;
  /** The rock color's hex, or null for games from before it was recorded. */
  color: string | null;
  score: number;
}

export interface ScoresLiveTeam extends ScoresTeam {
  hasHammer: boolean | null;
}

/** A game on a sheet now: live, or its final score for a while after. */
export interface ScoresGame {
  /** The bonspiel's name for a bonspiel game, otherwise the league's. */
  event: string | null;
  currentEnd: number;
  numberOfEnds: number | null;
  team1: ScoresLiveTeam;
  team2: ScoresLiveTeam;
  /** Null for scoreboards that do not send their ends. */
  ends: DisplayEnd[] | null;
}

export interface ScoresSheet {
  id: string;
  name: string;
  kind: 'live' | 'final' | 'idle';
  /** Absent when the sheet is idle. */
  game?: ScoresGame;
}

export interface ScoresLive {
  title: string | null;
  /** Relative to the page, or null without a logo. */
  logo: string | null;
  /** Changes whenever results.json does. */
  resultsVersion: string;
  sheets: ScoresSheet[];
}

/** A finished game in results.json. The league and bonspiel are as the
 *  warm room's results-model.js reads them, to group the day by draw. */
export interface ScoresResult {
  sheetName: string;
  startedAt: number | null;
  finishedAt: number;
  numberOfEnds: number | null;
  endsPlayed: number;
  league: { name: string; draws: DisplayLeagueDraw[] } | null;
  bonspiel: { name: string } | null;
  team1: ScoresTeam;
  team2: ScoresTeam;
}

export interface ScoresResults {
  results: ScoresResult[];
}

/** The branding document's fields, as the portal saves them. */
export interface ScoresBranding {
  title?: unknown;
  logo?: unknown;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** A short, stable fingerprint of [value]'s JSON, for versions in URLs. */
export function versionOf(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

const LOGO = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/;

/** The logo's image type and bytes, or null when there is none to show.
 *  Kept to the raster types firestore.rules allows. */
export function decodeLogo(logo: unknown): { type: string; bytes: Buffer } | null {
  const match = typeof logo === 'string' ? LOGO.exec(logo) : null;
  return match ? { type: match[1], bytes: Buffer.from(match[2], 'base64') } : null;
}

function team(t: DisplayTeam): ScoresTeam {
  return { name: t.name, color: t.color?.hex ?? null, score: t.score };
}

function liveTeam(t: DisplayTeam, live: boolean): ScoresLiveTeam {
  return { ...team(t), hasHammer: live ? t.hasHammer : null };
}

/** The day's results for results.json, the latest first, as in the summary. */
export function scoresResults(summary: DisplaySummary | null | undefined): ScoresResults {
  return {
    results: (summary?.results ?? []).map((r: DisplayResult) => ({
      sheetName: r.sheetName,
      startedAt: r.startedAt?.toMillis() ?? null,
      finishedAt: r.finishedAt.toMillis(),
      numberOfEnds: r.numberOfEnds,
      endsPlayed: r.endsPlayed,
      league: r.league && { name: r.league.name, draws: r.league.draws },
      bonspiel: r.bonspiel && { name: r.bonspiel.name },
      team1: team(r.team1),
      team2: team(r.team2),
    })),
  };
}

/**
 * live.json for [summary] and [branding] at [now]: each sheet, in name
 * order, with what the club's screens would show on it. Every kind of game
 * is shown, league, bonspiel or neither.
 */
export function scoresLive(
  summary: DisplaySummary | null | undefined,
  branding: ScoresBranding | null | undefined,
  now: number,
): ScoresLive {
  const sheets = Object.entries(summary?.sheets ?? {})
    .sort(([, a], [, b]) => collator.compare(a.name, b.name))
    .map(([id, sheet]): ScoresSheet => {
      const view = sheetView(summary, id, now);
      if (view.kind === 'idle') return { id, name: sheet.name, kind: 'idle' };
      const { game } = view;
      const live = view.kind === 'live';
      return {
        id,
        name: sheet.name,
        kind: view.kind,
        game: {
          event: game.bonspiel?.name ?? game.league?.name ?? null,
          // A finished game has no end being played.
          currentEnd: view.kind === 'live' ? view.game.currentEnd : view.game.endsPlayed,
          numberOfEnds: game.numberOfEnds,
          team1: liveTeam(game.team1, live),
          team2: liveTeam(game.team2, live),
          ends: game.ends,
        },
      };
    });
  const title = typeof branding?.title === 'string' && branding.title !== '' ? branding.title : null;
  const logo = decodeLogo(branding?.logo) ? `logo?v=${versionOf(branding?.logo)}` : null;
  return { title, logo, resultsVersion: versionOf(scoresResults(summary)), sheets };
}

import { readFileSync } from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { LIVE_GAME_TIMEOUT_MS } from '../liveGame';
import { currentProjectId, webConfig } from './firebaseConfig';
import { ScoresBranding, decodeLogo, scoresLive, scoresResults, versionOf } from './scores';
import { DisplaySummary, FINAL_SHOWN_MS } from './state';

// Serves the display pages on the scoreboard's hosting site, under
// /display/** through a Hosting rewrite:
//
//   /display/{clubId}/sheets/{sheetId}/bug   the score bug for live streams
//   /display/{clubId}/warm-room              every sheet, for a screen in the club
//   /display/{clubId}/bonspiels/{bonspielId} a bonspiel's games, schedule and
//                                            brackets, for a screen in the club
//   /display/{clubId}                        whichever of those the display
//                                            link's settings name
//   /display/{clubId}/scores                 the public scores page, for
//                                            members' phones, and the JSON
//                                            and logo it fetches
//   /display/assets/*                        the pages' scripts and styles
//
// The pages are the same for everyone: the display link's token is in the
// URL fragment, which never reaches this function. In the browser the page
// trades it for a sign-in (see ./links.ts) and listens to the club's display
// summary (see ./state.ts). So the pages read nothing from Firestore.
//
// The scores page has no sign-in, so that any number of phones can follow
// it for the same cost. It fetches the summary as JSON from here instead,
// cut down by ./scores.ts and cached by Hosting's CDN, so only a cache miss
// reaches this function and Firestore, however many people are watching.

const runningInEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';
const REGION = 'us-central1';

// Club IDs are slugs or Firestore auto IDs, and sheet IDs auto IDs. Anything
// else is not a page, and keeping to these means an ID can go in the page as is.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Where the page's script finds the Firebase services it talks to. */
function connectSources(projectId: string): string[] {
  if (runningInEmulator) return ['http://127.0.0.1:*', 'http://localhost:*'];
  return [
    'https://firestore.googleapis.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    `https://${REGION}-${projectId}.cloudfunctions.net`,
  ];
}

// Scripts come from this function and the Firebase SDK from gstatic; nothing
// is inline, so there is nothing for an injected tag to run. The pages are
// shown full screen or in OBS, never framed by another site. The scores page
// loads no Firebase and only fetches from here.
function contentSecurityPolicy(projectId: string, page: PageConfig['page']): string {
  const scores = page === 'scores';
  return [
    "default-src 'none'",
    scores ? "script-src 'self'" : "script-src 'self' https://www.gstatic.com",
    "style-src 'self'",
    `connect-src ${scores ? "'self'" : connectSources(projectId).join(' ')}`,
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// The deploy writes the commit it deployed and the release version to
// assets/build.json, and the commit to appConfig/displays once it is live.
// An open page compares the two to know when to reload onto the new version
// (see watchForUpdates in display.js), and reports both to the portal.
// Local and emulator builds have no build.json, and never update.
function readBuild(): { buildId: string; appVersion: string } {
  try {
    const { buildId, version } = JSON.parse(readFileSync(path.join(__dirname, 'assets', 'build.json'), 'utf8'));
    return {
      buildId: typeof buildId === 'string' ? buildId : '',
      appVersion: typeof version === 'string' ? version : '',
    };
  } catch {
    return { buildId: '', appVersion: '' };
  }
}

const BUILD = readBuild();

/** What a page's script is told about where it is and what to show. */
export interface PageConfig {
  page: 'bug' | 'warm-room' | 'bonspiel' | 'link' | 'scores';
  clubId: string;
  sheetId?: string;
  bonspielId?: string;
  firebase: ReturnType<typeof webConfig>;
  region: string;
  /** The deployed commit, or '' for a local build. */
  buildId: string;
  /** The release the deploy was made from, as in app/pubspec.yaml, or ''. */
  appVersion: string;
  /** Set in the emulator, where the page talks to the local emulators. */
  emulators?: { auth: string; firestore: { host: string; port: number }; functions: { host: string; port: number } };
  /** The server's clock, so a display with a wrong clock can allow for it. */
  serverNow: number;
  finalShownMs: number;
  liveGameTimeoutMs: number;
}

// The config goes in the page as a JSON data block, which is never run.
// Escaping < keeps any value from closing the script element early.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function emulatorHosts(req: Request): PageConfig['emulators'] {
  const authHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '127.0.0.1:9099';
  const [firestoreHost, firestorePort] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
  const [functionsHost, functionsPort] = (req.get('host') ?? '127.0.0.1:5001').split(':');
  return {
    auth: `http://${authHost}`,
    firestore: { host: firestoreHost, port: Number(firestorePort) },
    functions: { host: functionsHost, port: Number(functionsPort) },
  };
}

/**
 * The page's HTML. [assetBase] is relative, so the page works both behind the
 * Hosting rewrite and at the emulator's own URL for the function.
 */
export function renderPage(title: string, assetBase: string, config: PageConfig): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<link rel="stylesheet" href="${assetBase}${config.page}.css">
<script type="application/json" id="display-config">${jsonForScript(config)}</script>
<script type="module" src="${assetBase}${config.page}.js"></script>
</head>
<body>
<main id="display" aria-live="polite"></main>
</body>
</html>
`;
}

function pageConfig(
  req: Request,
  page: PageConfig['page'],
  clubId: string,
  ids: { sheetId?: string; bonspielId?: string } = {},
): PageConfig {
  const projectId = currentProjectId();
  return {
    page,
    clubId,
    ...(ids.sheetId !== undefined && { sheetId: ids.sheetId }),
    ...(ids.bonspielId !== undefined && { bonspielId: ids.bonspielId }),
    firebase: webConfig(projectId),
    region: REGION,
    buildId: BUILD.buildId,
    appVersion: BUILD.appVersion,
    ...(runningInEmulator && { emulators: emulatorHosts(req) }),
    serverNow: Date.now(),
    finalShownMs: FINAL_SHOWN_MS,
    liveGameTimeoutMs: LIVE_GAME_TIMEOUT_MS,
  };
}

const app = express();
app.disable('x-powered-by');

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

// Revalidated on every load, so a deploy reaches open displays the next time
// they reload, and unchanged files cost only a 304.
app.use('/display/assets', express.static(path.join(__dirname, 'assets'), {
  index: false,
  redirect: false,
  setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
}));

function sendPage(res: Response, title: string, assetBase: string, config: PageConfig) {
  res.set({
    'Content-Security-Policy': contentSecurityPolicy(currentProjectId(), config.page),
    // Holds the server's time, so it must never come from a cache.
    'Cache-Control': 'no-store',
  });
  res.type('html').send(renderPage(title, assetBase, config));
}

function notFound(res: Response) {
  res.status(404).type('text/plain').send('Not found');
}

app.get('/display/:clubId/sheets/:sheetId/bug', (req: Request, res: Response) => {
  const { clubId, sheetId } = req.params as Record<string, string>;
  if (!ID_PATTERN.test(clubId) || !ID_PATTERN.test(sheetId)) {
    notFound(res);
    return;
  }
  // From /display/{club}/sheets/{sheet}/ back up to /display/.
  sendPage(res, 'Score Bug', '../../../assets/', pageConfig(req, 'bug', clubId, { sheetId }));
});

app.get('/display/:clubId/warm-room', (req: Request, res: Response) => {
  const { clubId } = req.params as Record<string, string>;
  if (!ID_PATTERN.test(clubId)) {
    notFound(res);
    return;
  }
  // From /display/{club}/ back up to /display/.
  sendPage(res, 'Live Scores', '../assets/', pageConfig(req, 'warm-room', clubId));
});

app.get('/display/:clubId/bonspiels/:bonspielId', (req: Request, res: Response) => {
  const { clubId, bonspielId } = req.params as Record<string, string>;
  if (!ID_PATTERN.test(clubId) || !ID_PATTERN.test(bonspielId)) {
    notFound(res);
    return;
  }
  // From /display/{club}/bonspiels/ back up to /display/.
  sendPage(res, 'Bonspiel', '../../assets/', pageConfig(req, 'bonspiel', clubId, { bonspielId }));
});

// --- The public scores page ---

/** How long Hosting's CDN keeps live.json, and so how stale it can be. */
const LIVE_CACHE = 'public, max-age=15, s-maxage=30';
/** results.json is only fetched when live.json says it has changed. */
const RESULTS_CACHE = 'public, max-age=60, s-maxage=300';
/** A club without the page is checked again after this. */
const OFF_CACHE = 'public, max-age=60, s-maxage=60';
/** The branding is read at most this often by each instance: it holds the
 *  logo, up to 250 KB, and only changes when an admin saves it. */
const BRANDING_KEPT_MS = 5 * 60 * 1000;

const brandingKept = new Map<string, { at: number; branding: ScoresBranding | null }>();

async function brandingOf(clubId: string): Promise<ScoresBranding | null> {
  const kept = brandingKept.get(clubId);
  if (kept && Date.now() - kept.at < BRANDING_KEPT_MS) return kept.branding;
  const snap = await getFirestore().doc(`clubs/${clubId}/private/displayBranding`).get();
  const branding = (snap.data() as ScoresBranding | undefined) ?? null;
  brandingKept.set(clubId, { at: Date.now(), branding });
  return branding;
}

/** Whether a club admin has turned the scores page on, in the portal. */
async function scoresOn(clubId: string): Promise<boolean> {
  const snap = await getFirestore().doc(`clubs/${clubId}/private/publicScores`).get();
  return snap.get('enabled') === true;
}

async function summaryOf(clubId: string): Promise<DisplaySummary | null> {
  const snap = await getFirestore().doc(`clubs/${clubId}/private/displayState`).get();
  return (snap.data() as DisplaySummary | undefined) ?? null;
}

// Cached by the CDN too, so polling a club without the page costs as little
// as one with it.
function scoresOff(res: Response) {
  res.set('Cache-Control', OFF_CACHE);
  notFound(res);
}

// Runs [handler] for a club with the scores page on. Express adds an ETag to
// each response and answers a matching If-None-Match with a 304, so a poll
// that finds nothing new costs only headers.
function scoresRoute(handler: (clubId: string, req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const { clubId } = req.params as Record<string, string>;
    if (!ID_PATTERN.test(clubId)) {
      notFound(res);
      return;
    }
    try {
      if (!(await scoresOn(clubId))) {
        scoresOff(res);
        return;
      }
      await handler(clubId, req, res);
    } catch (err) {
      console.error(`Scores for ${clubId} failed`, err);
      res.set('Cache-Control', 'no-store');
      res.status(500).type('text/plain').send('Something went wrong');
    }
  };
}

// The page itself reads nothing: a club without the page turned on finds
// out from live.json, which the CDN keeps.
app.get('/display/:clubId/scores', (req: Request, res: Response) => {
  const { clubId } = req.params as Record<string, string>;
  if (!ID_PATTERN.test(clubId)) {
    notFound(res);
    return;
  }
  // From /display/{club}/ back up to /display/.
  sendPage(res, 'Live Scores', '../assets/', pageConfig(req, 'scores', clubId));
});

app.get('/display/:clubId/scores/live.json', scoresRoute(async (clubId, _req, res) => {
  const [summary, branding] = await Promise.all([summaryOf(clubId), brandingOf(clubId)]);
  res.set('Cache-Control', LIVE_CACHE).json(scoresLive(summary, branding, Date.now()));
}));

app.get('/display/:clubId/scores/results.json', scoresRoute(async (clubId, _req, res) => {
  res.set('Cache-Control', RESULTS_CACHE).json(scoresResults(await summaryOf(clubId)));
}));

// The logo's URL names its version, so the logo it names never changes and
// can be kept for good. An old version's URL gets the current logo, kept
// only briefly.
app.get('/display/:clubId/scores/logo', scoresRoute(async (clubId, req, res) => {
  const branding = await brandingOf(clubId);
  const logo = decodeLogo(branding?.logo);
  if (!logo) {
    scoresOff(res);
    return;
  }
  const current = req.query['v'] === versionOf(branding?.logo);
  res.set('Cache-Control', current ? 'public, max-age=31536000, immutable' : RESULTS_CACHE)
    .type(logo.type).send(logo.bytes);
}));

// A display link's own URL. The page reads the link's settings and opens the
// page they name, which then follows any change an admin makes to them.
app.get('/display/:clubId', (req: Request, res: Response) => {
  const { clubId } = req.params as Record<string, string>;
  if (!ID_PATTERN.test(clubId) || clubId === 'assets') {
    notFound(res);
    return;
  }
  // From /display/ itself.
  sendPage(res, 'Display', 'assets/', pageConfig(req, 'link', clubId));
});

app.use((_req: Request, res: Response) => notFound(res));

// cors: false: these are pages, not an API, so no other site may read them.
export const display = onRequest({ cors: false }, app);

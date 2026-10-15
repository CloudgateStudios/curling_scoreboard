import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { LIVE_GAME_TIMEOUT_MS } from '../liveGame';
import { currentProjectId, webConfig } from './firebaseConfig';
import { FINAL_SHOWN_MS } from './state';

// Serves the display pages on the scoreboard's hosting site, under
// /display/** through a Hosting rewrite:
//
//   /display/{clubId}/sheets/{sheetId}/bug   the score bug for live streams
//   /display/assets/*                        the pages' scripts and styles
//
// The pages are the same for everyone: the display link's token is in the
// URL fragment, which never reaches this function. In the browser the page
// trades it for a sign-in (see ./links.ts) and listens to the club's display
// summary (see ./state.ts). So nothing here reads Firestore, and a request
// costs no reads at all.

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
// shown full screen or in OBS, never framed by another site.
function contentSecurityPolicy(projectId: string): string {
  return [
    "default-src 'none'",
    "script-src 'self' https://www.gstatic.com",
    "style-src 'self'",
    `connect-src ${connectSources(projectId).join(' ')}`,
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** What a page's script is told about where it is and what to show. */
export interface PageConfig {
  page: 'bug';
  clubId: string;
  sheetId?: string;
  firebase: ReturnType<typeof webConfig>;
  region: string;
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

function pageConfig(req: Request, page: PageConfig['page'], clubId: string, sheetId?: string): PageConfig {
  const projectId = currentProjectId();
  return {
    page,
    clubId,
    ...(sheetId !== undefined && { sheetId }),
    firebase: webConfig(projectId),
    region: REGION,
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

app.get('/display/:clubId/sheets/:sheetId/bug', (req: Request, res: Response) => {
  const { clubId, sheetId } = req.params as Record<string, string>;
  if (!ID_PATTERN.test(clubId) || !ID_PATTERN.test(sheetId)) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  const projectId = currentProjectId();
  res.set({
    'Content-Security-Policy': contentSecurityPolicy(projectId),
    // Holds the server's time, so it must never come from a cache.
    'Cache-Control': 'no-store',
  });
  // From /display/{club}/sheets/{sheet}/ back up to /display/.
  res.type('html').send(renderPage('Score Bug', '../../../assets/', pageConfig(req, 'bug', clubId, sheetId)));
});

app.use((_req: Request, res: Response) => {
  res.status(404).type('text/plain').send('Not found');
});

// cors: false: these are pages, not an API, so no other site may read them.
export const display = onRequest({ cors: false }, app);

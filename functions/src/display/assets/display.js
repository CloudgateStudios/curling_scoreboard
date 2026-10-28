// Shared by the display pages: signs in with the display link in the URL,
// listens to the club's display summary, and works out what to show for a
// sheet. Served as is by the display function; there is no build step.

// Keep in step with the firebase version in admin/package.json.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  browserLocalPersistence, connectAuthEmulator, inMemoryPersistence, indexedDBLocalPersistence,
  initializeAuth, onAuthStateChanged, signInWithCustomToken, signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  connectFirestoreEmulator, doc, getFirestore, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  connectFunctionsEmulator, getFunctions, httpsCallable,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';

/** What the display function put in the page. */
export const config = JSON.parse(document.getElementById('display-config').textContent);

// The device's clock may be off, which would end a final score early or
// keep it too long. The page was made a moment ago with the server's time.
const clockOffset = config.serverNow - Date.now();

/** The current time by the server's clock, give or take the page load. */
export function now() {
  return Date.now() + clockOffset;
}

/**
 * The sheet's latest finished game in the summary's results, or null. Mirrors
 * lastGameOf in functions/src/display/state.ts.
 */
export function lastGameOf(summary, sheetId) {
  let last = null;
  for (const result of summary?.results ?? []) {
    if (result?.sheetId !== sheetId || typeof result.finishedAt?.toMillis !== 'function') continue;
    if (!last || result.finishedAt.toMillis() > last.finishedAt.toMillis()) last = result;
  }
  return last;
}

/**
 * What to show for the sheet [sheetId] in [summary]: { kind: 'live' |
 * 'final', game } or { kind: 'idle' }. Mirrors sheetView in
 * functions/src/display/state.ts, which the emulator tests cover; the limits
 * come from the same constants.
 */
export function sheetView(summary, sheetId, at) {
  const live = summary?.sheets?.[sheetId]?.live;
  if (live && (!live.updatedAt || at - live.updatedAt.toMillis() <= config.liveGameTimeoutMs)) {
    return { kind: 'live', game: live };
  }
  const last = lastGameOf(summary, sheetId);
  if (last && at - last.finishedAt.toMillis() <= config.finalShownMs) {
    return { kind: 'final', game: last };
  }
  return { kind: 'idle' };
}

/**
 * True when a live game has played its ends and is not tied, so it is over
 * though nobody has tapped Finish Game yet. Mirrors isGameComplete in the
 * app's CurlingGame. Unknown for scoreboards that do not send their ends.
 */
export function isPlayedOut(game) {
  return Boolean(game.numberOfEnds && game.ends
    && game.ends.length >= game.numberOfEnds && game.team1.score !== game.team2.score);
}

/** What a display says about where a game is: the end, or Final. */
export function endLabel(view) {
  if (view.kind === 'final' || isPlayedOut(view.game)) return 'Final';
  const { currentEnd, numberOfEnds } = view.game;
  return numberOfEnds && currentEnd > numberOfEnds ? 'Extra end' : `End ${currentEnd}`;
}

/** The link's token, from #k=<token> in the URL. */
function linkToken() {
  return new URLSearchParams(location.hash.slice(1)).get('k') ?? '';
}

// /display/, wherever the pages are served from: these files are in
// /display/assets/.
const DISPLAY_BASE = new URL('../', import.meta.url);

/**
 * The page a display link's settings name, as a URL without the token:
 * a sheet's score bug, a bonspiel or the warm room, with options left out at
 * their defaults. Mirrors the options bug.js, bonspiel.js and warm-room.js
 * read.
 */
export function linkPageUrl(settings) {
  const club = encodeURIComponent(config.clubId);
  const query = new URLSearchParams();
  let path;
  if (settings?.page === 'bonspiel' && typeof settings.bonspielId === 'string') {
    path = `${club}/bonspiels/${encodeURIComponent(settings.bonspielId)}`;
    if (settings.view && settings.view !== 'now') query.set('view', settings.view);
    // The brackets take turns too, an event at a time.
    const turns = settings.view === 'cycle' || settings.view === 'brackets';
    if (turns && settings.every && settings.every !== 20) {
      query.set('every', String(settings.every));
    }
  } else if (settings?.page === 'bug' && typeof settings.sheetId === 'string') {
    path = `${club}/sheets/${encodeURIComponent(settings.sheetId)}/bug`;
    if (settings.scale && settings.scale !== 1) query.set('scale', String(settings.scale));
    if (settings.label && settings.label !== 'sheet') query.set('label', settings.label);
    if (settings.end === 'left') query.set('end', 'left');
  } else {
    path = `${club}/warm-room`;
    if (settings?.view && settings.view !== 'totals') query.set('view', settings.view);
    if (settings?.view === 'cycle' && settings.every && settings.every !== 20) {
      query.set('every', String(settings.every));
    }
    if (settings?.earlier === true) query.set('earlier', 'today');
  }
  const url = new URL(path, DISPLAY_BASE);
  url.search = query.toString();
  return url;
}

/**
 * Whether this page was opened from its display link's own URL, and so
 * follows the link's settings. Pages opened at their own URL stay put.
 */
export const followsLink = new URLSearchParams(location.hash.slice(1)).get('link') === '1';

/**
 * Moves to the page the link's settings name, unless this is it already.
 * The sign-in is kept in the browser, so the new page carries straight on.
 */
export function followLink(settings) {
  if (!settings) return;
  const target = linkPageUrl(settings);
  // ?preview is for whoever is setting up this screen, whatever it shows.
  const preview = new URLSearchParams(location.search).get('preview');
  if (preview !== null) target.searchParams.set('preview', preview);
  if (target.pathname === location.pathname && target.search === location.search) return;
  target.hash = `k=${encodeURIComponent(linkToken())}&link=1`;
  location.replace(target.href);
}

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

/**
 * Signs in and calls onSummary with the club's display summary (or null
 * before the club has one) each time it changes. onStatus is told what is
 * happening: 'connecting', 'live', 'no-link', 'bad-link' or 'offline'.
 * onBranding, if given, gets the club's title and logo for its displays, or
 * null when it has none, and onLink the display link's settings, or null
 * once the link is removed. Each of extraDocs, { what, path, on }, has `on`
 * called with the club's document at `path`, relative to the club, or null
 * while there is none. Each is optional; the first of onSummary and
 * onLink given is the one the page needs, whose failures are retried.
 *
 * A display is left running for weeks, so every failure is retried, apart
 * from a link the server has refused, which needs someone to fix the URL.
 */
export function connect({ onSummary, onStatus, onBranding, onLink, extraDocs = [] }) {
  const token = linkToken();
  if (!token) {
    onStatus('no-link');
    return;
  }
  const linkId = token.split('.')[0];

  const app = initializeApp(config.firebase);
  // Kept on the device, so a reload carries on without a new session.
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
  });
  const db = getFirestore(app);
  const functions = getFunctions(app, config.region);
  if (config.emulators) {
    connectAuthEmulator(auth, config.emulators.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, config.emulators.firestore.host, config.emulators.firestore.port);
    connectFunctionsEmulator(functions, config.emulators.functions.host, config.emulators.functions.port);
  }
  const startSession = httpsCallable(functions, 'startDisplaySession');

  let unsubscribe = null;
  // The listeners the page can do without.
  let extras = [];
  let retryMs = RETRY_MIN_MS;
  let retryTimer = null;
  let starting = false;

  function stopListening() {
    unsubscribe?.();
    unsubscribe = null;
    for (const stop of extras) stop();
    extras = [];
  }

  function retryLater() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(start, retryMs);
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  }

  // Whether the signed in user is this link's display for this club. A
  // device can be moved to another link or club with the same storage.
  async function signedInAsLink(user) {
    if (!user) return false;
    const { claims } = await user.getIdTokenResult();
    return claims.role === 'display' && claims.clubId === config.clubId && claims.linkId === linkId;
  }

  async function start() {
    if (starting) return;
    starting = true;
    stopListening();
    onStatus('connecting');
    try {
      await auth.authStateReady();
      if (!(await signedInAsLink(auth.currentUser))) {
        if (auth.currentUser) await signOut(auth);
        const session = await startSession({ clubId: config.clubId, token });
        await signInWithCustomToken(auth, session.data.token);
      }
      listen();
    } catch (err) {
      if (err?.code === 'functions/permission-denied' || err?.code === 'functions/invalid-argument') {
        onStatus('bad-link');
        // Checked again now and then, in case it was a mistake put right.
        retryMs = RETRY_MAX_MS;
      } else {
        console.warn('Display could not connect', err);
        onStatus('offline');
      }
      retryLater();
    } finally {
      starting = false;
    }
  }

  function listen() {
    const club = ['clubs', config.clubId];
    const watched = [
      onSummary && { what: 'summary', ref: doc(db, ...club, 'private', 'displayState'), on: onSummary },
      // Only the settings: the rest of the link is the portal's. A link from
      // before settings existed shows the warm room, as a new one does.
      onLink && {
        what: 'link',
        ref: doc(db, ...club, 'displayLinks', linkId),
        on: (link) => onLink(link ? (link.settings ?? { page: 'warm-room' }) : null),
      },
      onBranding && { what: 'branding', ref: doc(db, ...club, 'private', 'displayBranding'), on: onBranding },
      ...extraDocs.map(({ what, path, on }) => ({ what, ref: doc(db, ...club, ...path), on })),
    ].filter(Boolean);
    const [main, ...rest] = watched;
    const dataOf = (snap) => (snap.exists() ? snap.data() : null);

    // Nice to have: whatever goes wrong with these, the page carries on, and
    // the main listener sorts out the sign-in.
    for (const watch of rest) {
      extras.push(onSnapshot(watch.ref, (snap) => watch.on(dataOf(snap)),
        (err) => console.warn(`Display ${watch.what} listener stopped`, err)));
    }
    unsubscribe = onSnapshot(main.ref, (snap) => {
      retryMs = RETRY_MIN_MS;
      onStatus('live');
      main.on(dataOf(snap));
    }, (err) => {
      // Firestore reconnects by itself after network trouble, so an error
      // here is final for this listener: usually a link that was removed,
      // whose sign-in has run out. Starting again finds out.
      console.warn(`Display ${main.what} listener stopped`, err);
      unsubscribe = null;
      onStatus(err?.code === 'permission-denied' ? 'connecting' : 'offline');
      if (err?.code === 'permission-denied') signOut(auth).catch(() => {});
      retryLater();
    });
  }

  // A removed link's user can no longer renew its sign-in, so it is signed
  // out; start again, which reports the link as no longer valid.
  onAuthStateChanged(auth, (user) => {
    if (!user && unsubscribe) {
      stopListening();
      start();
    }
  });

  start();
}

/** Black or white, whichever reads better on the hex color. */
export function textColorOn(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return '#fff';
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#111' : '#fff';
}

/** Creates an element with a class and, optionally, its text. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** What the page says when it has nothing to show because of the link. */
export const STATUS_MESSAGES = {
  'no-link': 'This display link is incomplete. Copy it again from the admin portal.',
  'bad-link': 'This display link is not valid. Ask a club admin for a new one.',
  'removed-link': 'This display link has been removed. Ask a club admin for a new one.',
};

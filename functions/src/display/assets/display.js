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
 * What to show for a sheet: { kind: 'live' | 'final', game } or { kind: 'idle' }.
 * Mirrors sheetView in functions/src/display/state.ts, which the emulator
 * tests cover; the limits come from the same constants.
 */
export function sheetView(sheet, at) {
  const live = sheet?.live;
  if (live && (!live.updatedAt || at - live.updatedAt.toMillis() <= config.liveGameTimeoutMs)) {
    return { kind: 'live', game: live };
  }
  const last = sheet?.lastGame;
  if (last && at - last.finishedAt.toMillis() <= config.finalShownMs) {
    return { kind: 'final', game: last };
  }
  return { kind: 'idle' };
}

/** The link's token, from #k=<token> in the URL. */
function linkToken() {
  return new URLSearchParams(location.hash.slice(1)).get('k') ?? '';
}

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

/**
 * Signs in and calls onSummary with the club's display summary (or null
 * before the club has one) each time it changes. onStatus is told what is
 * happening: 'connecting', 'live', 'no-link', 'bad-link' or 'offline'.
 *
 * A display is left running for weeks, so every failure is retried, apart
 * from a link the server has refused, which needs someone to fix the URL.
 */
export function connect({ onSummary, onStatus }) {
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
  let retryMs = RETRY_MIN_MS;
  let retryTimer = null;
  let starting = false;

  function stopListening() {
    unsubscribe?.();
    unsubscribe = null;
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
    const ref = doc(db, 'clubs', config.clubId, 'private', 'displayState');
    unsubscribe = onSnapshot(ref, (snap) => {
      retryMs = RETRY_MIN_MS;
      onStatus('live');
      onSummary(snap.exists() ? snap.data() : null);
    }, (err) => {
      // Firestore reconnects by itself after network trouble, so an error
      // here is final for this listener: usually a link that was removed,
      // whose sign-in has run out. Starting again finds out.
      console.warn('Display summary listener stopped', err);
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
};

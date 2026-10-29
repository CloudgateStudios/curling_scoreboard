#!/usr/bin/env node
// Plays one short game as a scoreboard, the way the app's SyncService does,
// and checks the result reaches everything that shows it. Each check prints
// PASS, FAIL or SKIP; the exit code is 1 if any failed. It is the scripted
// part of the smoke test in docs/upgrade-smoke-test.md, run after a runtime
// or tooling upgrade reaches dev.
//
// It writes to the project: pairs the sheet, sends a status report, plays a
// 2 end game (Red 2, Yellow 1) that stays in the sheet's history, and
// disconnects. If the club has a completed game webhook, the game is posted
// to it. smoke-test-emulators.mjs runs it against the emulators instead.
//
// Prerequisites: `npm install` in this folder, and for ADMIN=1 application
// default credentials (`gcloud auth application-default login`).
//
//   PAIRING_CODE=... ADMIN_PIN=... node smoke-test.mjs                  # dev
//   FIREBASE_PROJECT_ID=curling-scoreboard-prod PAIRING_CODE=... ...    # prod
//
// Environment:
//   PAIRING_CODE   required: a fresh code for the test sheet, from the portal
//   ADMIN_PIN      required: the club's scoreboard admin PIN
//   CLUB_API_KEY   optional: the club's API key, for the REST API checks
//   PUBLIC_SCORES  optional: 1 if the club's public scores page is turned on
//   ADMIN          optional: 1 to also read Firestore with firebase-admin
//   EMULATOR       optional: a demo- project ID, to run against the emulators

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteField, doc, getFirestore,
  serverTimestamp, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const EMULATOR = process.env.EMULATOR;
const PROJECT = EMULATOR ?? process.env.FIREBASE_PROJECT_ID ?? 'curling-scoreboard-dev';
const PAIRING_CODE = required('PAIRING_CODE');
const ADMIN_PIN = required('ADMIN_PIN');
const API_KEY = process.env.CLUB_API_KEY;
const PUBLIC_SCORES = process.env.PUBLIC_SCORES === '1';
const ADMIN = process.env.ADMIN === '1';

// The web app configs, as in admin/src/lib/firebase.ts. Not secret.
const configs = {
  'curling-scoreboard-dev': {
    apiKey: 'AIzaSyDXCUM2AxKD73rQIy53ArxDspVYbVDBJ68', // cspell:disable-line
    authDomain: 'curling-scoreboard-dev.firebaseapp.com',
    projectId: 'curling-scoreboard-dev',
    appId: '1:233388384349:web:089c4df4fd9230c9076db4',
  },
  'curling-scoreboard-prod': {
    apiKey: 'AIzaSyDKWdlQbyMrhlVd7IvzXlFGukUHeGgHZh4', // cspell:disable-line
    authDomain: 'curling-scoreboard-prod.firebaseapp.com',
    projectId: 'curling-scoreboard-prod',
    appId: '1:513864345938:web:38ea0259c2b9099002b28b',
  },
};
const config = EMULATOR
  ? { apiKey: 'demo-key', projectId: PROJECT, appId: 'demo' }
  : configs[PROJECT];
if (!config) {
  console.error(`No web config for ${PROJECT}.`);
  process.exit(2);
}
const SITE = `https://${PROJECT}.web.app`;
const apiUrl = (path) => EMULATOR
  ? `http://127.0.0.1:5001/${PROJECT}/us-central1/api/api/v1${path}`
  : `${SITE}/api/v1${path}`;
// A query string the page ignores, so Hosting's CDN answers fresh.
const displayUrl = (path) => (EMULATOR
  ? `http://127.0.0.1:5001/${PROJECT}/us-central1/display/display${path}`
  : `${SITE}/display${path}`) + `?fresh=${Date.now()}`;

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}.`);
    process.exit(2);
  }
  return value;
}

const results = [];
function record(status, name, detail = '') {
  results.push({ status, name, detail });
  console.log(`${status.padEnd(4)}  ${name}${detail ? `: ${detail}` : ''}`);
}
const pass = (name, detail) => record('PASS', name, detail);
const fail = (name, detail) => record('FAIL', name, detail);
const skip = (name, detail) => record('SKIP', name, detail);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Asks until check() returns something truthy, for up to a minute, since
// the triggers run a few seconds after each write.
async function eventually(name, check, describe) {
  let last;
  for (let i = 0; i < 30; i++) {
    try {
      last = await check();
      if (last) {
        pass(name, describe?.(last));
        return last;
      }
    } catch (err) {
      last = err;
    }
    await sleep(2000);
  }
  fail(name, last instanceof Error ? last.message : 'nothing after 60 seconds');
  return null;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

async function expectCallableError(name, call, code) {
  try {
    await call();
    fail(name, `succeeded, expected ${code}`);
  } catch (err) {
    if (err.code === `functions/${code}`) pass(name, code);
    else fail(name, `${err.code ?? err.message}, expected ${code}`);
  }
}

// --- the scoreboard ------------------------------------------------------

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');
if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
const call = (name, data) => httpsCallable(functions, name)(data).then((r) => r.data);

const red = { name: 'Red', hex: '#F44336' };
const yellow = { name: 'Yellow', hex: '#FFEB3B' };
const startedAt = new Date();
const ends = [
  { endNumber: 1, scoringTeam: 'Red', scoringTeamSlot: 'team1', score: 2, gameTimeInSeconds: 840 },
  { endNumber: 2, scoringTeam: 'Yellow', scoringTeamSlot: 'team2', score: 1, gameTimeInSeconds: 1710 },
];

// What SyncService.pushLiveGame writes after [played] ends. Red had last
// stone in the first end; the hammer goes to whoever did not score.
function liveGame(played) {
  const score = (slot) => ends.slice(0, played)
    .filter((e) => e.scoringTeamSlot === slot).reduce((sum, e) => sum + e.score, 0);
  const last = ends[played - 1];
  const redHasHammer = last ? last.scoringTeamSlot === 'team2' : true;
  return {
    updatedAt: serverTimestamp(),
    currentEnd: played + 1,
    numberOfEnds: 2,
    team1: { name: 'Red', color: red, score: score('team1'), hasHammer: redHasHammer, hadLastStoneFirstEnd: true },
    team2: { name: 'Yellow', color: yellow, score: score('team2'), hasHammer: !redHasHammer, hadLastStoneFirstEnd: false },
    ends: ends.slice(0, played),
  };
}

console.log(`Project ${PROJECT}\n`);

await signInAnonymously(auth);
pass('Signs in anonymously', auth.currentUser.uid);

await expectCallableError('pairSheet turns away an unknown code',
  () => call('pairSheet', { pairingCode: 'ZZZZZZ' }), 'not-found');

let paired;
try {
  paired = await call('pairSheet', { pairingCode: PAIRING_CODE });
  pass('pairSheet pairs with the code', `${paired.clubName} – ${paired.sheetName}`);
} catch (err) {
  fail('pairSheet pairs with the code', err.code ?? err.message);
  process.exit(1);
}
const { clubId, sheetId, sheetName } = paired;
const sheetRef = doc(db, 'clubs', clubId, 'sheets', sheetId);

const token = await auth.currentUser.getIdTokenResult(true);
if (token.claims.role === 'scoreboard' && token.claims.sheetId === sheetId) {
  pass('The scoreboard has its claims', `role scoreboard, sheet ${sheetId}`);
} else {
  fail('The scoreboard has its claims', JSON.stringify(token.claims));
}

try {
  await updateDoc(sheetRef, {
    device: {
      appVersion: 'smoke-test', platform: 'script', timezone: 'UTC', utcOffsetMinutes: 0,
      sessionStartedAt: serverTimestamp(), clientTime: Timestamp.now(), lastSeenAt: serverTimestamp(),
    },
  });
  pass('Sends a status report');
} catch (err) {
  fail('Sends a status report', err.code ?? err.message);
}

// --- playing ---------------------------------------------------------------

const apiHeaders = { 'X-API-Key': API_KEY };
const publicLive = async () => {
  const live = await getJson(displayUrl(`/${clubId}/scores/live.json`));
  return live.sheets.find((s) => s.id === sheetId);
};

for (const played of [0, 1, 2]) {
  try {
    await updateDoc(sheetRef, { liveGame: liveGame(played) });
    pass(`Pushes the live game after ${played} ends`);
  } catch (err) {
    fail(`Pushes the live game after ${played} ends`, err.code ?? err.message);
  }
}

if (API_KEY) {
  await eventually('REST API shows the live game', async () => {
    const sheet = await getJson(apiUrl(`/clubs/${clubId}/sheets/${sheetId}`), apiHeaders);
    const g = sheet.liveGame;
    return g?.currentEnd === 3 && g.team1.score === 2 && g.team2.score === 1 && g.ends?.length === 2 && g;
  }, (g) => `end ${g.currentEnd}, Red ${g.team1.score}, Yellow ${g.team2.score}`);
} else {
  skip('REST API shows the live game', 'no CLUB_API_KEY');
}

if (PUBLIC_SCORES) {
  // live.json is built from the display summary, so this shows that
  // syncDisplaySheet ran.
  await eventually('Public scores show the live game (syncDisplaySheet)', async () => {
    const sheet = await publicLive();
    return sheet?.kind === 'live' && sheet.game.currentEnd === 3 && sheet.game.team1.score === 2 && sheet;
  }, (s) => `${s.name}: live, end ${s.game.currentEnd}`);
} else {
  skip('Public scores show the live game (syncDisplaySheet)', 'PUBLIC_SCORES not 1');
}

// --- finishing ---------------------------------------------------------------

const gameRef = doc(collection(sheetRef, 'games'));
const finishedAt = Timestamp.now();
try {
  await writeBatch(db)
    .set(gameRef, {
      startedAt: Timestamp.fromDate(startedAt),
      finishedAt,
      numberOfEnds: 2,
      team1: { name: 'Red', color: red, totalScore: 2, hadLastStoneFirstEnd: true },
      team2: { name: 'Yellow', color: yellow, totalScore: 1, hadLastStoneFirstEnd: false },
      ends,
    })
    .update(sheetRef, { liveGame: deleteField() })
    .commit();
  pass('Finishes the game', `games/${gameRef.id}`);
} catch (err) {
  fail('Finishes the game', err.code ?? err.message);
}

if (API_KEY) {
  await eventually('REST API lists the finished game', async () => {
    const { games } = await getJson(apiUrl(`/clubs/${clubId}/sheets/${sheetId}/games?limit=5`), apiHeaders);
    const game = games.find((g) => g.id === gameRef.id);
    return game?.team1?.totalScore === 2 && game.ends?.length === 2 && game;
  }, (g) => `Red ${g.team1.totalScore}, Yellow ${g.team2.totalScore}`);
  await eventually('REST API shows the sheet idle', async () => {
    const sheet = await getJson(apiUrl(`/clubs/${clubId}/sheets/${sheetId}`), apiHeaders);
    return sheet.liveGame === null ? sheet : null;
  });
} else {
  skip('REST API lists the finished game', 'no CLUB_API_KEY');
}

if (PUBLIC_SCORES) {
  await eventually('Public scores show the final score (syncDisplayResults)', async () => {
    const sheet = await publicLive();
    return sheet?.kind === 'final' && sheet.game.team1.score === 2 && sheet.game.team2.score === 1 && sheet;
  }, (s) => `${s.name}: final, Red ${s.game.team1.score}, Yellow ${s.game.team2.score}`);
  await eventually('results.json has the game', async () => {
    const { results: list } = await getJson(displayUrl(`/${clubId}/scores/results.json`));
    return list.find((r) => r.sheetName === sheetName && r.finishedAt === finishedAt.toMillis());
  }, (r) => `${r.sheetName}, ${r.endsPlayed} ends`);
} else {
  skip('Public scores show the final score (syncDisplayResults)', 'PUBLIC_SCORES not 1');
}

// A credentials problem here must not stop the script before it disconnects.
if (ADMIN) try {
  const { initializeApp: initAdmin } = await import('firebase-admin/app');
  const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');
  const adminDb = adminFirestore(initAdmin({ projectId: PROJECT }, 'admin'));
  const club = adminDb.collection('clubs').doc(clubId);
  await eventually('Display summary has the game (syncDisplayResults)', async () => {
    const state = await club.collection('private').doc('displayState').get();
    const entry = state.get('results')?.find((r) => r.gameId === gameRef.id);
    const live = state.get(`sheets.${sheetId}.live`);
    return entry && live === null && entry;
  }, (r) => `${r.sheetName}, ends played ${r.endsPlayed}`);
  const webhook = await club.collection('private').doc('webhook').get();
  if (webhook.exists && webhook.get('games') === 'all') {
    const adminGame = club.collection('sheets').doc(sheetId).collection('games').doc(gameRef.id);
    // The function marks the game before posting and records how it went
    // after, so wait for the outcome, then judge it.
    const result = await eventually('Webhook tried the game (sendCompletedGameWebhook)', async () => {
      const outcome = (await adminGame.get()).get('webhook');
      return outcome?.ok !== undefined && outcome;
    }, (w) => (w.ok ? `HTTP ${w.status}` : `failed: ${w.error ?? `HTTP ${w.status}`}`));
    if (result?.ok) pass('Webhook delivered the game', `HTTP ${result.status}`);
    else if (result) fail('Webhook delivered the game', result.error ?? `HTTP ${result.status}`);
  } else {
    skip('Webhook posted the game (sendCompletedGameWebhook)',
      webhook.exists ? `the webhook posts ${webhook.get('games')} games only` : 'the club has no webhook');
  }
} catch (err) {
  fail('Reads Firestore with firebase-admin', err.message);
} else {
  skip('Display summary and webhook, read with firebase-admin', 'ADMIN not 1');
}

// --- disconnecting -------------------------------------------------------

const wrongPin = ADMIN_PIN === '0000' ? '1111' : '0000';
await expectCallableError('unpairSheet keeps the sheet on a wrong PIN',
  () => call('unpairSheet', { clubId, sheetId, pin: wrongPin }), 'permission-denied');
try {
  const result = await call('unpairSheet', { clubId, sheetId, pin: ADMIN_PIN });
  if (result.unpaired === true) pass('unpairSheet disconnects with the PIN');
  else fail('unpairSheet disconnects with the PIN', JSON.stringify(result));
} catch (err) {
  fail('unpairSheet disconnects with the PIN', err.code ?? err.message);
}
try {
  await updateDoc(sheetRef, { device: { appVersion: 'smoke-test-after' } });
  fail('The disconnected scoreboard can no longer write', 'the write was allowed');
} catch (err) {
  if (err.code === 'permission-denied') pass('The disconnected scoreboard can no longer write');
  else fail('The disconnected scoreboard can no longer write', err.code ?? err.message);
}

const failed = results.filter((r) => r.status === 'FAIL').length;
console.log(`\n${results.length - failed} of ${results.length} passed or skipped; ${failed} failed.`);
console.log(`Test game: clubs/${clubId}/sheets/${sheetId}/games/${gameRef.id}`);
process.exit(failed ? 1 : 0);

// Exercises the Cloud Functions in ../functions against the Firestore, Auth
// and Functions emulators. Run with `npm run test:functions`, which builds the
// functions first and starts the emulators around this file.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, getAuth, signInAnonymously, signInWithCustomToken, signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator, doc as clientDoc, getDoc as clientGetDoc, getFirestore as getClientFirestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  FINAL_SHOWN_MS, MAX_RESULTS, RESULTS_KEPT_MS, displayFinishedGame, displayLiveGame, lastGameOf, leagueDraws,
  sheetView, withResult,
} from '../functions/lib/display/state.js';
import { resolveBonspiel } from '../functions/lib/bonspiels/state.js';
import {
  bracketRounds, currentDraw, isPool, nextDraw, resultOf, sideOf,
} from '../functions/lib/display/assets/bonspiel-model.js';
import {
  endedOffSchedule, todaysDraws, winnerOf,
} from '../functions/lib/display/assets/results-model.js';
import {
  RETRY_RELOAD_AFTER_MS, canReload, targetBuild, timeUntilNextDailyCheck,
} from '../functions/lib/display/assets/update-model.js';
import { decodeLogo, scoresLive, scoresResults, versionOf } from '../functions/lib/display/scores.js';
import {
  IDLE_PAUSE_MS, LIVE_POLL_MS, QUIET_POLL_MS, asSummaryResults, isIdle, pollDelay, timeUntilDue,
} from '../functions/lib/display/assets/scores-model.js';

const PROJECT_ID = 'demo-functions';
const API_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/api/api/v1`;

// The emulators:exec wrapper points the Admin SDK at the emulators through
// FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.
const adminApp = initializeAdminApp({ projectId: PROJECT_ID });
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);

const clientApps = [];

// A separate client app per caller, so each has its own signed in user.
async function clientFor(signIn) {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, `client-${clientApps.length}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  if (signIn) await signIn(auth);
  return { app, auth, call: (name, data) => httpsCallable(functions, name)(data) };
}

const anonymous = () => clientFor((auth) => signInAnonymously(auth));

async function userWithClaims(email, claims) {
  const user = await adminAuth.createUser({ email, password: 'password123' });
  await adminAuth.setCustomUserClaims(user.uid, claims);
  return clientFor((auth) => signInWithEmailAndPassword(auth, email, 'password123'));
}

const superAdmin = (email) => userWithClaims(email, { role: 'superadmin', clubId: null });

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code);
    return true;
  });
}

// Triggers run some time after the write, so wait for what they do.
async function waitFor(what, check) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

before(async () => {
  await db.doc('clubs/club-a').set({ name: 'Club A' });
  await db.doc('clubs/club-a/private/apiKey').set({ key: 'key-a' });
  // Carries the status of a scoreboard that was paired here before.
  await db.doc('clubs/club-a/sheets/sheet-open').set({
    name: 'Sheet Open', pairingCode: 'ABC234', device: { appVersion: '0.0.1' },
  });
  await db.doc('clubs/club-a/sheets/sheet-other').set({
    name: 'Sheet Other', scoreboardUid: 'some-device', device: { appVersion: '0.0.46' },
  });
  // A club still in the pre-migration shape, with the key on the club doc.
  // Kept apart from club-a, whose sheets the API tests list.
  await db.doc('clubs/club-pairing').set({ name: 'Club Pairing' });
  await db.doc('clubs/legacy').set({ name: 'Legacy Club', apiKey: 'legacy-key' });
});

after(async () => {
  await Promise.all(clientApps.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
});

describe('pairSheet', () => {
  test('rejects callers who are not signed in', async () => {
    const client = await clientFor();
    await rejectsWith(client.call('pairSheet', { pairingCode: 'ABC234' }), 'functions/unauthenticated');
  });

  test('rejects a missing pairing code', async () => {
    const client = await anonymous();
    await rejectsWith(client.call('pairSheet', {}), 'functions/invalid-argument');
  });

  test('rejects an unknown pairing code', async () => {
    const client = await anonymous();
    await rejectsWith(client.call('pairSheet', { pairingCode: 'NOPE99' }), 'functions/not-found');
  });

  test('pairs the caller with the sheet and uses up the code', async () => {
    const client = await anonymous();
    // Codes are matched after trimming and upper-casing.
    const result = await client.call('pairSheet', { pairingCode: ' abc234 ' });
    assert.deepEqual(result.data, {
      clubId: 'club-a',
      sheetId: 'sheet-open',
      clubName: 'Club A',
      sheetName: 'Sheet Open',
    });

    const sheet = (await db.doc('clubs/club-a/sheets/sheet-open').get()).data();
    assert.equal(sheet.scoreboardUid, client.auth.currentUser.uid);
    assert.equal(sheet.pairingCode, undefined);
    assert.ok(sheet.pairedAt, 'records when the sheet was paired');
    assert.equal(sheet.device, undefined, 'drops the previous scoreboard status');

    const second = await anonymous();
    await rejectsWith(second.call('pairSheet', { pairingCode: 'ABC234' }), 'functions/not-found');
  });

  test('gives the scoreboard claims naming its sheet', async () => {
    await db.doc('clubs/club-pairing/sheets/sheet-claims').set({ name: 'Sheet Claims', pairingCode: 'CLM234' });
    const client = await anonymous();
    await client.call('pairSheet', { pairingCode: 'CLM234' });

    const user = await adminAuth.getUser(client.auth.currentUser.uid);
    assert.deepEqual(user.customClaims, { role: 'scoreboard', clubId: 'club-pairing', sheetId: 'sheet-claims' });

    // The app forces a token refresh after pairing to pick the claims up.
    const token = await client.auth.currentUser.getIdTokenResult(true);
    assert.equal(token.claims.role, 'scoreboard');
    assert.equal(token.claims.sheetId, 'sheet-claims');
  });

  test('takes the claims away from the scoreboard it replaces', async () => {
    const sheet = db.doc('clubs/club-pairing/sheets/sheet-repair');
    await sheet.set({ name: 'Sheet Repair', pairingCode: 'RPR234' });
    const first = await anonymous();
    await first.call('pairSheet', { pairingCode: 'RPR234' });

    await sheet.update({ pairingCode: 'RPR567' });
    const second = await anonymous();
    await second.call('pairSheet', { pairingCode: 'RPR567' });

    assert.equal((await adminAuth.getUser(first.auth.currentUser.uid)).customClaims?.role, undefined);
    assert.deepEqual((await adminAuth.getUser(second.auth.currentUser.uid)).customClaims,
      { role: 'scoreboard', clubId: 'club-pairing', sheetId: 'sheet-repair' });
  });

  test('pairs over a previous scoreboard that no longer exists', async () => {
    // Names a uid with no Auth user behind it.
    await db.doc('clubs/club-pairing/sheets/sheet-gone').set({
      name: 'Sheet Gone', scoreboardUid: 'deleted-device', pairingCode: 'GNE234',
    });
    const client = await anonymous();
    const result = await client.call('pairSheet', { pairingCode: 'GNE234' });
    assert.equal(result.data.sheetId, 'sheet-gone');
  });

  test('lets a scoreboard move to another sheet', async () => {
    await db.doc('clubs/club-pairing/sheets/sheet-move-1').set({ name: 'Move 1', pairingCode: 'MVE234' });
    await db.doc('clubs/club-pairing/sheets/sheet-move-2').set({ name: 'Move 2', pairingCode: 'MVE567' });
    const client = await anonymous();
    await client.call('pairSheet', { pairingCode: 'MVE234' });
    await client.auth.currentUser.getIdToken(true);
    await client.call('pairSheet', { pairingCode: 'MVE567' });

    const user = await adminAuth.getUser(client.auth.currentUser.uid);
    assert.equal(user.customClaims.sheetId, 'sheet-move-2');
  });

  test('refuses admin accounts, whose claims it would replace', async () => {
    await db.doc('clubs/club-pairing/sheets/sheet-admin').set({ name: 'Sheet Admin', pairingCode: 'ADM234' });
    const clubAdmin = await userWithClaims('pairing-admin@club-a.example', { role: 'clubadmin', clubId: 'club-a' });
    await rejectsWith(clubAdmin.call('pairSheet', { pairingCode: 'ADM234' }), 'functions/failed-precondition');

    const user = await adminAuth.getUser(clubAdmin.auth.currentUser.uid);
    assert.deepEqual(user.customClaims, { role: 'clubadmin', clubId: 'club-a' });
    assert.equal((await db.doc('clubs/club-pairing/sheets/sheet-admin').get()).get('pairingCode'), 'ADM234');
  });
});

describe('unpairSheet', () => {
  // Pairs a fresh scoreboard with a new sheet in club-pin, the club whose
  // admin PIN is 4821.
  async function pairedScoreboard(sheetId) {
    await db.doc(`clubs/club-pin/sheets/${sheetId}`).set({ name: sheetId, pairingCode: `${sheetId}-CODE`.toUpperCase() });
    const client = await anonymous();
    await client.call('pairSheet', { pairingCode: `${sheetId}-CODE` });
    return client;
  }

  before(async () => {
    await db.doc('clubs/club-pin').set({ name: 'Club Pin' });
    await db.doc('clubs/club-pin/private/scoreboardPin').set({ pin: '4821' });
    await db.doc('clubs/club-no-pin').set({ name: 'Club No Pin' });
  });

  test('rejects callers who are not signed in', async () => {
    const client = await clientFor();
    await rejectsWith(
      client.call('unpairSheet', { clubId: 'club-pin', sheetId: 'any', pin: '4821' }),
      'functions/unauthenticated',
    );
  });

  test('rejects a missing or malformed sheet', async () => {
    const client = await anonymous();
    await rejectsWith(client.call('unpairSheet', { pin: '4821' }), 'functions/invalid-argument');
    await rejectsWith(
      client.call('unpairSheet', { clubId: 'club-pin/sheets', sheetId: 'x', pin: '4821' }),
      'functions/invalid-argument',
    );
  });

  test('keeps the sheet paired when the PIN is wrong', async () => {
    const client = await pairedScoreboard('pin-wrong');
    await rejectsWith(
      client.call('unpairSheet', { clubId: 'club-pin', sheetId: 'pin-wrong', pin: '1111' }),
      'functions/permission-denied',
    );
    await rejectsWith(
      client.call('unpairSheet', { clubId: 'club-pin', sheetId: 'pin-wrong' }),
      'functions/permission-denied',
    );
    const sheet = await db.doc('clubs/club-pin/sheets/pin-wrong').get();
    assert.equal(sheet.get('scoreboardUid'), client.auth.currentUser.uid);
  });

  test('unpairs the sheet and takes the claims away with the right PIN', async () => {
    const client = await pairedScoreboard('pin-right');
    const result = await client.call('unpairSheet', { clubId: 'club-pin', sheetId: 'pin-right', pin: ' 4821 ' });
    assert.deepEqual(result.data, { unpaired: true });

    const sheet = await db.doc('clubs/club-pin/sheets/pin-right').get();
    assert.equal(sheet.get('scoreboardUid'), undefined);
    assert.equal((await adminAuth.getUser(client.auth.currentUser.uid)).customClaims?.role, undefined);
  });

  test('will not unpair at a club that has no PIN set', async () => {
    await db.doc('clubs/club-no-pin/sheets/no-pin').set({ name: 'No Pin', pairingCode: 'NPN234' });
    const client = await anonymous();
    await client.call('pairSheet', { pairingCode: 'NPN234' });
    await rejectsWith(
      client.call('unpairSheet', { clubId: 'club-no-pin', sheetId: 'no-pin', pin: '' }),
      'functions/failed-precondition',
    );
    const sheet = await db.doc('clubs/club-no-pin/sheets/no-pin').get();
    assert.equal(sheet.get('scoreboardUid'), client.auth.currentUser.uid);
  });

  test('lets a scoreboard whose sheet was paired elsewhere go without the PIN', async () => {
    const replaced = await pairedScoreboard('pin-replaced');
    await db.doc('clubs/club-pin/sheets/pin-replaced').update({ pairingCode: 'REPLACED2' });
    const replacement = await anonymous();
    await replacement.call('pairSheet', { pairingCode: 'REPLACED2' });

    const result = await replaced.call('unpairSheet', { clubId: 'club-pin', sheetId: 'pin-replaced' });
    assert.deepEqual(result.data, { unpaired: false });
    const sheet = await db.doc('clubs/club-pin/sheets/pin-replaced').get();
    assert.equal(sheet.get('scoreboardUid'), replacement.auth.currentUser.uid, 'leaves the new pairing alone');
  });

  test('cannot unpair a sheet some other scoreboard holds, even with the PIN', async () => {
    const owner = await pairedScoreboard('pin-owned');
    const stranger = await anonymous();
    const result = await stranger.call('unpairSheet', { clubId: 'club-pin', sheetId: 'pin-owned', pin: '4821' });
    assert.deepEqual(result.data, { unpaired: false });
    const sheet = await db.doc('clubs/club-pin/sheets/pin-owned').get();
    assert.equal(sheet.get('scoreboardUid'), owner.auth.currentUser.uid);
  });
});

describe('REST API key check', () => {
  test('requires a key', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a`);
    assert.equal(res.status, 401);
  });

  test('rejects the wrong key', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a`, { headers: { 'x-api-key': 'key-b' } });
    assert.equal(res.status, 403);
  });

  test('accepts the club key', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Club A');
    assert.deepEqual(body.sheets.map((s) => s.id).sort(), ['sheet-open', 'sheet-other']);
  });

  test('keeps scoreboard device status out of the API', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a/sheets/sheet-other`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['hasLiveGame', 'id', 'liveGame', 'name']);
  });

  test('returns 404 for an unknown club', async () => {
    const res = await fetch(`${API_URL}/clubs/missing`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 404);
  });

  test('ignores a key left on the club document', async () => {
    const res = await fetch(`${API_URL}/clubs/legacy`, { headers: { 'x-api-key': 'legacy-key' } });
    assert.equal(res.status, 403);
  });
});

describe('REST API live games', () => {
  const teams = {
    team1: { name: 'Red', score: 0, hasHammer: false },
    team2: { name: 'Yellow', score: 0, hasHammer: true },
  };
  const minutesAgo = (minutes) => Timestamp.fromMillis(Date.now() - minutes * 60 * 1000);

  async function sheetWithLiveGame(sheetId, liveGame) {
    await db.doc(`clubs/club-a/sheets/${sheetId}`).set({ name: sheetId, liveGame });
    const res = await fetch(`${API_URL}/clubs/club-a/sheets/${sheetId}`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 200);
    await db.doc(`clubs/club-a/sheets/${sheetId}`).delete();
    return res.json();
  }

  test('reports a game that has just started, with when it was last written', async () => {
    const updatedAt = minutesAgo(1);
    const body = await sheetWithLiveGame('sheet-started', { updatedAt, currentEnd: 1, ...teams });
    assert.equal(body.hasLiveGame, true);
    assert.deepEqual(body.liveGame, {
      updatedAt: updatedAt.toDate().toISOString(), currentEnd: 1, numberOfEnds: null, league: null,
      bonspiel: null, ...teams, ends: null,
    });
  });

  test('reports the ends played so far and how many are scheduled', async () => {
    const ends = [
      { endNumber: 1, scoringTeam: 'Red', scoringTeamSlot: 'team1', score: 2, gameTimeInSeconds: 600 },
      { endNumber: 2, scoringTeam: null, scoringTeamSlot: null, score: 0, gameTimeInSeconds: 1250 },
    ];
    const body = await sheetWithLiveGame('sheet-ends', {
      updatedAt: minutesAgo(1), currentEnd: 3, numberOfEnds: 8, ...teams, ends,
    });
    assert.equal(body.liveGame.numberOfEnds, 8);
    assert.deepEqual(body.liveGame.ends, ends);
  });

  test('reports the league and teams of a league game', async () => {
    const league = { id: 'monday', name: 'Monday Night' };
    const leagueTeams = {
      team1: {
        name: 'Team Smith', color: { name: 'Blue', hex: '#2196F3' }, teamId: 't1', externalId: '1042',
        score: 2, hasHammer: false,
      },
      team2: {
        name: 'Team Jones', color: { name: 'Green', hex: '#4CAF50' }, teamId: 't2',
        score: 1, hasHammer: true,
      },
    };
    const body = await sheetWithLiveGame('sheet-league', {
      updatedAt: minutesAgo(1), currentEnd: 3, league, ...leagueTeams,
    });
    assert.deepEqual(body.liveGame.league, league);
    assert.deepEqual(body.liveGame.team1, leagueTeams.team1);
    assert.deepEqual(body.liveGame.team2, leagueTeams.team2);
  });

  test('still reports a game with no score change for just under two hours', async () => {
    const body = await sheetWithLiveGame('sheet-slow', { updatedAt: minutesAgo(119), currentEnd: 3, ...teams });
    assert.equal(body.hasLiveGame, true);
  });

  test('drops a game with no score change for over two hours', async () => {
    const body = await sheetWithLiveGame('sheet-abandoned', { updatedAt: minutesAgo(121), currentEnd: 3, ...teams });
    assert.equal(body.hasLiveGame, false);
    assert.equal(body.liveGame, null);
  });

  test('reports which team had last stone in the first end', async () => {
    const body = await sheetWithLiveGame('sheet-lsfe', {
      updatedAt: minutesAgo(1),
      currentEnd: 4,
      // Red scored last, so yellow has the hammer now, but red had it first.
      team1: { name: 'Red', score: 2, hasHammer: false, hadLastStoneFirstEnd: true },
      team2: { name: 'Yellow', score: 1, hasHammer: true, hadLastStoneFirstEnd: false },
    });
    assert.equal(body.liveGame.team1.hadLastStoneFirstEnd, true);
    assert.equal(body.liveGame.team2.hadLastStoneFirstEnd, false);
    assert.equal(body.liveGame.team1.hasHammer, false);
  });

  test('keeps a game written before updatedAt was recorded', async () => {
    const body = await sheetWithLiveGame('sheet-legacy', { currentEnd: 2, ...teams });
    assert.equal(body.hasLiveGame, true);
    assert.equal(body.liveGame.updatedAt, null);
  });
});

describe('REST API leagues', () => {
  const headers = { 'x-api-key': 'key-leagues' };
  const monday = {
    name: 'Monday Night',
    active: true,
    seasonStart: '2026-10-05',
    draws: [{ day: 1, start: '18:30', end: '20:30' }],
    teams: [{ id: 't1', name: 'Team Smith', externalId: '1042' }, { id: 't2', name: 'Team Jones' }],
    // Not part of a league today; stands in for anything added later.
    internalNote: 'do not publish',
  };

  before(async () => {
    await db.doc('clubs/club-leagues').set({ name: 'Club Leagues' });
    await db.doc('clubs/club-leagues/private/apiKey').set({ key: 'key-leagues' });
    await db.doc('clubs/club-leagues/leagues/monday').set(monday);
    await db.doc('clubs/club-leagues/leagues/archived').set({
      name: 'Archived League', active: false, draws: [], teams: [],
    });
    await db.doc('clubs/club-leagues/sheets/sheet-1').set({ name: 'Sheet 1' });
    const game = (league) => ({
      startedAt: Timestamp.fromMillis(Date.now() - 3 * 60 * 60 * 1000),
      finishedAt: league ? Timestamp.fromMillis(Date.now() - 60 * 60 * 1000) : Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000),
      numberOfEnds: 8,
      ...(league ? { league } : {}),
      team1: { name: league ? 'Team Smith' : 'Red', totalScore: 6, hadLastStoneFirstEnd: true, ...(league ? { teamId: 't1', externalId: '1042' } : {}) },
      team2: { name: league ? 'Team Jones' : 'Yellow', totalScore: 4, hadLastStoneFirstEnd: false, ...(league ? { teamId: 't2' } : {}) },
      ends: [],
    });
    await db.collection('clubs/club-leagues/sheets/sheet-1/games').add(game({ id: 'monday', name: 'Monday Night' }));
    await db.collection('clubs/club-leagues/sheets/sheet-1/games').add(game(null));
  });

  test('lists a club\'s leagues by name, with their teams', async () => {
    const res = await fetch(`${API_URL}/clubs/club-leagues/leagues`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.leagues.map((l) => l.id), ['archived', 'monday']);
    assert.equal(body.leagues[0].active, false);
    assert.deepEqual(body.leagues[1], {
      id: 'monday',
      name: 'Monday Night',
      active: true,
      seasonStart: '2026-10-05',
      seasonEnd: null,
      draws: [{ day: 1, start: '18:30', end: '20:30' }],
      teams: [
        { id: 't1', name: 'Team Smith', externalId: '1042' },
        { id: 't2', name: 'Team Jones', externalId: null },
      ],
    });
  });

  test('returns one league, and only its documented fields', async () => {
    const res = await fetch(`${API_URL}/clubs/club-leagues/leagues/monday`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(),
      ['active', 'draws', 'id', 'name', 'seasonEnd', 'seasonStart', 'teams']);
  });

  test('returns 404 for an unknown league', async () => {
    const res = await fetch(`${API_URL}/clubs/club-leagues/leagues/missing`, { headers });
    assert.equal(res.status, 404);
  });

  test('returns an empty list for a club with no leagues', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a/leagues`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { leagues: [] });
  });

  test('needs the club\'s own key', async () => {
    assert.equal((await fetch(`${API_URL}/clubs/club-leagues/leagues`)).status, 401);
    const res = await fetch(`${API_URL}/clubs/club-leagues/leagues`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 403);
  });

  test('reports the league and teams of completed games', async () => {
    const res = await fetch(`${API_URL}/clubs/club-leagues/sheets/sheet-1/games`, { headers });
    assert.equal(res.status, 200);
    const [leagueGame, openGame] = (await res.json()).games;
    assert.deepEqual(leagueGame.league, { id: 'monday', name: 'Monday Night' });
    assert.equal(leagueGame.team1.teamId, 't1');
    assert.equal(leagueGame.team1.externalId, '1042');
    assert.equal(openGame.league, null);
    assert.equal(openGame.team1.teamId, undefined);
  });
});

describe('REST API bonspiels', () => {
  const headers = { 'x-api-key': 'key-spiels' };
  const result = (sheetGameId, [id1, name1, score1], [id2, name2, score2]) => ({
    sheetId: 's1',
    sheetGameId,
    finishedAt: Timestamp.now(),
    team1: { teamId: id1, name: name1, score: score1 },
    team2: { teamId: id2, name: name2, score: score2 },
  });

  before(async () => {
    await db.doc('clubs/club-spiels').set({ name: 'Club Spiels' });
    await db.doc('clubs/club-spiels/private/apiKey').set({ key: 'key-spiels' });
    await db.doc('clubs/club-spiels/bonspiels/older').set({
      name: 'Spring Spiel', active: false, startDate: '2026-04-10', endDate: '2026-04-12',
      events: [], teams: [], draws: [], games: [],
    });
    // A pool of three, all played, and a final between its winner and the
    // loser of its first game.
    await db.doc('clubs/club-spiels/bonspiels/fall').set({
      name: 'Fall Spiel', active: true, startDate: '2026-11-06', endDate: '2026-11-08', numberOfEnds: 8,
      internalNote: 'do not publish',
      events: [{ id: 'p', name: 'Pool A' }, { id: 'f', name: 'Final', numberOfEnds: 6 }],
      teams: [{ id: 't1', name: 'Smith', externalId: '1042' }, { id: 't2', name: 'Jones' }, { id: 't3', name: 'Brown' }],
      draws: [{ id: 'd1', label: 'Draw 1', start: '2026-11-06T19:00' }],
      games: [
        { id: 'g1', label: 'A1', drawId: 'd1', sheetId: 's1', eventId: 'p', team1: { teamId: 't1' }, team2: { teamId: 't2' } },
        { id: 'g2', label: 'A2', drawId: 'd1', sheetId: 's1', eventId: 'p', team1: { teamId: 't2' }, team2: { teamId: 't3' } },
        { id: 'g3', label: 'A3', drawId: 'd1', sheetId: 's1', eventId: 'p', team1: { teamId: 't1' }, team2: { teamId: 't3' } },
        {
          id: 'fin', label: 'Final', drawId: 'd1', sheetId: 's2', eventId: 'f',
          team1: { rank: 1, eventId: 'p' }, team2: { from: 'g1', result: 'loser' },
        },
      ],
    });
    // The results the functions keep. The response works the rest out again.
    await db.doc('clubs/club-spiels/bonspiels/fall/state/current').set({
      results: {
        g1: result('x1', ['t1', 'Smith', 6], ['t2', 'Jones', 4]),
        g2: result('x2', ['t2', 'Jones', 5], ['t3', 'Brown', 3]),
        g3: result('x3', ['t1', 'Smith', 7], ['t3', 'Brown', 2]),
      },
    });
  });

  test('lists a club\'s bonspiels, newest first', async () => {
    const res = await fetch(`${API_URL}/clubs/club-spiels/bonspiels`, { headers });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      bonspiels: [
        { id: 'fall', name: 'Fall Spiel', active: true, startDate: '2026-11-06', endDate: '2026-11-08' },
        { id: 'older', name: 'Spring Spiel', active: false, startDate: '2026-04-10', endDate: '2026-04-12' },
      ],
    });
  });

  test('returns a bonspiel with its standings and who is in each game', async () => {
    const res = await fetch(`${API_URL}/clubs/club-spiels/bonspiels/fall`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(),
      ['active', 'draws', 'endDate', 'events', 'games', 'id', 'name', 'numberOfEnds', 'startDate', 'teams']);
    const [pool, final] = body.events;
    assert.equal(pool.finalGameId, null);
    assert.equal(pool.complete, true);
    assert.deepEqual(pool.standings.map((r) => [r.place, r.team.name, r.points]),
      [[1, 'Smith', 4], [2, 'Jones', 2], [3, 'Brown', 0]]);
    assert.deepEqual(pool.standings[0],
      { team: { teamId: 't1', name: 'Smith' }, place: 1, tied: false, played: 2, wins: 2, losses: 0, ties: 0, points: 4 });
    assert.deepEqual(final, {
      id: 'f', name: 'Final', numberOfEnds: 6, finalGameId: 'fin', winner: null, standings: null, complete: null,
    });
    assert.deepEqual(body.teams[1], { id: 't2', name: 'Jones', externalId: null });

    const games = Object.fromEntries(body.games.map((g) => [g.id, g]));
    assert.deepEqual(games.g1, {
      id: 'g1', label: 'A1', drawId: 'd1', sheetId: 's1', eventId: 'p', status: 'final',
      team1: { from: { type: 'team', teamId: 't1' }, team: { teamId: 't1', name: 'Smith' }, score: 6 },
      team2: { from: { type: 'team', teamId: 't2' }, team: { teamId: 't2', name: 'Jones' }, score: 4 },
      winner: 'team1',
    });
    assert.equal(games.fin.status, 'ready');
    assert.deepEqual(games.fin.team1,
      { from: { type: 'place', eventId: 'p', place: 1 }, team: { teamId: 't1', name: 'Smith' }, score: null });
    assert.deepEqual(games.fin.team2,
      { from: { type: 'loser', gameId: 'g1' }, team: { teamId: 't2', name: 'Jones' }, score: null });
  });

  test('returns 404 for an unknown bonspiel', async () => {
    const res = await fetch(`${API_URL}/clubs/club-spiels/bonspiels/missing`, { headers });
    assert.equal(res.status, 404);
  });

  test('needs the club\'s own key', async () => {
    assert.equal((await fetch(`${API_URL}/clubs/club-spiels/bonspiels`)).status, 401);
    const res = await fetch(`${API_URL}/clubs/club-spiels/bonspiels`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 403);
  });
});

describe('REST API CORS', () => {
  const origin = 'https://club.example';

  test('answers a preflight for GET with the X-API-Key header', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-api-key',
      },
    });
    assert.ok(res.status >= 200 && res.status < 300, `status ${res.status}`);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');

    const methods = (res.headers.get('access-control-allow-methods') ?? '').toUpperCase().split(/\s*,\s*/);
    assert.ok(methods.includes('GET'), `methods ${methods}`);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.ok(!methods.includes(method), `methods ${methods}`);
    }

    const headers = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(/\s*,\s*/);
    assert.ok(headers.includes('x-api-key'), `headers ${headers}`);
    assert.match(res.headers.get('access-control-max-age') ?? '', /^\d+$/);
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
  });

  test('allows any origin to read a successful response', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a`, {
      headers: { Origin: origin, 'x-api-key': 'key-a' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
  });

  test('allows any origin to read an error response', async () => {
    const res = await fetch(`${API_URL}/clubs/club-a`, {
      headers: { Origin: origin, 'x-api-key': 'key-b' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });
});

describe('provisionClub', () => {
  const request = {
    clubName: 'New Club',
    clubId: 'new-club',
    adminEmail: 'admin@new-club.example',
    adminPassword: 'password123',
    scoreboardPin: '2468',
  };

  test('is limited to super admins', async () => {
    const clubAdmin = await userWithClaims('admin@club-a.example', { role: 'clubadmin', clubId: 'club-a' });
    await rejectsWith(clubAdmin.call('provisionClub', request), 'functions/permission-denied');
  });

  test('creates the club, its private API key and PIN, and its first admin', async () => {
    const superAdmin = await userWithClaims('super@example.com', { role: 'superadmin', clubId: null });
    const result = await superAdmin.call('provisionClub', request);
    assert.equal(result.data.clubId, 'new-club');

    assert.deepEqual((await db.doc('clubs/new-club').get()).data(), { name: 'New Club' });
    const key = (await db.doc('clubs/new-club/private/apiKey').get()).get('key');
    assert.match(key, /^[0-9a-f]{32}$/);
    assert.deepEqual((await db.doc('clubs/new-club/private/scoreboardPin').get()).data(), { pin: '2468' });

    const admin = await adminAuth.getUserByEmail(request.adminEmail);
    assert.deepEqual(admin.customClaims, { role: 'clubadmin', clubId: 'new-club' });
    assert.ok((await db.doc(`clubs/new-club/admins/${admin.uid}`).get()).exists);
  });

  test('reports a taken email as already-exists and rolls back the club', async () => {
    await adminAuth.createUser({ email: 'taken@provision.example', password: 'password123' });
    const caller = await superAdmin('super-taken@example.com');
    await rejectsWith(caller.call('provisionClub', {
      clubName: 'Taken Club',
      clubId: 'taken-club',
      adminEmail: 'taken@provision.example',
      adminPassword: 'password123',
      scoreboardPin: '2468',
    }), 'functions/already-exists');

    assert.equal((await db.doc('clubs/taken-club').get()).exists, false);
    assert.equal((await db.doc('clubs/taken-club/private/apiKey').get()).exists, false);
    assert.equal((await db.doc('clubs/taken-club/private/scoreboardPin').get()).exists, false);
  });

  test('reports a malformed email as invalid-argument and rolls back the club', async () => {
    const caller = await superAdmin('super-bad-email@example.com');
    await rejectsWith(caller.call('provisionClub', {
      clubName: 'Bad Email Club',
      clubId: 'bad-email-club',
      adminEmail: 'not-an-email',
      adminPassword: 'password123',
      scoreboardPin: '2468',
    }), 'functions/invalid-argument');

    assert.equal((await db.doc('clubs/bad-email-club').get()).exists, false);
    assert.equal((await db.doc('clubs/bad-email-club/private/apiKey').get()).exists, false);
    assert.equal((await db.doc('clubs/bad-email-club/private/scoreboardPin').get()).exists, false);
  });

  test('rejects a short password before creating anything', async () => {
    const caller = await superAdmin('super-short-pw@example.com');
    await rejectsWith(caller.call('provisionClub', {
      clubName: 'Short Password Club',
      clubId: 'short-pw-club',
      adminEmail: 'admin@short-pw.example',
      adminPassword: 'short',
      scoreboardPin: '2468',
    }), 'functions/invalid-argument');

    assert.equal((await db.doc('clubs/short-pw-club').get()).exists, false);
    await rejectsWith(adminAuth.getUserByEmail('admin@short-pw.example'), 'auth/user-not-found');
  });

  test('rejects a club ID outside the allowed pattern', async () => {
    const caller = await superAdmin('super-bad-id@example.com');
    await rejectsWith(caller.call('provisionClub', {
      clubName: 'Bad Id Club',
      clubId: 'Bad Id/Club',
      adminEmail: 'admin@bad-id.example',
      adminPassword: 'password123',
      scoreboardPin: '2468',
    }), 'functions/invalid-argument');

    await rejectsWith(adminAuth.getUserByEmail('admin@bad-id.example'), 'auth/user-not-found');
  });

  test('rejects a missing or malformed scoreboard PIN before creating anything', async () => {
    const caller = await superAdmin('super-bad-pin@example.com');
    for (const scoreboardPin of [undefined, '', '123', '12a4', '123456789']) {
      await rejectsWith(caller.call('provisionClub', {
        clubName: 'Bad Pin Club',
        clubId: 'bad-pin-club',
        adminEmail: 'admin@bad-pin.example',
        adminPassword: 'password123',
        scoreboardPin,
      }), 'functions/invalid-argument');
    }

    assert.equal((await db.doc('clubs/bad-pin-club').get()).exists, false);
    await rejectsWith(adminAuth.getUserByEmail('admin@bad-pin.example'), 'auth/user-not-found');
  });
});

describe('addClubAdmin', () => {
  test('is limited to super admins', async () => {
    const clubAdmin = await userWithClaims('admin2@club-a.example', { role: 'clubadmin', clubId: 'club-a' });
    await rejectsWith(clubAdmin.call('addClubAdmin', {
      clubId: 'club-a',
      adminEmail: 'denied@club-a.example',
      adminPassword: 'password123',
    }), 'functions/permission-denied');
  });

  test('rejects an unknown club', async () => {
    const caller = await superAdmin('super-add-missing@example.com');
    await rejectsWith(caller.call('addClubAdmin', {
      clubId: 'no-such-club',
      adminEmail: 'admin@no-such-club.example',
      adminPassword: 'password123',
    }), 'functions/not-found');
  });

  test('creates the admin with club claims and an admins doc', async () => {
    const caller = await superAdmin('super-add@example.com');
    const result = await caller.call('addClubAdmin', {
      clubId: 'club-a',
      adminEmail: 'second-admin@club-a.example',
      adminPassword: 'password123',
    });

    const admin = await adminAuth.getUserByEmail('second-admin@club-a.example');
    assert.equal(result.data.uid, admin.uid);
    assert.deepEqual(admin.customClaims, { role: 'clubadmin', clubId: 'club-a' });
    const doc = await db.doc(`clubs/club-a/admins/${admin.uid}`).get();
    assert.equal(doc.get('email'), 'second-admin@club-a.example');
  });

  test('creates a bonspiel admin with the name given', async () => {
    const caller = await superAdmin('super-add-bonspiel@example.com');
    await caller.call('addClubAdmin', {
      clubId: 'club-a',
      adminName: 'Pat Skip',
      adminEmail: 'bonspiel@club-a.example',
      adminPassword: 'password123',
      role: 'bonspieladmin',
    });

    const user = await adminAuth.getUserByEmail('bonspiel@club-a.example');
    assert.equal(user.displayName, 'Pat Skip');
    assert.deepEqual(user.customClaims, { role: 'bonspieladmin', clubId: 'club-a' });
    const doc = await db.doc(`clubs/club-a/admins/${user.uid}`).get();
    assert.equal(doc.get('role'), 'bonspieladmin');
    assert.equal(doc.get('displayName'), 'Pat Skip');
  });

  test('rejects an unknown role', async () => {
    const caller = await superAdmin('super-add-role@example.com');
    await rejectsWith(caller.call('addClubAdmin', {
      clubId: 'club-a',
      adminEmail: 'bad-role@club-a.example',
      adminPassword: 'password123',
      role: 'superadmin',
    }), 'functions/invalid-argument');
  });

  test('reports a taken email as already-exists', async () => {
    await adminAuth.createUser({ email: 'taken@add-admin.example', password: 'password123' });
    const caller = await superAdmin('super-add-taken@example.com');
    await rejectsWith(caller.call('addClubAdmin', {
      clubId: 'club-a',
      adminEmail: 'taken@add-admin.example',
      adminPassword: 'password123',
      scoreboardPin: '2468',
    }), 'functions/already-exists');
  });

  test('rejects a short password', async () => {
    const caller = await superAdmin('super-add-short@example.com');
    await rejectsWith(caller.call('addClubAdmin', {
      clubId: 'club-a',
      adminEmail: 'short@add-admin.example',
      adminPassword: 'short',
    }), 'functions/invalid-argument');
  });
});

describe('updateClubAdmin', () => {
  test('is limited to super admins', async () => {
    const clubAdmin = await userWithClaims('updater@club-a.example', { role: 'clubadmin', clubId: 'club-a' });
    await rejectsWith(clubAdmin.call('updateClubAdmin', {
      clubId: 'club-a', uid: 'anyone', email: 'updater@club-a.example', role: 'clubadmin',
    }), 'functions/permission-denied');
  });

  test('changes the name, email, role and password', async () => {
    const caller = await superAdmin('super-update@example.com');
    const { data } = await caller.call('addClubAdmin', {
      clubId: 'club-a', adminEmail: 'changing@club-a.example', adminPassword: 'password123',
    });

    await caller.call('updateClubAdmin', {
      clubId: 'club-a',
      uid: data.uid,
      displayName: 'Sam Lead',
      email: 'changed@club-a.example',
      role: 'bonspieladmin',
      password: 'reset-password-456',
    });

    const user = await adminAuth.getUser(data.uid);
    assert.equal(user.displayName, 'Sam Lead');
    assert.equal(user.email, 'changed@club-a.example');
    assert.deepEqual(user.customClaims, { role: 'bonspieladmin', clubId: 'club-a' });
    const listing = await db.doc(`clubs/club-a/admins/${data.uid}`).get();
    assert.deepEqual(listing.data(), {
      email: 'changed@club-a.example', displayName: 'Sam Lead', role: 'bonspieladmin',
    });
    await clientFor((auth) => signInWithEmailAndPassword(auth, 'changed@club-a.example', 'reset-password-456'));
  });

  test('rejects a short new password', async () => {
    const caller = await superAdmin('super-update-short@example.com');
    const { data } = await caller.call('addClubAdmin', {
      clubId: 'club-a', adminEmail: 'short-reset@club-a.example', adminPassword: 'password123',
    });
    await rejectsWith(caller.call('updateClubAdmin', {
      clubId: 'club-a', uid: data.uid, email: 'short-reset@club-a.example', password: 'short',
    }), 'functions/invalid-argument');
  });

  test('leaves alone an account that is not this club\'s', async () => {
    const caller = await superAdmin('super-update-other@example.com');
    const other = await adminAuth.createUser({ email: 'listed-update@club-b.example', password: 'password123' });
    await adminAuth.setCustomUserClaims(other.uid, { role: 'clubadmin', clubId: 'club-b' });
    await db.doc(`clubs/club-a/admins/${other.uid}`).set({ email: 'listed-update@club-b.example' });

    await rejectsWith(caller.call('updateClubAdmin', {
      clubId: 'club-a', uid: other.uid, email: 'listed-update@club-b.example', password: 'hijacked123',
    }), 'functions/failed-precondition');
  });
});

describe('removeClubAdmin', () => {
  test('is limited to super admins', async () => {
    const clubAdmin = await userWithClaims('remover@club-a.example', { role: 'clubadmin', clubId: 'club-a' });
    await rejectsWith(clubAdmin.call('removeClubAdmin', { clubId: 'club-a', uid: 'anyone' }),
      'functions/permission-denied');
  });

  test('rejects an admin who is not on the club', async () => {
    const caller = await superAdmin('super-remove-missing@example.com');
    await rejectsWith(caller.call('removeClubAdmin', { clubId: 'club-a', uid: 'nobody' }),
      'functions/not-found');
  });

  test('deletes the account and the listing, freeing the email', async () => {
    const caller = await superAdmin('super-remove@example.com');
    const { data } = await caller.call('addClubAdmin', {
      clubId: 'club-a', adminEmail: 'leaving@club-a.example', adminPassword: 'password123',
    });

    await caller.call('removeClubAdmin', { clubId: 'club-a', uid: data.uid });

    await assert.rejects(adminAuth.getUser(data.uid), (err) => err.code === 'auth/user-not-found');
    assert.equal((await db.doc(`clubs/club-a/admins/${data.uid}`).get()).exists, false);
    await caller.call('addClubAdmin', {
      clubId: 'club-a', adminEmail: 'leaving@club-a.example', adminPassword: 'password123',
    });
  });

  test('keeps an account that is not this club\'s admin', async () => {
    const caller = await superAdmin('super-remove-other@example.com');
    const other = await adminAuth.createUser({ email: 'listed@club-b.example', password: 'password123' });
    await adminAuth.setCustomUserClaims(other.uid, { role: 'clubadmin', clubId: 'club-b' });
    await db.doc(`clubs/club-a/admins/${other.uid}`).set({ email: 'listed@club-b.example' });

    await caller.call('removeClubAdmin', { clubId: 'club-a', uid: other.uid });

    assert.equal((await adminAuth.getUser(other.uid)).customClaims.clubId, 'club-b');
    assert.equal((await db.doc(`clubs/club-a/admins/${other.uid}`).get()).exists, false);
  });

  test('removes the listing of an account that no longer exists', async () => {
    const caller = await superAdmin('super-remove-gone@example.com');
    await db.doc('clubs/club-a/admins/deleted-user').set({ email: 'gone@club-a.example' });

    await caller.call('removeClubAdmin', { clubId: 'club-a', uid: 'deleted-user' });

    assert.equal((await db.doc('clubs/club-a/admins/deleted-user').get()).exists, false);
  });
});

describe('deleteSheet', () => {
  // A club of its own, so the API tests' sheet lists for club-a are untouched.
  before(async () => {
    await db.doc('clubs/club-sheets').set({ name: 'Club Sheets' });
  });

  test('is limited to super admins', async () => {
    await db.doc('clubs/club-sheets/sheets/kept').set({ name: 'Kept' });
    const clubAdmin = await userWithClaims('sheet-admin@club-sheets.example', { role: 'clubadmin', clubId: 'club-sheets' });
    await rejectsWith(clubAdmin.call('deleteSheet', { clubId: 'club-sheets', sheetId: 'kept' }),
      'functions/permission-denied');
    assert.equal((await db.doc('clubs/club-sheets/sheets/kept').get()).exists, true);
  });

  test('rejects an unknown sheet', async () => {
    const caller = await superAdmin('super-delete-missing@example.com');
    await rejectsWith(caller.call('deleteSheet', { clubId: 'club-sheets', sheetId: 'no-such-sheet' }),
      'functions/not-found');
  });

  test('deletes the sheet and its games, and the scoreboard\'s claims', async () => {
    const board = await adminAuth.createUser({});
    await adminAuth.setCustomUserClaims(board.uid, { role: 'scoreboard', clubId: 'club-sheets', sheetId: 'gone' });
    await db.doc('clubs/club-sheets/sheets/gone').set({ name: 'Gone', scoreboardUid: board.uid });
    await db.doc('clubs/club-sheets/sheets/gone/games/g1').set({ numberOfEnds: 8 });
    const caller = await superAdmin('super-delete@example.com');

    await caller.call('deleteSheet', { clubId: 'club-sheets', sheetId: 'gone' });

    assert.equal((await db.doc('clubs/club-sheets/sheets/gone').get()).exists, false);
    assert.equal((await db.doc('clubs/club-sheets/sheets/gone/games/g1').get()).exists, false);
    assert.equal((await adminAuth.getUser(board.uid)).customClaims?.role, undefined);
  });
});

describe('completed game webhook', () => {
  // Stands in for a club's Slack or Discord webhook. The functions emulator
  // allows posting to this machine; deployed functions refuse to.
  let receiver;
  let received = [];
  let answerWith = 200;
  let hookUrl;

  before(async () => {
    receiver = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        received.push({ path: req.url, body: JSON.parse(body) });
        res.writeHead(answerWith).end();
      });
    });
    await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    hookUrl = `http://127.0.0.1:${receiver.address().port}`;

    for (const club of ['hook-all', 'hook-league', 'hook-off', 'hook-failing', 'hook-template', 'hook-bonspiel']) {
      await db.doc(`clubs/${club}`).set({ name: `Club ${club}` });
      await db.doc(`clubs/${club}/sheets/s1`).set({ name: 'Sheet 1' });
    }
    await db.doc('clubs/hook-all/private/webhook').set({ url: `${hookUrl}/all`, games: 'all' });
    await db.doc('clubs/hook-league/private/webhook').set({ url: `${hookUrl}/league`, games: 'league' });
    await db.doc('clubs/hook-failing/private/webhook').set({ url: `${hookUrl}/failing`, games: 'all' });
    await db.doc('clubs/hook-bonspiel/private/webhook').set({
      url: `${hookUrl}/bonspiel`,
      games: 'bonspiel',
      template: '{leagueAndSheet} | {bonspiel} | {bonspielGame} | {event} | {result}',
    });
    await db.doc('clubs/hook-bonspiel/bonspiels/fall').set({
      name: 'Fall Spiel', startDate: '2026-10-08', endDate: '2026-10-08',
      events: [{ id: 'a', name: 'A Event' }],
      games: [{ id: 'a3', label: 'A Final', eventId: 'a', drawId: 'd1', sheetId: 's1' }],
    });
    await db.doc('clubs/hook-template/private/webhook').set({
      url: `${hookUrl}/template`,
      games: 'all',
      template: '{club} {league}: {result} on {weekday}, {date} at {finishTime} ({duration}, {endsPlayed} of {scheduledEnds} ends) {unknown}',
      timeZone: 'America/Chicago',
    });
  });

  after(() => new Promise((resolve) => receiver.close(resolve)));

  const openGame = {
    startedAt: Timestamp.fromDate(new Date('2026-10-08T18:30:00Z')),
    finishedAt: Timestamp.fromDate(new Date('2026-10-08T20:25:00Z')),
    numberOfEnds: 8,
    team1: { name: 'Red', totalScore: 7, hadLastStoneFirstEnd: true },
    team2: { name: 'Yellow', totalScore: 4, hadLastStoneFirstEnd: false },
    ends: [{ endNumber: 1, scoringTeam: 'Red', scoringTeamSlot: 'team1', score: 2, gameTimeInSeconds: 600 }],
  };
  const leagueGame = {
    ...openGame,
    league: { id: 'monday', name: 'Monday Night' },
    team1: { ...openGame.team1, name: 'Team Smith', teamId: 't1', externalId: '1042' },
    team2: { ...openGame.team2, name: 'Team Jones', teamId: 't2' },
  };

  const bonspielGame = {
    ...openGame,
    bonspiel: { id: 'fall', name: 'Fall Spiel', gameId: 'a3' },
    team1: leagueGame.team1,
    team2: leagueGame.team2,
  };

  const postsTo = (path) => received.filter((r) => r.path === path);

  test('posts a completed game with a message Slack and Discord both read', async () => {
    await db.doc('clubs/hook-all/sheets/s1/games/open-1').set(openGame);

    const [post] = await waitFor('the post', () => postsTo('/all').length && postsTo('/all'));
    assert.equal(post.body.text, 'Sheet 1: Red 7, Yellow 4');
    assert.equal(post.body.content, post.body.text);
    // Discord posts it without a notification and without pinging anyone.
    assert.equal(post.body.flags, 4096);
    assert.deepEqual(post.body.allowed_mentions, { parse: [] });
    assert.equal(post.body.event, 'game.completed');
    assert.deepEqual(post.body.club, { id: 'hook-all', name: 'Club hook-all' });
    assert.deepEqual(post.body.sheet, { id: 's1', name: 'Sheet 1' });
    assert.deepEqual(Object.keys(post.body.game).sort(),
      ['bonspiel', 'ends', 'finishedAt', 'id', 'league', 'numberOfEnds', 'startedAt', 'team1', 'team2']);
    assert.equal(post.body.game.id, 'open-1');
    assert.equal(post.body.game.finishedAt, '2026-10-08T20:25:00.000Z');
    assert.equal(post.body.game.league, null);

    const status = await waitFor('the delivery status',
      async () => (await db.doc('clubs/hook-all/private/webhookStatus').get()).data());
    assert.equal(status.ok, true);
    assert.equal(status.status, 200);
    assert.equal(status.kind, 'game');

    const onGame = await waitFor('the result on the game', async () => {
      const webhook = (await db.doc('clubs/hook-all/sheets/s1/games/open-1').get()).get('webhook');
      return webhook?.ok !== undefined && webhook;
    });
    assert.ok(onGame.attemptedAt, 'records when the game was posted');
    assert.equal(onGame.ok, true);
    assert.equal(onGame.status, 200);
    assert.equal(onGame.error, undefined);
  });

  test('names the league and teams of a league game', async () => {
    await db.doc('clubs/hook-league/sheets/s1/games/league-1').set(leagueGame);

    const [post] = await waitFor('the post', () => postsTo('/league').length && postsTo('/league'));
    assert.equal(post.body.text, 'Monday Night, Sheet 1: Team Smith 7, Team Jones 4');
    assert.deepEqual(post.body.game.league, { id: 'monday', name: 'Monday Night' });
    assert.equal(post.body.game.team1.externalId, '1042');
  });

  test('fills in the club\'s own message template', async () => {
    await db.doc('clubs/hook-template/sheets/s1/games/league-1').set(leagueGame);

    const [post] = await waitFor('the post', () => postsTo('/template').length && postsTo('/template'));
    assert.equal(
      post.body.text,
      'Club hook-template Monday Night: Team Smith beat Team Jones 7-4 on Thursday, '
        + 'October 8, 2026 at 3:25 PM (1h 55m, 1 of 8 ends) {unknown}',
    );
    assert.equal(post.body.content, post.body.text);
    assert.equal(post.body.game.id, 'league-1');
  });

  test('dates a game that runs past midnight by the night it started', async () => {
    await db.doc('clubs/hook-template/sheets/s1/games/late-1').set({
      ...leagueGame,
      // 9:30 PM to 12:15 AM in Chicago.
      startedAt: Timestamp.fromDate(new Date('2026-10-13T02:30:00Z')),
      finishedAt: Timestamp.fromDate(new Date('2026-10-13T05:15:00Z')),
    });

    const post = await waitFor('the post', () =>
      postsTo('/template').find((r) => r.body.game?.id === 'late-1'));
    assert.match(post.body.text, / on Monday, October 12, 2026 at 12:15 AM \(2h 45m,/);
  });

  test('set to league games, skips an open game and posts one with a single named team', async () => {
    const before = postsTo('/league').length;
    await db.doc('clubs/hook-league/sheets/s1/games/open-2').set(openGame);
    await db.doc('clubs/hook-league/sheets/s1/games/league-2').set({
      ...leagueGame, team2: openGame.team2,
    });

    await waitFor('the league game', () => postsTo('/league').length > before);
    // Long enough for the open game to have been posted, had it been going to.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const posted = postsTo('/league').slice(before).map((r) => r.body.game.id);
    assert.deepEqual(posted, ['league-2']);
    assert.equal(
      (await db.doc('clubs/hook-league/sheets/s1/games/open-2').get()).get('webhook'),
      undefined,
    );
  });

  test('set to league games, skips a bonspiel game', async () => {
    const before = postsTo('/league').length;
    await db.doc('clubs/hook-league/sheets/s1/games/spiel-1').set(bonspielGame);
    await db.doc('clubs/hook-league/sheets/s1/games/league-3').set(leagueGame);

    await waitFor('the league game', () => postsTo('/league').length > before);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.deepEqual(postsTo('/league').slice(before).map((r) => r.body.game.id), ['league-3']);
  });

  test('set to bonspiel games, posts only those, naming the game and its event', async () => {
    await db.doc('clubs/hook-bonspiel/sheets/s1/games/league-1').set(leagueGame);
    await db.doc('clubs/hook-bonspiel/sheets/s1/games/spiel-1').set(bonspielGame);

    const [post] = await waitFor('the post', () => postsTo('/bonspiel').length && postsTo('/bonspiel'));
    assert.equal(post.body.text,
      'Fall Spiel A Final, Sheet 1 | Fall Spiel | A Final | A Event | Team Smith beat Team Jones 7-4');
    assert.deepEqual(post.body.game.bonspiel, { id: 'fall', name: 'Fall Spiel', gameId: 'a3' });
    assert.equal(post.body.game.league, null);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.deepEqual(postsTo('/bonspiel').map((r) => r.body.game.id), ['spiel-1']);
  });

  test('posts nothing for a club with no webhook', async () => {
    const before = received.length;
    await db.doc('clubs/hook-off/sheets/s1/games/open-1').set(openGame);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.equal(received.length, before);
  });

  test('does not post a game that has already been attempted', async () => {
    const before = postsTo('/all').length;
    await db.doc('clubs/hook-all/sheets/s1/games/already').set({
      ...openGame, webhook: { attemptedAt: Timestamp.now() },
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.equal(postsTo('/all').length, before);
  });

  test('records a refused delivery without trying it again', async () => {
    answerWith = 404;
    try {
      await db.doc('clubs/hook-failing/sheets/s1/games/open-1').set(openGame);
      const status = await waitFor('the delivery status',
        async () => (await db.doc('clubs/hook-failing/private/webhookStatus').get()).data());
      assert.equal(status.ok, false);
      assert.equal(status.status, 404);
      assert.equal(postsTo('/failing').length, 1);

      const onGame = await waitFor('the result on the game', async () => {
        const webhook = (await db.doc('clubs/hook-failing/sheets/s1/games/open-1').get()).get('webhook');
        return webhook?.ok !== undefined && webhook;
      });
      assert.equal(onGame.ok, false);
      assert.equal(onGame.status, 404);
      assert.equal(onGame.error, 'The webhook answered 404.');
    } finally {
      answerWith = 200;
    }
  });

  test('keeps the webhook result out of the games API', async () => {
    await db.doc('clubs/hook-all/private/apiKey').set({ key: 'key-hook' });
    await waitFor('the result', async () =>
      (await db.doc('clubs/hook-all/sheets/s1/games/open-1').get()).get('webhook'));
    const res = await fetch(`${API_URL}/clubs/hook-all/sheets/s1/games`, { headers: { 'X-API-Key': 'key-hook' } });
    const { games } = await res.json();
    assert.ok(games.length > 0);
    for (const game of games) assert.equal(game.webhook, undefined);
  });

  describe('sendTestWebhook', () => {
    test('is limited to the club\'s admins and super admins', async () => {
      const anon = await anonymous();
      await rejectsWith(anon.call('sendTestWebhook', { clubId: 'hook-all' }), 'functions/permission-denied');
      const other = await userWithClaims('hook-other@example.com', { role: 'clubadmin', clubId: 'hook-league' });
      await rejectsWith(other.call('sendTestWebhook', { clubId: 'hook-all' }), 'functions/permission-denied');
    });

    test('needs a saved webhook', async () => {
      const caller = await superAdmin('super-hook-off@example.com');
      await rejectsWith(caller.call('sendTestWebhook', { clubId: 'hook-off' }), 'functions/failed-precondition');
    });

    test('posts a test message for a club admin and reports how it went', async () => {
      const before = postsTo('/all').length;
      const caller = await userWithClaims('hook-admin@example.com', { role: 'clubadmin', clubId: 'hook-all' });

      const result = await caller.call('sendTestWebhook', { clubId: 'hook-all' });

      assert.deepEqual(result.data, { ok: true, status: 200 });
      const post = postsTo('/all')[before];
      assert.equal(post.body.event, 'test');
      assert.equal(post.body.content, post.body.text);
      assert.equal(post.body.game, undefined);
      assert.equal((await db.doc('clubs/hook-all/private/webhookStatus').get()).get('kind'), 'test');
    });

    test('shows the club\'s message template with a sample game', async () => {
      const before = postsTo('/template').length;
      const caller = await superAdmin('super-hook-template@example.com');

      await caller.call('sendTestWebhook', { clubId: 'hook-template' });

      const post = postsTo('/template')[before];
      assert.match(post.body.text, /\nClub hook-template Monday Night: Team Smith beat Team Jones 7-4 on /);
    });

    test('reports a webhook that refuses the message', async () => {
      const caller = await superAdmin('super-hook-failing@example.com');
      answerWith = 410;
      try {
        const result = await caller.call('sendTestWebhook', { clubId: 'hook-failing' });
        assert.equal(result.data.ok, false);
        assert.equal(result.data.status, 410);
      } finally {
        answerWith = 200;
      }
    });
  });
});

describe('display summary', () => {
  const club = 'clubs/display-club';
  const stateDoc = db.doc(`${club}/private/displayState`);
  const sheetOf = async (sheetId) => (await stateDoc.get()).get(`sheets.${sheetId}`);
  const minutesAgo = (minutes) => Timestamp.fromMillis(Date.now() - minutes * 60 * 1000);
  // Waits long enough for a trigger that was going to write to have done so.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 3000));

  const liveGame = {
    updatedAt: minutesAgo(1),
    currentEnd: 3,
    league: { id: 'monday', name: 'Monday Night' },
    team1: {
      name: 'Team Smith', color: { name: 'Blue', hex: '#2196F3' }, teamId: 't1', externalId: '1042',
      score: 2, hasHammer: false, hadLastStoneFirstEnd: true,
    },
    team2: {
      name: 'Team Jones', color: { name: 'Green', hex: '#4CAF50' }, teamId: 't2',
      score: 1, hasHammer: true, hadLastStoneFirstEnd: false,
    },
  };
  const completedGame = (finishedAt) => ({
    startedAt: Timestamp.fromMillis(finishedAt.toMillis() - 2 * 60 * 60 * 1000),
    finishedAt,
    numberOfEnds: 8,
    league: liveGame.league,
    team1: { name: 'Team Smith', color: liveGame.team1.color, teamId: 't1', totalScore: 3, hadLastStoneFirstEnd: true },
    team2: { name: 'Team Jones', color: liveGame.team2.color, teamId: 't2', totalScore: 1, hadLastStoneFirstEnd: false },
    ends: [
      { endNumber: 1, scoringTeam: 'Team Smith', scoringTeamSlot: 'team1', score: 2, gameTimeInSeconds: 600 },
      { endNumber: 2, scoringTeam: null, scoringTeamSlot: null, score: 0, gameTimeInSeconds: 1200 },
      // From before scoringTeamSlot was recorded.
      { endNumber: 3, scoringTeam: 'Team Jones', score: 1, gameTimeInSeconds: 1800 },
      { endNumber: 4, scoringTeam: 'Team Smith', score: 1, gameTimeInSeconds: 2400 },
    ],
  });

  before(async () => {
    await db.doc(club).set({ name: 'Display Club' });
  });

  test('lists a new sheet with no game', async () => {
    await db.doc(`${club}/sheets/s-new`).set({ name: 'Sheet New' });
    const sheet = await waitFor('the sheet', () => sheetOf('s-new'));
    assert.deepEqual(sheet, { name: 'Sheet New', live: null });
  });

  test('shows a live game with only what a display needs', async () => {
    await db.doc(`${club}/sheets/s-live`).set({ name: 'Sheet Live', scoreboardUid: 'device', liveGame });
    const sheet = await waitFor('the live game', async () => (await sheetOf('s-live'))?.live && sheetOf('s-live'));
    assert.equal(sheet.live.updatedAt.toMillis(), liveGame.updatedAt.toMillis());
    assert.deepEqual({ ...sheet.live, updatedAt: null }, {
      updatedAt: null,
      currentEnd: 3,
      numberOfEnds: null,
      league: { name: 'Monday Night' },
      bonspiel: null,
      team1: {
        name: 'Team Smith', color: { name: 'Blue', hex: '#2196F3' }, score: 2,
        hasHammer: false, hadLastStoneFirstEnd: true,
      },
      team2: {
        name: 'Team Jones', color: { name: 'Green', hex: '#4CAF50' }, score: 1,
        hasHammer: true, hadLastStoneFirstEnd: false,
      },
      ends: null,
    });
  });

  test('follows a renamed sheet', async () => {
    await db.doc(`${club}/sheets/s-rename`).set({ name: 'Old Name' });
    await waitFor('the sheet', () => sheetOf('s-rename'));
    await db.doc(`${club}/sheets/s-rename`).update({ name: 'New Name' });
    await waitFor('the new name', async () => (await sheetOf('s-rename'))?.name === 'New Name');
  });

  test('is not written for a scoreboard status report', async () => {
    await db.doc(`${club}/sheets/s-status`).set({ name: 'Sheet Status' });
    await waitFor('the sheet', () => sheetOf('s-status'));
    await settle();
    const written = (await stateDoc.get()).updateTime;

    await db.doc(`${club}/sheets/s-status`).update({ device: { appVersion: '0.0.53' } });
    await settle();
    assert.equal((await stateDoc.get()).updateTime.toMillis(), written.toMillis());
  });

  test('keeps a finished game as the sheet\'s final score once the live game ends', async () => {
    const sheetRef = db.doc(`${club}/sheets/s-final`);
    await sheetRef.set({ name: 'Sheet Final', liveGame });
    await waitFor('the live game', async () => (await sheetOf('s-final'))?.live);

    // The scoreboard's Finish Game write.
    const finishedAt = minutesAgo(1);
    const batch = db.batch();
    batch.set(sheetRef.collection('games').doc('g1'), completedGame(finishedAt));
    batch.update(sheetRef, { liveGame: FieldValue.delete() });
    await batch.commit();

    const summary = await waitFor('the final score', async () => {
      const s = (await stateDoc.get()).data();
      return lastGameOf(s, 's-final') && s.sheets['s-final'].live === null && s;
    });
    const last = lastGameOf(summary, 's-final');
    assert.equal(last.gameId, 'g1');
    assert.equal(last.finishedAt.toMillis(), finishedAt.toMillis());
    assert.equal(last.numberOfEnds, 8);
    assert.equal(last.league.name, 'Monday Night');
    assert.deepEqual(last.team1, {
      name: 'Team Smith', color: { name: 'Blue', hex: '#2196F3' }, score: 3,
      hasHammer: null, hadLastStoneFirstEnd: true,
    });
    assert.deepEqual(last.ends, [
      { endNumber: 1, scoringTeamSlot: 'team1', score: 2 },
      { endNumber: 2, scoringTeamSlot: null, score: 0 },
      { endNumber: 3, scoringTeamSlot: 'team2', score: 1 },
      { endNumber: 4, scoringTeamSlot: 'team1', score: 1 },
    ]);
    assert.equal(sheetView(summary, 's-final', Date.now()).kind, 'final');

    // The next draw starts on the sheet, inside the ten minutes.
    await sheetRef.update({ liveGame: { ...liveGame, updatedAt: Timestamp.now(), currentEnd: 1 } });
    await waitFor('the new game', async () => (await sheetOf('s-final'))?.live);
    const next = (await stateDoc.get()).data();
    assert.equal(lastGameOf(next, 's-final').gameId, 'g1', 'keeps the result');
    assert.equal(sheetView(next, 's-final', Date.now()).kind, 'live');
  });

  test('keeps the later game as the final score when an earlier one arrives late', async () => {
    const sheetRef = db.doc(`${club}/sheets/s-late`);
    await sheetRef.set({ name: 'Sheet Late' });
    await sheetRef.collection('games').doc('newer').set(completedGame(minutesAgo(5)));
    await waitFor('the newer game', async () => lastGameOf((await stateDoc.get()).data(), 's-late')?.gameId === 'newer');

    // From a scoreboard that was offline, say.
    await sheetRef.collection('games').doc('older').set(completedGame(minutesAgo(60)));
    const ids = await waitFor('the older game', async () => {
      const list = ((await stateDoc.get()).get('results') ?? []).map((r) => r.gameId);
      return list.includes('older') && list;
    });
    assert.ok(ids.indexOf('newer') < ids.indexOf('older'), `results in order: ${ids}`);
    assert.equal(lastGameOf((await stateDoc.get()).data(), 's-late').gameId, 'newer');
  });

  test('lists a finished game in the day\'s results, with its league\'s draws', async () => {
    await db.doc(`${club}/leagues/monday`).set({
      name: 'Monday Night', active: true, teams: [],
      draws: [{ day: 1, start: '18:30', end: '21:00' }, { day: 9, start: 'late', end: '' }],
    });
    const sheetRef = db.doc(`${club}/sheets/s-result`);
    await sheetRef.set({ name: 'Sheet Result' });
    await sheetRef.collection('games').doc('result').set(completedGame(minutesAgo(2)));

    const result = await waitFor('the result', async () =>
      ((await stateDoc.get()).get('results') ?? []).find((r) => r.gameId === 'result'));
    assert.equal(result.finishedAt.toMillis() - result.startedAt.toMillis(), 2 * 60 * 60 * 1000);
    assert.deepEqual({ ...result, startedAt: null, finishedAt: null, ends: null }, {
      gameId: 'result',
      sheetId: 's-result',
      sheetName: 'Sheet Result',
      startedAt: null,
      finishedAt: null,
      numberOfEnds: 8,
      endsPlayed: 4,
      league: { name: 'Monday Night', draws: [{ day: 1, start: '18:30', end: '21:00' }] },
      bonspiel: null,
      team1: {
        name: 'Team Smith', color: { name: 'Blue', hex: '#2196F3' }, score: 3,
        hasHammer: null, hadLastStoneFirstEnd: true,
      },
      team2: {
        name: 'Team Jones', color: { name: 'Green', hex: '#4CAF50' }, score: 1,
        hasHammer: null, hadLastStoneFirstEnd: false,
      },
      ends: null,
    });
    assert.equal(result.ends.length, 4);
  });

  test('clears the last game a sheet had before final scores came from the results', async () => {
    await stateDoc.set({ sheets: { 's-legacy': { name: 'Sheet Legacy', live: null, lastGame: { gameId: 'old' } } } }, { merge: true });
    await db.doc(`${club}/sheets/s-legacy`).set({ name: 'Sheet Legacy', liveGame });
    const sheet = await waitFor('the live game', async () => (await sheetOf('s-legacy'))?.live && sheetOf('s-legacy'));
    assert.equal(sheet.lastGame, undefined);
  });

  test('drops a deleted sheet', async () => {
    await db.doc(`${club}/sheets/s-gone`).set({ name: 'Sheet Gone' });
    await waitFor('the sheet', () => sheetOf('s-gone'));
    await db.doc(`${club}/sheets/s-gone`).delete();
    await waitFor('the sheet to go', async () => (await sheetOf('s-gone')) === undefined);
  });
});

describe('what a display shows for a sheet', () => {
  const now = Date.now();
  const at = (msAgo) => Timestamp.fromMillis(now - msAgo);
  const minutes = 60 * 1000;
  const live = (updatedAt) => ({ updatedAt, currentEnd: 1 });
  const result = (gameId, finishedAt, sheetId = 's') => ({ gameId, sheetId, finishedAt });
  const summary = (sheet, results) => ({ sheets: { s: { name: 'S', live: null, ...sheet } }, results });

  test('shows a live game ahead of a final score', () => {
    const view = sheetView(summary({ live: live(at(0)) }, [result('g', at(1 * minutes))]), 's', now);
    assert.equal(view.kind, 'live');
  });

  test('shows the final score for ten minutes', () => {
    assert.equal(sheetView(summary({}, [result('g', at(FINAL_SHOWN_MS))]), 's', now).kind, 'final');
    assert.equal(sheetView(summary({}, [result('g', at(FINAL_SHOWN_MS + 1))]), 's', now).kind, 'idle');
  });

  test('takes the sheet\'s own latest result as its final score', () => {
    const results = [result('other', at(0), 't'), result('older', at(5 * minutes)), result('newer', at(2 * minutes))];
    assert.equal(lastGameOf(summary({}, results), 's').gameId, 'newer');
    assert.equal(sheetView(summary({}, results), 's', now).game.gameId, 'newer');
    assert.equal(lastGameOf(summary({}, undefined), 's'), null);
  });

  test('ignores a live game abandoned for over two hours', () => {
    assert.equal(sheetView(summary({ live: live(at(121 * minutes)) }), 's', now).kind, 'idle');
    assert.equal(sheetView(summary({ live: live(at(119 * minutes)) }), 's', now).kind, 'live');
  });

  test('keeps a live game written before updatedAt was recorded', () => {
    assert.equal(sheetView(summary({ live: live(null) }), 's', now).kind, 'live');
  });

  test('says which bonspiel game a game is, live and finished', () => {
    const bonspiel = { id: 'fall', name: 'Fall Spiel', gameId: 'a7' };
    const team = { name: 'Smith', score: 1, totalScore: 1 };
    assert.deepEqual(displayLiveGame({ currentEnd: 1, bonspiel, team1: team, team2: team }).bonspiel, bonspiel);
    assert.deepEqual(
      displayFinishedGame('g', { finishedAt: at(0), bonspiel, team1: team, team2: team }).bonspiel, bonspiel,
    );
    assert.equal(displayLiveGame({ currentEnd: 1, team1: team, team2: team }).bonspiel, null);
    assert.equal(displayLiveGame({ currentEnd: 1, bonspiel: { id: 'fall' }, team1: team, team2: team }).bonspiel, null);
  });

  test('shows nothing for a sheet that has never had a game', () => {
    assert.equal(sheetView(summary({}), 's', now).kind, 'idle');
    assert.equal(sheetView(null, 's', now).kind, 'idle');
  });
});

describe('the summary\'s results', () => {
  const now = Date.now();
  const result = (gameId, minutesAgo) => ({ gameId, finishedAt: Timestamp.fromMillis(now - minutesAgo * 60 * 1000) });

  test('keeps the latest first, and a game delivered twice once', () => {
    let results = withResult(undefined, result('a', 30), now);
    results = withResult(results, result('b', 10), now);
    results = withResult(results, result('c', 20), now);
    results = withResult(results, result('b', 10), now);
    assert.deepEqual(results.map((r) => r.gameId), ['b', 'c', 'a']);
  });

  test('lets go of games from more than a day ago', () => {
    const old = result('old', RESULTS_KEPT_MS / 60000 + 1);
    assert.deepEqual(withResult([old], result('new', 1), now).map((r) => r.gameId), ['new']);
  });

  test('keeps at most a busy day\'s worth', () => {
    let results = [];
    for (let i = 0; i < MAX_RESULTS + 5; i++) results = withResult(results, result(`g${i}`, i), now);
    assert.equal(results.length, MAX_RESULTS);
    assert.equal(results[0].gameId, 'g0');
  });

  test('takes only whole draws from a league', () => {
    assert.deepEqual(leagueDraws({
      draws: [{ day: 2, start: '09:00', end: '11:00' }, { day: 0, start: '09:00', end: '11:00' },
        { day: 2, start: '9am', end: '11:00' }, null],
    }), [{ day: 2, start: '09:00', end: '11:00' }]);
    assert.deepEqual(leagueDraws(undefined), []);
  });
});

describe('the warm room\'s earlier results', () => {
  // Tuesday 20 October 2026, on this machine's clock, as the screen's is.
  const at = (hour, minute, day = 20) => new Date(2026, 9, day, hour, minute).getTime();
  const ts = (millis) => Timestamp.fromMillis(millis);
  const team = (name, score) => ({ name, color: null, score });
  const game = (sheetName, startedAt, finishedAt, league, scores = [5, 3]) => ({
    gameId: `${sheetName}-${startedAt}`,
    sheetName,
    startedAt: startedAt === null ? null : ts(startedAt),
    finishedAt: ts(finishedAt),
    numberOfEnds: 8,
    endsPlayed: 8,
    league,
    bonspiel: null,
    team1: team('Red', scores[0]),
    team2: team('Yellow', scores[1]),
  });
  const seniors = { name: 'Seniors', draws: [{ day: 2, start: '11:00', end: '13:00' }] };
  const ladies = { name: 'Daytime Ladies', draws: [] };

  test('groups the day\'s games by draw, the latest first, each by sheet', () => {
    const draws = todaysDraws([
      game('Sheet B', at(11, 4), at(12, 50), seniors),
      game('Sheet A', at(11, 10), at(13, 5), seniors),
      // An open game started in the same draw.
      game('Sheet C', at(11, 20), at(12, 40), null),
      // A league with no draws: its games go by when they started.
      game('Sheet A', at(8, 35), at(10, 20), ladies),
      game('Sheet B', at(8, 50), at(10, 30), ladies),
      // Yesterday's.
      game('Sheet A', at(19, 0, 19), at(21, 0, 19), null),
    ], at(14, 25));

    assert.deepEqual(draws.map((d) => [new Date(d.start).getHours(), new Date(d.start).getMinutes()]), [[11, 0], [8, 30]]);
    assert.deepEqual(draws.map((d) => d.names), [['Seniors'], ['Daytime Ladies']]);
    assert.deepEqual(draws[0].results.map((r) => r.sheetName), ['Sheet A', 'Sheet B', 'Sheet C']);
  });

  test('keeps a draw that runs past midnight with its evening', () => {
    const late = { name: 'Late League', draws: [{ day: 1, start: '22:00', end: '00:30' }] };
    const draws = todaysDraws([game('Sheet A', at(22, 5, 19), at(0, 25), late)], at(2, 0));
    assert.equal(draws.length, 1);
    assert.equal(draws[0].start, at(22, 0, 19));
    // A new day starts at 4 in the morning.
    assert.deepEqual(todaysDraws([game('Sheet A', at(22, 5, 19), at(0, 25), late)], at(4, 10)), []);
  });

  test('goes by when a game finished when it has no start', () => {
    const draws = todaysDraws([game('Sheet A', null, at(9, 58), null)], at(12, 0));
    assert.equal(draws[0].start, at(10, 0));
  });

  test('leaves out games still to finish, by this screen\'s clock', () => {
    assert.deepEqual(todaysDraws([game('Sheet A', at(11, 0), at(13, 0), null)], at(12, 0)), []);
    assert.deepEqual(todaysDraws(undefined, at(12, 0)), []);
  });

  test('names the winner, and a game that ended early or late', () => {
    assert.equal(winnerOf(game('A', 0, 0, null, [5, 3])), 'team1');
    assert.equal(winnerOf(game('A', 0, 0, null, [2, 7])), 'team2');
    assert.equal(winnerOf(game('A', 0, 0, null, [4, 4])), null);
    assert.equal(endedOffSchedule({ endsPlayed: 7, numberOfEnds: 8 }), true);
    assert.equal(endedOffSchedule({ endsPlayed: 9, numberOfEnds: 8 }), true);
    assert.equal(endedOffSchedule({ endsPlayed: 8, numberOfEnds: 8 }), false);
    assert.equal(endedOffSchedule({ endsPlayed: 0, numberOfEnds: 8 }), false);
    assert.equal(endedOffSchedule({ endsPlayed: 6, numberOfEnds: null }), false);
  });
});

describe('display links', () => {
  const clubId = 'display-links';
  let admin;

  before(async () => {
    await db.doc(`clubs/${clubId}`).set({ name: 'Display Links' });
    await db.doc(`clubs/${clubId}/private/displayState`).set({ sheets: { s1: { name: 'Sheet 1', live: null } } });
    await db.doc('clubs/display-other').set({ name: 'Other Club' });
    admin = await userWithClaims('display-admin@example.com', { role: 'clubadmin', clubId });
  });

  const createLink = async (label = 'Warm room TV') =>
    (await admin.call('createDisplayLink', { clubId, label })).data;

  test('creating a link is limited to the club\'s admins', async () => {
    const otherAdmin = await userWithClaims('display-other-admin@example.com', { role: 'clubadmin', clubId: 'display-other' });
    await rejectsWith(otherAdmin.call('createDisplayLink', { clubId, label: 'TV' }), 'functions/permission-denied');
    await rejectsWith((await anonymous()).call('createDisplayLink', { clubId, label: 'TV' }), 'functions/permission-denied');
    await rejectsWith((await clientFor()).call('createDisplayLink', { clubId, label: 'TV' }), 'functions/permission-denied');
  });

  test('a link needs a name', async () => {
    await rejectsWith(admin.call('createDisplayLink', { clubId, label: '  ' }), 'functions/invalid-argument');
    await rejectsWith(admin.call('createDisplayLink', { clubId, label: 'x'.repeat(61) }), 'functions/invalid-argument');
  });

  test('creates a link and keeps its token for the club\'s admins', async () => {
    const { linkId, token } = await createLink(' Stream ');
    assert.match(token, new RegExp(`^${linkId}\\.[0-9a-f]{32}$`));
    const link = (await db.doc(`clubs/${clubId}/displayLinks/${linkId}`).get()).data();
    assert.equal(link.label, 'Stream');
    assert.ok(link.createdAt);
    assert.deepEqual(Object.keys(link).sort(), ['createdAt', 'label', 'secretHash', 'settings', 'token']);
    assert.equal(link.token, token, 'so the portal can show the URL again');
    assert.deepEqual(link.settings, { page: 'warm-room' }, 'shows the warm room until changed');
    assert.notEqual(link.secretHash, token.split('.')[1], 'sign-in checks a hash of the secret');
  });

  test('a link signs a display in to read its club\'s summary, and nothing else', async () => {
    const { linkId, token } = await createLink();
    const unsigned = await clientFor();
    const session = await unsigned.call('startDisplaySession', { clubId, token });
    await signInWithCustomToken(unsigned.auth, session.data.token);

    const claims = (await unsigned.auth.currentUser.getIdTokenResult()).claims;
    assert.equal(claims.role, 'display');
    assert.equal(claims.clubId, clubId);
    assert.equal(claims.linkId, linkId);

    const firestore = getClientFirestore(unsigned.app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    const summary = await clientGetDoc(clientDoc(firestore, `clubs/${clubId}/private/displayState`));
    assert.equal(summary.get('sheets.s1.name'), 'Sheet 1');
    await assert.rejects(clientGetDoc(clientDoc(firestore, `clubs/${clubId}`)));

    const link = await db.doc(`clubs/${clubId}/displayLinks/${linkId}`).get();
    assert.ok(link.get('lastUsedAt'), 'records that the link was used');
  });

  test('turns away a wrong, malformed or other club\'s token', async () => {
    const { linkId, token } = await createLink();
    const caller = await clientFor();
    const wrongSecret = `${linkId}.${'0'.repeat(32)}`;
    for (const attempt of [
      { clubId, token: wrongSecret },
      { clubId, token: `nope.${'0'.repeat(32)}` },
      { clubId, token: 'not a token' },
      { clubId, token: token.toUpperCase() },
      { clubId: 'display-other', token },
    ]) {
      await rejectsWith(caller.call('startDisplaySession', attempt), 'functions/permission-denied');
    }
    await rejectsWith(caller.call('startDisplaySession', { clubId: 'a/b', token }), 'functions/invalid-argument');
  });

  test('revoking a link stops it signing in and removes its user', async () => {
    const { linkId, token } = await createLink();
    const display = await clientFor();
    await signInWithCustomToken(display.auth, (await display.call('startDisplaySession', { clubId, token })).data.token);
    const uid = display.auth.currentUser.uid;

    await rejectsWith((await anonymous()).call('revokeDisplayLink', { clubId, linkId }), 'functions/permission-denied');
    await admin.call('revokeDisplayLink', { clubId, linkId });

    assert.equal((await db.doc(`clubs/${clubId}/displayLinks/${linkId}`).get()).exists, false);
    await assert.rejects(adminAuth.getUser(uid), (err) => err.code === 'auth/user-not-found');
    await rejectsWith((await clientFor()).call('startDisplaySession', { clubId, token }), 'functions/permission-denied');
  });

  test('signs in with a link made before tokens were kept', async () => {
    const { linkId, token } = await createLink();
    await db.doc(`clubs/${clubId}/displayLinks/${linkId}`).update({ token: FieldValue.delete() });
    const display = await clientFor();
    assert.ok((await display.call('startDisplaySession', { clubId, token })).data.token);
  });

  test('a display reads its own link\'s settings, not another\'s', async () => {
    const { linkId, token } = await createLink();
    const other = await createLink('Other');
    const display = await clientFor();
    await signInWithCustomToken(display.auth, (await display.call('startDisplaySession', { clubId, token })).data.token);
    const firestore = getClientFirestore(display.app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    const own = await clientGetDoc(clientDoc(firestore, `clubs/${clubId}/displayLinks/${linkId}`));
    assert.deepEqual(own.get('settings'), { page: 'warm-room' });
    await assert.rejects(clientGetDoc(clientDoc(firestore, `clubs/${clubId}/displayLinks/${other.linkId}`)));
  });

  test('resetting a link gives it a new URL and keeps what it shows', async () => {
    const { linkId, token } = await createLink();
    await db.doc(`clubs/${clubId}/displayLinks/${linkId}`).update({ settings: { page: 'bug', sheetId: 's1' } });
    const display = await clientFor();
    await signInWithCustomToken(display.auth, (await display.call('startDisplaySession', { clubId, token })).data.token);
    const uid = display.auth.currentUser.uid;

    await rejectsWith((await anonymous()).call('resetDisplayLink', { clubId, linkId }), 'functions/permission-denied');
    const reset = (await admin.call('resetDisplayLink', { clubId, linkId })).data;
    assert.equal(reset.linkId, linkId);
    assert.match(reset.token, new RegExp(`^${linkId}\\.[0-9a-f]{32}$`));
    assert.notEqual(reset.token, token);

    const link = (await db.doc(`clubs/${clubId}/displayLinks/${linkId}`).get()).data();
    assert.deepEqual(link.settings, { page: 'bug', sheetId: 's1' });
    assert.equal(link.token, reset.token, 'keeps the new token for the portal');
    await assert.rejects(adminAuth.getUser(uid), (err) => err.code === 'auth/user-not-found');
    await rejectsWith((await clientFor()).call('startDisplaySession', { clubId, token }), 'functions/permission-denied');
    const fresh = await clientFor();
    assert.ok((await fresh.call('startDisplaySession', { clubId, token: reset.token })).data.token);
  });

  test('cannot reset a link that was removed', async () => {
    const { linkId } = await createLink();
    await admin.call('revokeDisplayLink', { clubId, linkId });
    await rejectsWith(admin.call('resetDisplayLink', { clubId, linkId }), 'functions/not-found');
  });

  test('revokes a link that was never used', async () => {
    const { linkId } = await createLink();
    await admin.call('revokeDisplayLink', { clubId, linkId });
    assert.equal((await db.doc(`clubs/${clubId}/displayLinks/${linkId}`).get()).exists, false);
  });

  test('limits a club to twenty links', async () => {
    const limited = 'display-limited';
    await db.doc(`clubs/${limited}`).set({ name: 'Limited' });
    const batch = db.batch();
    for (let i = 0; i < 20; i++) {
      batch.set(db.doc(`clubs/${limited}/displayLinks/l${i}`), { label: `TV ${i}`, secretHash: 'ab' });
    }
    await batch.commit();
    const caller = await superAdmin('display-super@example.com');
    await rejectsWith(caller.call('createDisplayLink', { clubId: limited, label: 'One more' }), 'functions/resource-exhausted');
  });
});

describe('display pages', () => {
  const PAGES_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/display/display`;

  function pageConfig(html) {
    const match = /<script type="application\/json" id="display-config">(.*?)<\/script>/s.exec(html);
    assert.ok(match, 'has the config block');
    return JSON.parse(match[1]);
  }

  test('serves the score bug, locked down and never cached', async () => {
    const before = Date.now();
    const res = await fetch(`${PAGES_URL}/club-a/sheets/sheet-1/bug`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self' https:\/\/www\.gstatic\.com(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);

    const html = await res.text();
    assert.match(html, /<script type="module" src="\.\.\/\.\.\/\.\.\/assets\/bug\.js"><\/script>/);
    const config = pageConfig(html);
    assert.equal(config.page, 'bug');
    assert.equal(config.clubId, 'club-a');
    assert.equal(config.sheetId, 'sheet-1');
    assert.equal(config.firebase.projectId, PROJECT_ID);
    assert.equal(config.finalShownMs, FINAL_SHOWN_MS);
    assert.ok(config.serverNow >= before && config.serverNow <= Date.now(), 'carries the server time');
    assert.equal(config.buildId, '', 'a local build has no build ID, so never updates');
  });

  test('serves the warm room screen for a club', async () => {
    const res = await fetch(`${PAGES_URL}/club-a/warm-room`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await res.text();
    assert.match(html, /<script type="module" src="\.\.\/assets\/warm-room\.js"><\/script>/);
    const config = pageConfig(html);
    assert.equal(config.page, 'warm-room');
    assert.equal(config.clubId, 'club-a');
    assert.equal(config.sheetId, undefined);
  });

  test('serves a bonspiel\'s screen', async () => {
    const res = await fetch(`${PAGES_URL}/club-a/bonspiels/fall`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await res.text();
    assert.match(html, /<script type="module" src="\.\.\/\.\.\/assets\/bonspiel\.js"><\/script>/);
    const config = pageConfig(html);
    assert.equal(config.page, 'bonspiel');
    assert.equal(config.clubId, 'club-a');
    assert.equal(config.bonspielId, 'fall');
  });

  test('serves a display link\'s own page for a club', async () => {
    const res = await fetch(`${PAGES_URL}/club-a`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await res.text();
    assert.match(html, /<script type="module" src="assets\/link\.js"><\/script>/);
    const config = pageConfig(html);
    assert.equal(config.page, 'link');
    assert.equal(config.clubId, 'club-a');
  });

  test('serves the pages\' scripts and styles', async () => {
    for (const [file, type] of [
      ['display.js', /javascript/], ['bug.js', /javascript/], ['bug.css', /css/],
      ['warm-room.js', /javascript/], ['warm-room.css', /css/],
      ['link.js', /javascript/], ['link.css', /css/],
      ['bonspiel.js', /javascript/], ['bonspiel-model.js', /javascript/], ['bonspiel.css', /css/],
      ['update-model.js', /javascript/], ['game-view.js', /javascript/],
      ['scores.js', /javascript/], ['scores-model.js', /javascript/], ['scores.css', /css/],
    ]) {
      const res = await fetch(`${PAGES_URL}/assets/${file}`);
      assert.equal(res.status, 200, file);
      assert.match(res.headers.get('content-type'), type, file);
      assert.equal(res.headers.get('cache-control'), 'no-cache', file);
    }
  });

  test('answers 404 for anything else', async () => {
    for (const path of [
      '/club-a/sheets/sheet%3Cscript%3E/bug',
      '/club.a/sheets/sheet-1/bug',
      '/club-a/sheets/sheet-1',
      '/club%3Cb%3E/warm-room',
      '/club-a/bonspiels/fall%3Cscript%3E',
      '/club-a/bonspiels',
      '/assets/missing.js',
      '/assets/../pages.js',
      '/',
      '/assets',
      '/club%3Cb%3E',
    ]) {
      const res = await fetch(`${PAGES_URL}${path}`);
      assert.equal(res.status, 404, path);
    }
  });
});

describe('the public scores page', () => {
  const PAGES_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/display/display`;
  const clubId = 'scores-club';
  const club = `clubs/${clubId}`;
  const now = Date.now();
  const at = (msAgo) => Timestamp.fromMillis(now - msAgo);
  const minutes = 60 * 1000;
  // A 1 by 1 PNG.
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const LOGO = `data:image/png;base64,${PNG}`;

  const team = (name, hex, score, hasHammer) => ({
    name, color: { name: 'Rock', hex }, score, hasHammer, hadLastStoneFirstEnd: false,
  });
  const ends = [
    { endNumber: 1, scoringTeamSlot: 'team1', score: 2 },
    { endNumber: 2, scoringTeamSlot: null, score: 0 },
  ];
  const result = {
    gameId: 'g1', sheetId: 'c', sheetName: 'Sheet C',
    startedAt: at(130 * minutes), finishedAt: at(5 * minutes), numberOfEnds: 8, endsPlayed: 8,
    league: { name: 'Monday Night', draws: [{ day: 1, start: '18:30', end: '20:30' }] }, bonspiel: null,
    team1: team('Galas', '#c62828', 6, null), team2: team('Kirchhoff', '#f9a825', 4, null),
    ends: [{ endNumber: 8, scoringTeamSlot: 'team1', score: 1 }],
  };
  const summary = {
    sheets: {
      b: {
        name: 'Sheet B',
        live: {
          updatedAt: at(1 * minutes), currentEnd: 3, numberOfEnds: 8,
          league: null, bonspiel: { id: 'fall', name: 'Fall Spiel', gameId: 'A1' },
          team1: team('Smith', '#2196F3', 2, false), team2: team('Jones', '#4CAF50', 0, true), ends,
        },
      },
      a: {
        name: 'Sheet A',
        live: {
          updatedAt: at(1 * minutes), currentEnd: 2, numberOfEnds: null, league: { name: 'Monday Night' },
          bonspiel: null, team1: team('Lee', '#000000', 1, true), team2: team('Kim', '#ffffff', 0, false),
          ends: null,
        },
      },
      c: { name: 'Sheet C', live: null },
      d: { name: 'Sheet D', live: null },
      // A game whose scoreboard went away hours ago is not shown.
      e: { name: 'Sheet E', live: { updatedAt: at(5 * 60 * minutes), currentEnd: 4, team1: team('X', '#000000', 0, true), team2: team('Y', '#000000', 0, false) } },
    },
    results: [result],
  };

  before(async () => {
    await db.doc(club).set({ name: 'Scores Club' });
    await db.doc(`${club}/private/displayState`).set(summary);
    await db.doc(`${club}/private/displayBranding`).set({ title: 'Scores Club', logo: LOGO });
    await db.doc(`${club}/private/publicScores`).set({ enabled: true });
  });

  test('shows every sheet in name order, with any kind of game', () => {
    const live = scoresLive(summary, { title: 'Scores Club', logo: LOGO }, now);
    assert.deepEqual(live.sheets.map((s) => [s.name, s.kind]), [
      ['Sheet A', 'live'], ['Sheet B', 'live'], ['Sheet C', 'final'], ['Sheet D', 'idle'], ['Sheet E', 'idle'],
    ]);
    const [a, b, c, d] = live.sheets;
    assert.equal(a.game.event, 'Monday Night');
    assert.equal(b.game.event, 'Fall Spiel', 'a bonspiel game is named for its bonspiel');
    assert.deepEqual(b.game, {
      event: 'Fall Spiel', currentEnd: 3, numberOfEnds: 8,
      team1: { name: 'Smith', color: '#2196F3', score: 2, hasHammer: false },
      team2: { name: 'Jones', color: '#4CAF50', score: 0, hasHammer: true },
      ends,
    });
    assert.equal(c.game.currentEnd, 8, 'a final score is at its last end');
    assert.equal(c.game.team1.hasHammer, null, 'and has no hammer');
    assert.equal(d.game, undefined);
    assert.equal(live.title, 'Scores Club');
    assert.equal(live.logo, `logo?v=${versionOf(LOGO)}`);
    assert.equal(live.resultsVersion, versionOf(scoresResults(summary)));
  });

  test('leaves out what the phone does not show', () => {
    const json = JSON.stringify(scoresLive(summary, {}, now));
    for (const left of ['updatedAt', 'hadLastStoneFirstEnd', 'gameId', '"fall"', 'draws', 'startedAt', 'base64']) {
      assert.ok(!json.includes(left), left);
    }
    assert.equal(scoresLive(summary, {}, now).title, null);
    assert.equal(scoresLive(summary, {}, now).logo, null);
    assert.deepEqual(scoresLive(null, null, now).sheets, []);
  });

  test('sends results with their draws, in milliseconds', () => {
    const [r] = scoresResults(summary).results;
    assert.deepEqual(r, {
      sheetName: 'Sheet C', startedAt: now - 130 * minutes, finishedAt: now - 5 * minutes,
      numberOfEnds: 8, endsPlayed: 8,
      league: { name: 'Monday Night', draws: [{ day: 1, start: '18:30', end: '20:30' }] }, bonspiel: null,
      team1: { name: 'Galas', color: '#c62828', score: 6 },
      team2: { name: 'Kirchhoff', color: '#f9a825', score: 4 },
    });
    assert.deepEqual(scoresResults(undefined), { results: [] });
  });

  test('only shows raster logos', () => {
    assert.equal(decodeLogo(LOGO).type, 'image/png');
    assert.equal(decodeLogo('data:image/svg+xml;base64,PHN2Zz4='), null);
    assert.equal(decodeLogo('https://example.com/logo.png'), null);
    assert.equal(decodeLogo(undefined), null);
  });

  test('serves the page with no Firebase, never cached', async () => {
    const res = await fetch(`${PAGES_URL}/${clubId}/scores`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /connect-src 'self'(;|$)/);
    const html = await res.text();
    assert.match(html, /<script type="module" src="\.\.\/assets\/scores\.js"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="\.\.\/assets\/scores\.css">/);
  });

  test('serves live.json for the CDN to keep, and 304 when nothing changed', async () => {
    const res = await fetch(`${PAGES_URL}/${clubId}/scores/live.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=15, s-maxage=30');
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    const etag = res.headers.get('etag');
    assert.ok(etag, 'has an ETag');
    const body = await res.text();
    const live = JSON.parse(body);
    assert.equal(live.title, 'Scores Club');
    assert.equal(live.sheets.length, 5);

    // The same data always makes the same body, and so the same ETag.
    const second = await fetch(`${PAGES_URL}/${clubId}/scores/live.json`);
    assert.equal(await second.text(), body);
    assert.equal(second.headers.get('etag'), etag);

    // As the page's fetch with cache: 'no-cache' asks. Given If-None-Match by
    // hand, fetch would otherwise add Cache-Control: no-cache, to which
    // Express never answers 304.
    const again = await fetch(`${PAGES_URL}/${clubId}/scores/live.json`, {
      headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' },
    });
    assert.equal(again.status, 304);
    assert.equal(await again.text(), '');
  });

  test('serves results.json, kept longer', async () => {
    const res = await fetch(`${PAGES_URL}/${clubId}/scores/results.json`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=300');
    assert.equal((await res.json()).results[0].sheetName, 'Sheet C');
  });

  test('serves the logo as an image, kept for good at its own version', async () => {
    const res = await fetch(`${PAGES_URL}/${clubId}/scores/logo?v=${versionOf(LOGO)}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(PNG, 'base64'));

    const old = await fetch(`${PAGES_URL}/${clubId}/scores/logo?v=old`);
    assert.equal(old.status, 200);
    assert.equal(old.headers.get('cache-control'), 'public, max-age=60, s-maxage=300');
  });

  test('answers 404, cached briefly, for a club that has not turned it on', async () => {
    await db.doc('clubs/scores-off').set({ name: 'Scores Off' });
    await db.doc('clubs/scores-off/private/displayState').set(summary);
    await db.doc('clubs/scores-off/private/publicScores').set({ enabled: false });
    for (const path of ['live.json', 'results.json', 'logo']) {
      for (const id of ['scores-off', 'scores-missing']) {
        const res = await fetch(`${PAGES_URL}/${id}/scores/${path}`);
        assert.equal(res.status, 404, `${id} ${path}`);
        assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=60', `${id} ${path}`);
      }
    }
    assert.equal((await fetch(`${PAGES_URL}/club%3Cb%3E/scores/live.json`)).status, 404);
  });
});

describe('how often the scores page polls', () => {
  test('every half minute while any sheet has a game, every five while none do', () => {
    assert.equal(pollDelay({ sheets: [{ kind: 'idle' }, { kind: 'live' }] }), LIVE_POLL_MS);
    assert.equal(pollDelay({ sheets: [{ kind: 'final' }] }), LIVE_POLL_MS);
    assert.equal(pollDelay({ sheets: [{ kind: 'idle' }] }), QUIET_POLL_MS);
    assert.equal(pollDelay(null), QUIET_POLL_MS, 'and while it cannot tell');
  });

  test('shown again, polls when one is due and otherwise waits out the rest', () => {
    const live = { sheets: [{ kind: 'live' }] };
    assert.equal(timeUntilDue(live, null, 1000), 0, 'never fetched');
    assert.equal(timeUntilDue(live, 0, 5000), LIVE_POLL_MS - 5000);
    assert.equal(timeUntilDue(live, 0, LIVE_POLL_MS + 1), 0);
    assert.equal(timeUntilDue(null, 0, LIVE_POLL_MS), QUIET_POLL_MS - LIVE_POLL_MS);
  });

  test('stops once the phone has been left alone for half an hour', () => {
    assert.equal(isIdle(0, IDLE_PAUSE_MS - 1), false);
    assert.equal(isIdle(0, IDLE_PAUSE_MS), true);
  });

  test('reads results.json for the warm room\'s draws', () => {
    const team = (name, score) => ({ name, color: '#c62828', score });
    const results = asSummaryResults({
      results: [
        { sheetName: 'Sheet A', startedAt: 1000, finishedAt: 5000, endsPlayed: 6, numberOfEnds: 8,
          league: null, bonspiel: { name: 'Fall Spiel' }, team1: team('A', 3), team2: team('B', 5) },
        { sheetName: 'Sheet B', finishedAt: 'not a time' },
      ],
    });
    assert.equal(results.length, 1, 'leaves out a result with no finish time');
    assert.equal(results[0].finishedAt.toMillis(), 5000);
    assert.equal(results[0].startedAt.toMillis(), 1000);
    assert.deepEqual(results[0].team1.color, { hex: '#c62828' });
    assert.equal(winnerOf(results[0]), 'team2');
    assert.equal(endedOffSchedule(results[0]), true);
    assert.deepEqual(asSummaryResults(null), []);
  });
});

describe('updating a display onto a new version', () => {
  test('targets a deployed build other than the running one', () => {
    assert.equal(targetBuild('aaa', 'bbb'), 'bbb');
    assert.equal(targetBuild('aaa', 'aaa'), null);
    assert.equal(targetBuild('aaa', null), null);
    assert.equal(targetBuild('aaa', ''), null);
    assert.equal(targetBuild('aaa', 42), null);
    assert.equal(targetBuild('', 'bbb'), null, 'a local build never updates');
  });

  test('does not retry a reload for the same build straight away', () => {
    const at = 1_000_000;
    assert.equal(canReload(null, null, at), false);
    assert.equal(canReload('bbb', null, at), true);
    assert.equal(canReload('bbb', { target: 'ccc', at }, at), true);
    assert.equal(canReload('bbb', { target: 'bbb', at }, at + RETRY_RELOAD_AFTER_MS - 1), false);
    assert.equal(canReload('bbb', { target: 'bbb', at }, at + RETRY_RELOAD_AFTER_MS), true);
    assert.equal(canReload('bbb', { target: 'bbb' }, at), true, 'an unreadable attempt is ignored');
  });

  test('checks daily at 1 AM local time', () => {
    const hours = (ms) => ms / 3_600_000;
    assert.equal(hours(timeUntilNextDailyCheck(new Date(2026, 5, 15, 0, 0))), 1);
    assert.equal(hours(timeUntilNextDailyCheck(new Date(2026, 5, 15, 1, 0))), 24);
    assert.equal(hours(timeUntilNextDailyCheck(new Date(2026, 5, 15, 22, 0))), 3);
  });
});

describe('working out a bonspiel', () => {
  // Four teams, two A event semis feeding the A final, and their losers
  // dropping into a one game B event.
  const plan = {
    events: [{ id: 'a', name: 'A Event' }, { id: 'b', name: 'B Event' }],
    teams: [
      { id: 't1', name: 'Smith' }, { id: 't2', name: 'Jones' },
      { id: 't3', name: 'Brown' }, { id: 't4', name: 'Lee' },
    ],
    games: [
      { id: 'a1', eventId: 'a', team1: { teamId: 't1' }, team2: { teamId: 't2' } },
      { id: 'a2', eventId: 'a', team1: { teamId: 't3' }, team2: { teamId: 't4' } },
      {
        id: 'a3', eventId: 'a',
        team1: { from: 'a1', result: 'winner' }, team2: { from: 'a2', result: 'winner' },
      },
      {
        id: 'b1', eventId: 'b',
        team1: { from: 'a1', result: 'loser' }, team2: { from: 'a2', result: 'loser' },
      },
    ],
  };
  const withResults = (results) => ({
    ...plan,
    games: plan.games.map((g) => (results[g.id] ? { ...g, result: results[g.id] } : g)),
  });
  const recorded = (team1, score1, team2, score2) => ({
    sheetId: 's1', sheetGameId: 'g1', finishedAt: Timestamp.now(),
    team1: { ...team1, score: score1 }, team2: { ...team2, score: score2 },
  });

  test('leaves games that come from others waiting until those have results', () => {
    const { games, events } = resolveBonspiel(plan, {});
    assert.equal(games.a1.status, 'ready');
    assert.deepEqual(games.a1.team1, { teamId: 't1', name: 'Smith' });
    assert.equal(games.a3.status, 'waiting');
    assert.equal(games.a3.team1, null);
    assert.deepEqual(events, { a: { finalGameId: 'a3' }, b: { finalGameId: 'b1' } });
  });

  test('sends winners and losers on once the coordinator gives results', () => {
    const { games } = resolveBonspiel(withResults({ a1: { winner: 'team2' }, a2: { winner: 'team1' } }), {});
    assert.deepEqual([games.a3.team1?.name, games.a3.team2?.name], ['Jones', 'Brown']);
    assert.deepEqual([games.b1.team1?.name, games.b1.team2?.name], ['Smith', 'Lee']);
    assert.equal(games.a3.status, 'ready');
    assert.equal(games.a1.resultFrom, 'coordinator');
  });

  test('names each event\'s winner from its final', () => {
    const { events } = resolveBonspiel(withResults({
      a1: { winner: 'team1' }, a2: { winner: 'team1' }, a3: { winner: 'team2', team1Score: 3, team2Score: 6 },
      b1: { winner: 'team1' },
    }), {});
    assert.deepEqual(events.a, { finalGameId: 'a3', winner: { teamId: 't3', name: 'Brown' } });
    assert.deepEqual(events.b, { finalGameId: 'b1', winner: { teamId: 't2', name: 'Jones' } });
  });

  test('takes a scoreboard\'s result, and who actually played', () => {
    const { games } = resolveBonspiel(plan, {
      // Lee played in place of Jones.
      a1: recorded({ teamId: 't1', name: 'Smith' }, 7, { teamId: 't4', name: 'Lee' }, 4),
    });
    assert.equal(games.a1.status, 'final');
    assert.equal(games.a1.resultFrom, 'scoreboard');
    assert.deepEqual([games.a1.team1Score, games.a1.team2Score, games.a1.winner], [7, 4, 'team1']);
    assert.deepEqual(games.a1.team2, { teamId: 't4', name: 'Lee' });
    assert.deepEqual(games.b1.team1, { teamId: 't4', name: 'Lee' });
  });

  test('lets the coordinator\'s result win over a scoreboard\'s', () => {
    const { games } = resolveBonspiel(withResults({ a1: { winner: 'team2' } }), {
      a1: recorded({ teamId: 't1', name: 'Smith' }, 7, { teamId: 't2', name: 'Jones' }, 4),
    });
    assert.equal(games.a1.winner, 'team2');
    assert.equal(games.a1.resultFrom, 'coordinator');
    assert.equal(games.a3.team1?.name, 'Jones');
  });

  test('keeps a scoreboard\'s scores when the coordinator only settles a tie', () => {
    const { games } = resolveBonspiel(withResults({ a1: { winner: 'team2' } }), {
      a1: recorded({ teamId: 't1', name: 'Smith' }, 5, { teamId: 't2', name: 'Jones' }, 5),
    });
    assert.deepEqual([games.a1.team1Score, games.a1.team2Score, games.a1.winner], [5, 5, 'team2']);
    assert.equal(games.a1.tied, undefined);
    assert.equal(games.a3.team1?.name, 'Jones');
  });

  test('sends nobody on from a tied game', () => {
    const { games } = resolveBonspiel(plan, {
      a1: recorded({ teamId: 't1', name: 'Smith' }, 5, { teamId: 't2', name: 'Jones' }, 5),
    });
    assert.equal(games.a1.status, 'final');
    assert.equal(games.a1.tied, true);
    assert.equal(games.a1.winner, undefined);
    assert.equal(games.a3.team1, null);
  });

  test('leaves a game waiting that refers to itself or to a game that is not there', () => {
    const { games } = resolveBonspiel({
      ...plan,
      games: [
        { id: 'x', eventId: 'a', team1: { from: 'x', result: 'winner' }, team2: { teamId: 't1' } },
        { id: 'y', eventId: 'a', team1: { from: 'gone', result: 'winner' }, team2: { teamId: 'nobody' } },
      ],
    }, {});
    assert.equal(games.x.status, 'waiting');
    assert.equal(games.x.team1, null);
    assert.deepEqual([games.y.team1, games.y.team2], [null, null]);
  });

  test('gives an event with no single final standings, and no winner', () => {
    const { events } = resolveBonspiel({
      ...plan,
      games: [
        { id: 'r1', eventId: 'a', team1: { teamId: 't1' }, team2: { teamId: 't2' }, result: { winner: 'team1' } },
        { id: 'r2', eventId: 'a', team1: { teamId: 't3' }, team2: { teamId: 't4' }, result: { winner: 'team1' } },
      ],
    }, {});
    assert.equal(events.a.winner, undefined);
    assert.equal(events.a.finalGameId, undefined);
    assert.equal(events.a.complete, true);
    assert.deepEqual(events.a.standings.map((r) => [r.name, r.place, r.tied]),
      [['Brown', 1, true], ['Smith', 1, true], ['Jones', 3, true], ['Lee', 3, true]]);
  });
});

describe('pools and their standings', () => {
  // Pool A is a round robin of three; its top two play the final.
  const g = (id, a, b, result) => ({
    id, eventId: 'pool', team1: { teamId: a }, team2: { teamId: b }, ...(result && { result }),
  });
  const pool = (results, extra = {}) => ({
    events: [{ id: 'pool', name: 'Pool A', ...extra }, { id: 'final', name: 'Final' }],
    teams: [{ id: 'x', name: 'Smith' }, { id: 'y', name: 'Jones' }, { id: 'z', name: 'Brown' }],
    games: [
      g('p1', 'x', 'y', results.p1), g('p2', 'y', 'z', results.p2), g('p3', 'z', 'x', results.p3),
      {
        id: 'f', eventId: 'final',
        team1: { rank: 1, eventId: 'pool' }, team2: { rank: 2, eventId: 'pool' },
      },
    ],
  });
  const won = (slot) => ({ winner: slot });
  const places = (state) => state.events.pool.standings.map((r) => `${r.place}${r.tied ? '=' : ''} ${r.name} ${r.points}`);

  test('ranks a pool by wins, and sends its top places on once it is over', () => {
    const state = resolveBonspiel(pool({ p1: won('team1'), p2: won('team1'), p3: won('team2') }), {});
    // Smith 2-0, Jones 1-1, Brown 0-2.
    assert.deepEqual(places(state), ['1 Smith 4', '2 Jones 2', '3 Brown 0']);
    assert.equal(state.events.pool.complete, true);
    assert.deepEqual([state.games.f.team1, state.games.f.team2], [{ teamId: 'x', name: 'Smith' }, { teamId: 'y', name: 'Jones' }]);
    // A pool is decided by its standings, so it has no final of its own.
    assert.equal(state.events.pool.finalGameId, undefined);
    assert.equal(state.events.final.finalGameId, 'f');
  });

  test('keeps the places open until every game in the pool is played', () => {
    const state = resolveBonspiel(pool({ p1: won('team1'), p2: won('team1') }), {});
    assert.equal(state.events.pool.complete, false);
    assert.deepEqual([state.games.f.team1, state.games.f.team2], [null, null]);
    assert.equal(state.games.f.status, 'waiting');
  });

  test('breaks a tie on points by the game between the two', () => {
    // Four teams, so two can finish level: Smith and Jones both 2-1, and
    // Smith beat Jones; Lee and Brown both 1-2.
    const plan = pool({});
    plan.teams.push({ id: 'w', name: 'Lee' });
    plan.games = [
      g('p1', 'x', 'y', won('team1')), g('p2', 'x', 'z', won('team2')), g('p3', 'x', 'w', won('team1')),
      g('p4', 'y', 'z', won('team1')), g('p5', 'y', 'w', won('team1')), g('p6', 'z', 'w', won('team2')),
      plan.games[3],
    ];
    const state = resolveBonspiel(plan, {});
    // Lee beat Brown, which settles third place the same way.
    assert.deepEqual(places(state), ['1 Smith 4', '2 Jones 4', '3 Lee 2', '4 Brown 2']);
    assert.equal(state.games.f.team1.name, 'Smith');
    assert.equal(state.games.f.team2.name, 'Jones');
  });

  test('leaves a place no game can settle shared, until the coordinator orders it', () => {
    // Everyone 1-1: the games between them are level too.
    const results = { p1: won('team1'), p2: won('team1'), p3: won('team1') };
    let state = resolveBonspiel(pool(results), {});
    assert.deepEqual(places(state), ['1= Brown 2', '1= Jones 2', '1= Smith 2']);
    assert.deepEqual([state.games.f.team1, state.games.f.team2], [null, null]);

    // By last stone draw: Jones, then Brown.
    state = resolveBonspiel(pool(results, { tiebreak: ['y', 'z'] }), {});
    assert.deepEqual(places(state), ['1 Jones 2', '2 Brown 2', '3 Smith 2']);
    assert.equal(state.games.f.team1.name, 'Jones');
    assert.equal(state.games.f.team2.name, 'Brown');
  });

  test('counts a tied game as a point each', () => {
    const tie = (team1, team2) => ({
      sheetId: 's', sheetGameId: 'g', finishedAt: Timestamp.now(),
      team1: { ...team1, score: 4 }, team2: { ...team2, score: 4 },
    });
    const state = resolveBonspiel(pool({ p2: won('team1'), p3: won('team2') }), {
      p1: tie({ teamId: 'x', name: 'Smith' }, { teamId: 'y', name: 'Jones' }),
    });
    const smith = state.events.pool.standings.find((r) => r.name === 'Smith');
    assert.deepEqual([smith.wins, smith.ties, smith.points], [1, 1, 3]);
  });

  test('leaves a place in its own event unknown rather than going round in circles', () => {
    const plan = pool({ p1: won('team1'), p2: won('team1'), p3: won('team2') });
    plan.games.push({ id: 'loop', eventId: 'pool', team1: { rank: 1, eventId: 'pool' }, team2: { teamId: 'x' } });
    const state = resolveBonspiel(plan, {});
    assert.equal(state.games.loop.team1, null);
  });
});

describe('bonspiel state', () => {
  const club = 'clubs/bonspiel-club';
  const planDoc = db.doc(`${club}/bonspiels/fall`);
  const stateDoc = db.doc(`${club}/bonspiels/fall/state/current`);
  const plan = {
    name: 'Fall Spiel', active: true, startDate: '2026-11-06', endDate: '2026-11-08', numberOfEnds: 8,
    events: [{ id: 'a', name: 'A Event' }],
    teams: [{ id: 't1', name: 'Smith' }, { id: 't2', name: 'Jones' }, { id: 't3', name: 'Brown' }],
    draws: [{ id: 'd1', label: 'Draw 1', start: '2026-11-06T19:00' }, { id: 'd2', label: 'Draw 2', start: '2026-11-07T09:00' }],
    games: [
      { id: 'g1', label: 'A1', drawId: 'd1', sheetId: 's1', eventId: 'a', team1: { teamId: 't1' }, team2: { teamId: 't2' } },
      {
        id: 'g2', label: 'A2', drawId: 'd2', sheetId: 's1', eventId: 'a',
        team1: { from: 'g1', result: 'winner' }, team2: { teamId: 't3' },
      },
    ],
  };
  const playedGame = (finishedAt, score1, score2, extra = {}) => ({
    startedAt: Timestamp.fromMillis(finishedAt.toMillis() - 2 * 60 * 60 * 1000),
    finishedAt,
    numberOfEnds: 8,
    bonspiel: { id: 'fall', name: 'Fall Spiel', gameId: 'g1' },
    team1: { name: 'Smith', teamId: 't1', totalScore: score1, hadLastStoneFirstEnd: true },
    team2: { name: 'Jones', teamId: 't2', totalScore: score2, hadLastStoneFirstEnd: false },
    ends: [],
    ...extra,
  });

  before(async () => {
    await db.doc(club).set({ name: 'Bonspiel Club' });
    await db.doc(`${club}/sheets/s1`).set({ name: 'Sheet 1' });
  });

  test('is worked out when the plan is saved', async () => {
    await planDoc.set(plan);
    const state = await waitFor('the state', async () => (await stateDoc.get()).data());
    assert.equal(state.games.g1.status, 'ready');
    assert.equal(state.games.g2.status, 'waiting');
    assert.deepEqual(state.events.a, { finalGameId: 'g2' });
    assert.deepEqual(state.results, {});
  });

  test('takes in a game a scoreboard played for the bonspiel', async () => {
    await db.collection(`${club}/sheets/s1/games`).add(playedGame(Timestamp.now(), 6, 2));
    const state = await waitFor('the result', async () => {
      const data = (await stateDoc.get()).data();
      return data?.games.g1.status === 'final' && data;
    });
    assert.equal(state.games.g1.winner, 'team1');
    assert.equal(state.games.g1.sheetId, 's1');
    assert.deepEqual(state.games.g2.team1, { teamId: 't1', name: 'Smith' });
    assert.equal(state.results.g1.team1.score, 6);
  });

  test('keeps a later result over an earlier one delivered late', async () => {
    await db.collection(`${club}/sheets/s1/games`).add(
      playedGame(Timestamp.fromMillis(Date.now() - 60 * 60 * 1000), 1, 9),
    );
    // Then a game that does count, so there is something to wait for.
    await db.collection(`${club}/sheets/s1/games`).add(playedGame(Timestamp.now(), 4, 5));
    const state = await waitFor('the later result', async () => {
      const data = (await stateDoc.get()).data();
      return data?.games.g1.team2Score === 5 && data;
    });
    assert.equal(state.games.g1.winner, 'team2');
    assert.deepEqual(state.games.g2.team1, { teamId: 't2', name: 'Jones' });
  });

  test('keeps the results when the plan changes', async () => {
    await planDoc.set({ ...plan, teams: plan.teams.map((t) => (t.id === 't2' ? { ...t, name: 'Team Jones' } : t)) });
    const state = await waitFor('the renamed team', async () => {
      const data = (await stateDoc.get()).data();
      return data?.games.g2.team1?.name === 'Team Jones' && data;
    });
    assert.equal(state.games.g1.status, 'final');
  });

  test('leaves games played for no bonspiel alone', async () => {
    const before = (await stateDoc.get()).get('updatedAt');
    const { bonspiel: _bonspiel, ...open } = playedGame(Timestamp.now(), 3, 3);
    await db.collection(`${club}/sheets/s1/games`).add(open);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    assert.equal((await stateDoc.get()).get('updatedAt').toMillis(), before.toMillis());
  });

  test('is removed with the bonspiel', async () => {
    await planDoc.delete();
    await waitFor('the state to go', async () => !(await stateDoc.get()).exists);
  });
});

describe('what the bonspiel screen shows', () => {
  const plan = {
    teams: [{ id: 't1', name: 'Smith' }, { id: 't2', name: 'Jones' }, { id: 't3', name: 'Brown' }, { id: 't4', name: 'Lee' }],
    events: [{ id: 'a', name: 'A Event' }, { id: 'b', name: 'B Event' }],
    draws: [
      { id: 'd2', label: 'Draw 2', start: '2026-11-07T09:00' },
      { id: 'd1', label: 'Draw 1', start: '2026-11-06T19:00' },
    ],
    games: [
      { id: 'a1', label: 'A1', drawId: 'd1', sheetId: 's1', eventId: 'a', team1: { teamId: 't1' }, team2: { teamId: 't2' } },
      { id: 'a2', label: 'A2', drawId: 'd1', sheetId: 's2', eventId: 'a', team1: { teamId: 't3' }, team2: { teamId: 't4' } },
      {
        id: 'a3', label: 'A Final', drawId: 'd2', sheetId: 's1', eventId: 'a',
        team1: { from: 'a1', result: 'winner' }, team2: { from: 'a2', result: 'winner' },
      },
      {
        id: 'b1', label: 'B1', drawId: 'd2', sheetId: 's2', eventId: 'b',
        team1: { from: 'a1', result: 'loser' }, team2: null,
      },
    ],
  };
  const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

  test('moves to the next draw half an hour before it starts', () => {
    assert.equal(currentDraw(plan, at(2026, 11, 6, 12)).id, 'd1');
    assert.equal(currentDraw(plan, at(2026, 11, 7, 8, 29)).id, 'd1');
    assert.equal(currentDraw(plan, at(2026, 11, 7, 8, 30)).id, 'd2');
    assert.equal(nextDraw(plan, currentDraw(plan, at(2026, 11, 6, 20))).id, 'd2');
    assert.equal(nextDraw(plan, plan.draws[0]), null);
  });

  test('names each side as far as it is known', () => {
    const state = { games: { a3: { status: 'ready', team1: { teamId: 't2', name: 'Jones' }, team2: null } } };
    const [a3, b1] = [plan.games[2], plan.games[3]];
    assert.deepEqual(sideOf(plan, state, plan.games[0], 'team1'), { name: 'Smith', known: true });
    assert.deepEqual(sideOf(plan, state, a3, 'team1'), { name: 'Jones', known: true });
    assert.deepEqual(sideOf(plan, state, a3, 'team2'), { name: 'Winner of A2', known: false });
    assert.deepEqual(sideOf(plan, state, b1, 'team1'), { name: 'Loser of A1', known: false });
    assert.deepEqual(sideOf(plan, state, b1, 'team2'), { name: 'To be decided', known: false });
  });

  test('gives a result only once a game has one', () => {
    const state = { games: { a1: { status: 'final', team1Score: 6, team2Score: 3, winner: 'team1' }, a2: { status: 'ready' } } };
    assert.deepEqual(resultOf(state, plan.games[0]), { team1Score: 6, team2Score: 3, winner: 'team1', tied: false });
    assert.equal(resultOf(state, plan.games[1]), null);
  });

  test('names a place in a pool, and tells a pool from a knockout', () => {
    const pooled = {
      ...plan,
      games: [
        ...plan.games,
        { id: 'p1', eventId: 'pool', team1: { teamId: 't1' }, team2: { teamId: 't3' } },
        { id: 'p2', eventId: 'pool', team1: { teamId: 't2' }, team2: { teamId: 't4' } },
        { id: 'x', eventId: 'b', team1: { rank: 1, eventId: 'pool' }, team2: null },
      ],
      events: [...plan.events, { id: 'pool', name: 'Pool A' }],
    };
    assert.deepEqual(sideOf(pooled, null, pooled.games[6], 'team1'), { name: 'Pool A #1', known: false });
    assert.equal(isPool(pooled, 'pool'), true);
    assert.equal(isPool(pooled, 'a'), false);
  });

  test('lays an event out as a bracket, as the portal does', () => {
    assert.deepEqual(bracketRounds(plan, 'a').map((r) => r.map((g) => g.label)), [['A1', 'A2'], ['A Final']]);
    assert.deepEqual(bracketRounds(plan, 'b').map((r) => r.map((g) => g.label)), [['B1']]);
  });
});

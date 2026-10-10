// Exercises the Cloud Functions in ../functions against the Firestore, Auth
// and Functions emulators. Run with `npm run test:functions`, which builds the
// functions first and starts the emulators around this file.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword,
} from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

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
  return { auth, call: (name, data) => httpsCallable(functions, name)(data) };
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
      updatedAt: updatedAt.toDate().toISOString(), currentEnd: 1, league: null, ...teams,
    });
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

    for (const club of ['hook-all', 'hook-league', 'hook-off', 'hook-failing']) {
      await db.doc(`clubs/${club}`).set({ name: `Club ${club}` });
      await db.doc(`clubs/${club}/sheets/s1`).set({ name: 'Sheet 1' });
    }
    await db.doc('clubs/hook-all/private/webhook').set({ url: `${hookUrl}/all`, games: 'all' });
    await db.doc('clubs/hook-league/private/webhook').set({ url: `${hookUrl}/league`, games: 'league' });
    await db.doc('clubs/hook-failing/private/webhook').set({ url: `${hookUrl}/failing`, games: 'all' });
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

  // The trigger runs some time after the write, so wait for what it does.
  async function waitFor(what, check) {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const postsTo = (path) => received.filter((r) => r.path === path);

  test('posts a completed game with a message Slack and Discord both read', async () => {
    await db.doc('clubs/hook-all/sheets/s1/games/open-1').set(openGame);

    const [post] = await waitFor('the post', () => postsTo('/all').length && postsTo('/all'));
    assert.equal(post.body.text, 'Sheet 1: Red 7, Yellow 4');
    assert.equal(post.body.content, post.body.text);
    assert.equal(post.body.event, 'game.completed');
    assert.deepEqual(post.body.club, { id: 'hook-all', name: 'Club hook-all' });
    assert.deepEqual(post.body.sheet, { id: 's1', name: 'Sheet 1' });
    assert.deepEqual(Object.keys(post.body.game).sort(),
      ['ends', 'finishedAt', 'id', 'league', 'numberOfEnds', 'startedAt', 'team1', 'team2']);
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

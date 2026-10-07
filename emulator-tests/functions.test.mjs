// Exercises the Cloud Functions in ../functions against the Firestore, Auth
// and Functions emulators. Run with `npm run test:functions`, which builds the
// functions first and starts the emulators around this file.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
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

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code);
    return true;
  });
}

before(async () => {
  await db.doc('clubs/club-a').set({ name: 'Club A' });
  await db.doc('clubs/club-a/private/apiKey').set({ key: 'key-a' });
  await db.doc('clubs/club-a/sheets/sheet-open').set({ name: 'Sheet Open', pairingCode: 'ABC234' });
  await db.doc('clubs/club-a/sheets/sheet-other').set({ name: 'Sheet Other' });
  // A club still in the pre-migration shape, with the key on the club doc.
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

    const second = await anonymous();
    await rejectsWith(second.call('pairSheet', { pairingCode: 'ABC234' }), 'functions/not-found');
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

  test('returns 404 for an unknown club', async () => {
    const res = await fetch(`${API_URL}/clubs/missing`, { headers: { 'x-api-key': 'key-a' } });
    assert.equal(res.status, 404);
  });

  test('ignores a key left on the club document', async () => {
    const res = await fetch(`${API_URL}/clubs/legacy`, { headers: { 'x-api-key': 'legacy-key' } });
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
  };

  test('is limited to super admins', async () => {
    const clubAdmin = await userWithClaims('admin@club-a.example', { role: 'clubadmin', clubId: 'club-a' });
    await rejectsWith(clubAdmin.call('provisionClub', request), 'functions/permission-denied');
  });

  test('creates the club, its private API key and its first admin', async () => {
    const superAdmin = await userWithClaims('super@example.com', { role: 'superadmin', clubId: null });
    const result = await superAdmin.call('provisionClub', request);
    assert.equal(result.data.clubId, 'new-club');

    assert.deepEqual((await db.doc('clubs/new-club').get()).data(), { name: 'New Club' });
    const key = (await db.doc('clubs/new-club/private/apiKey').get()).get('key');
    assert.match(key, /^[0-9a-f]{32}$/);

    const admin = await adminAuth.getUserByEmail(request.adminEmail);
    assert.deepEqual(admin.customClaims, { role: 'clubadmin', clubId: 'new-club' });
    assert.ok((await db.doc(`clubs/new-club/admins/${admin.uid}`).get()).exists);
  });
});

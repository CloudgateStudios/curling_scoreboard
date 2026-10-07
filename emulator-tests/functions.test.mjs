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

  test('reports a taken email as already-exists and rolls back the club', async () => {
    await adminAuth.createUser({ email: 'taken@provision.example', password: 'password123' });
    const caller = await superAdmin('super-taken@example.com');
    await rejectsWith(caller.call('provisionClub', {
      clubName: 'Taken Club',
      clubId: 'taken-club',
      adminEmail: 'taken@provision.example',
      adminPassword: 'password123',
    }), 'functions/already-exists');

    assert.equal((await db.doc('clubs/taken-club').get()).exists, false);
    assert.equal((await db.doc('clubs/taken-club/private/apiKey').get()).exists, false);
  });

  test('reports a malformed email as invalid-argument and rolls back the club', async () => {
    const caller = await superAdmin('super-bad-email@example.com');
    await rejectsWith(caller.call('provisionClub', {
      clubName: 'Bad Email Club',
      clubId: 'bad-email-club',
      adminEmail: 'not-an-email',
      adminPassword: 'password123',
    }), 'functions/invalid-argument');

    assert.equal((await db.doc('clubs/bad-email-club').get()).exists, false);
    assert.equal((await db.doc('clubs/bad-email-club/private/apiKey').get()).exists, false);
  });

  test('rejects a short password before creating anything', async () => {
    const caller = await superAdmin('super-short-pw@example.com');
    await rejectsWith(caller.call('provisionClub', {
      clubName: 'Short Password Club',
      clubId: 'short-pw-club',
      adminEmail: 'admin@short-pw.example',
      adminPassword: 'short',
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
    }), 'functions/invalid-argument');

    await rejectsWith(adminAuth.getUserByEmail('admin@bad-id.example'), 'auth/user-not-found');
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

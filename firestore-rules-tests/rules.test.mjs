import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, collectionGroup, query, where, getDocs,
  deleteField, collection, addDoc,
} from 'firebase/firestore';
import fs from 'fs';

const rules = fs.readFileSync(process.argv[2] ?? new URL('../firestore.rules', import.meta.url), 'utf8');

const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});

// Seed data with rules disabled.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'clubs/club-a'), { name: 'Club A' });
  await setDoc(doc(db, 'clubs/club-a/private/apiKey'), { key: 'secret-a' });
  await setDoc(doc(db, 'clubs/club-a/sheets/sheet-open'), {
    name: 'Sheet Open', pairingCode: 'ABC123',
  });
  await setDoc(doc(db, 'clubs/club-a/sheets/sheet-open-2'), {
    name: 'Sheet Open 2', pairingCode: 'DEF456',
  });
  await setDoc(doc(db, 'clubs/club-a/sheets/sheet-paired'), {
    name: 'Sheet Paired', scoreboardUid: 'scoreboard-1',
  });
  await setDoc(doc(db, 'appConfig/scoreboard'), { buildId: 'abc123' });
  await setDoc(doc(db, 'clubs/club-b'), { name: 'Club B' });
  await setDoc(doc(db, 'clubs/club-b/private/apiKey'), { key: 'secret-b' });
  await setDoc(doc(db, 'clubs/club-b/sheets/sheet-secret'), {
    name: 'Sheet Secret', scoreboardUid: 'other-device',
  });
});

const unauthed = env.unauthenticatedContext().firestore();
const anon = env.authenticatedContext('attacker').firestore();
const board = env.authenticatedContext('scoreboard-1').firestore();
const adminA = env.authenticatedContext('admin-a', { role: 'clubadmin', clubId: 'club-a' }).firestore();

const results = [];
async function check(name, expect, fn) {
  try {
    await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    results.push(['PASS', name, expect]);
  } catch (e) {
    results.push(['FAIL', name, expect, String(e).split('\n')[0].slice(0, 110)]);
  }
}

// --- pairing happens in the pairSheet function, so clients cannot see codes ---
await check('attack: unfiltered collectionGroup over all sheets', 'deny', () =>
  getDocs(query(collectionGroup(anon, 'sheets'))));

await check('attack: collectionGroup query for a known pairing code', 'deny', () =>
  getDocs(query(collectionGroup(anon, 'sheets'), where('pairingCode', '==', 'ABC123'))));

// Rules are not filters, but a query whose filter matches the old read rule
// passed it and listed every unpaired sheet along with its code.
await check('attack: list every sheet that has a pairing code', 'deny', () =>
  getDocs(query(collectionGroup(anon, 'sheets'), where('pairingCode', '!=', null))));

await check('attack: claim an open sheet directly as self', 'deny', () =>
  updateDoc(doc(anon, 'clubs/club-a/sheets/sheet-open'),
    { scoreboardUid: 'attacker', pairingCode: deleteField() }));

// --- club documents and API keys ---
await check('attack: read a club doc', 'deny', () =>
  getDoc(doc(anon, 'clubs/club-b')));

await check('attack: list every club', 'deny', () =>
  getDocs(collection(anon, 'clubs')));

await check('attack: read a club API key', 'deny', () =>
  getDoc(doc(anon, 'clubs/club-b/private/apiKey')));

await check('attack: club admin reads another club API key', 'deny', () =>
  getDoc(doc(adminA, 'clubs/club-b/private/apiKey')));

await check('attack: club admin replaces own API key', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/apiKey'), { key: 'chosen' }));

await check('club admin: read own club', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a')));

await check('club admin: read own API key', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a/private/apiKey')));

// --- sheets ---
await check('attack: read another club paired sheet directly', 'deny', () =>
  getDoc(doc(anon, 'clubs/club-b/sheets/sheet-secret')));

// Uses a still-unclaimed sheet so the pairingCode precondition is satisfied
// and the uid check is what actually decides the outcome.
await check('attack: claim an open sheet as somebody else', 'deny', () =>
  updateDoc(doc(anon, 'clubs/club-a/sheets/sheet-open-2'),
    { scoreboardUid: 'victim', pairingCode: deleteField() }));

await check('attack: hijack a paired sheet to another device', 'deny', () =>
  updateDoc(doc(anon, 'clubs/club-a/sheets/sheet-paired'),
    { scoreboardUid: 'attacker' }));

// --- the paired scoreboard keeps working ---
await check('scoreboard: push liveGame', 'allow', () =>
  updateDoc(doc(board, 'clubs/club-a/sheets/sheet-paired'),
    { liveGame: { currentEnd: 3 } }));

await check('scoreboard: save a completed game', 'allow', () =>
  addDoc(collection(board, 'clubs/club-a/sheets/sheet-paired/games'), { numberOfEnds: 8 }));

await check('scoreboard: disconnect by clearing its uid', 'allow', () =>
  updateDoc(doc(board, 'clubs/club-a/sheets/sheet-paired'),
    { scoreboardUid: deleteField() }));

// --- deployment info for remote refresh ---
await check('app config: unpaired scoreboard reads the deployed build', 'allow', () =>
  getDoc(doc(unauthed, 'appConfig/scoreboard')));

await check('attack: unauthenticated write to app config', 'deny', () =>
  setDoc(doc(unauthed, 'appConfig/scoreboard'), { buildId: 'evil' }));

await check('attack: signed in device writes app config', 'deny', () =>
  setDoc(doc(anon, 'appConfig/scoreboard'), { buildId: 'evil' }));

await env.cleanup();

let failed = 0;
for (const r of results) {
  if (r[0] === 'FAIL') failed++;
  console.log(`${r[0].padEnd(4)} [expect ${r[2]}] ${r[1]}${r[3] ? '  -- ' + r[3] : ''}`);
}
console.log(failed === 0 ? '\nALL RULES CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);

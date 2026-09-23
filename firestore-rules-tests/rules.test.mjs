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
  await setDoc(doc(db, 'clubs/club-a'), { name: 'Club A', apiKey: 'secret-a' });
  await setDoc(doc(db, 'clubs/club-a/sheets/sheet-open'), {
    name: 'Sheet Open', pairingCode: 'ABC123',
  });
  await setDoc(doc(db, 'clubs/club-a/sheets/sheet-open-2'), {
    name: 'Sheet Open 2', pairingCode: 'DEF456',
  });
  await setDoc(doc(db, 'clubs/club-a/sheets/sheet-paired'), {
    name: 'Sheet Paired', scoreboardUid: 'scoreboard-1',
  });
  await setDoc(doc(db, 'clubs/club-b'), { name: 'Club B', apiKey: 'secret-b' });
  await setDoc(doc(db, 'clubs/club-b/sheets/sheet-secret'), {
    name: 'Sheet Secret', scoreboardUid: 'other-device',
  });
});

const anon = env.authenticatedContext('attacker').firestore();
const board = env.authenticatedContext('scoreboard-1').firestore();
const pairing = env.authenticatedContext('new-device').firestore();

const results = [];
async function check(name, expect, fn) {
  try {
    await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    results.push(['PASS', name, expect]);
  } catch (e) {
    results.push(['FAIL', name, expect, String(e).split('\n')[0].slice(0, 110)]);
  }
}

// --- the pairing flow must keep working ---
await check('pairing: filtered collectionGroup query by code', 'allow', () =>
  getDocs(query(collectionGroup(pairing, 'sheets'), where('pairingCode', '==', 'ABC123'))));

await check('pairing: claim the sheet as self', 'allow', () =>
  updateDoc(doc(pairing, 'clubs/club-a/sheets/sheet-open'),
    { scoreboardUid: 'new-device', pairingCode: deleteField() }));

await check('pairing: read club doc for the name', 'allow', () =>
  getDoc(doc(pairing, 'clubs/club-a')));

// --- the holes this PR closes ---
await check('attack: unfiltered collectionGroup over all sheets', 'deny', () =>
  getDocs(query(collectionGroup(anon, 'sheets'))));

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

await env.cleanup();

let failed = 0;
for (const r of results) {
  if (r[0] === 'FAIL') failed++;
  console.log(`${r[0].padEnd(4)} [expect ${r[2]}] ${r[1]}${r[3] ? '  -- ' + r[3] : ''}`);
}
console.log(failed === 0 ? '\nALL RULES CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);

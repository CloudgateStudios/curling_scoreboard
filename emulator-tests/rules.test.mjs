import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, collectionGroup, query, where, getDocs,
  deleteDoc, deleteField, collection, addDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import fs from 'fs';

const rules = fs.readFileSync(process.argv[2] ?? new URL('../firestore.rules', import.meta.url), 'utf8');

const env = await initializeTestEnvironment({
  projectId: 'demo-rules',
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
  await setDoc(doc(db, 'clubs/club-a/sheets/sheet-to-unpair'), {
    name: 'Sheet To Unpair', scoreboardUid: 'scoreboard-2', device: { appVersion: '0.0.49' },
  });
  await setDoc(doc(db, 'clubs/club-a/config/scoreboard'), {});
  await setDoc(doc(db, 'clubs/club-b/config/scoreboard'), {});
  await setDoc(doc(db, 'appConfig/scoreboard'), { buildId: 'abc123' });
  await setDoc(doc(db, 'clubs/club-b'), { name: 'Club B' });
  await setDoc(doc(db, 'clubs/club-b/private/apiKey'), { key: 'secret-b' });
  await setDoc(doc(db, 'clubs/club-a/private/displayState'), { sheets: {} });
  await setDoc(doc(db, 'clubs/club-b/private/displayState'), { sheets: {} });
  await setDoc(doc(db, 'clubs/club-a/displayLinks/link-1'), {
    label: 'Warm room', secretHash: 'ab', settings: { page: 'warm-room' },
  });
  await setDoc(doc(db, 'clubs/club-a/displayLinks/link-2'), {
    label: 'Stream', secretHash: 'cd', settings: { page: 'warm-room' },
  });
  await setDoc(doc(db, 'clubs/club-b/sheets/sheet-secret'), {
    name: 'Sheet Secret', scoreboardUid: 'other-device',
  });
});

const unauthed = env.unauthenticatedContext().firestore();
const anon = env.authenticatedContext('attacker').firestore();
const board = env.authenticatedContext('scoreboard-1').firestore();
// What pairSheet gives a scoreboard: claims naming the sheet it paired with.
const claimedBoard = env.authenticatedContext('scoreboard-1',
  { role: 'scoreboard', clubId: 'club-a', sheetId: 'sheet-paired' }).firestore();
// A device whose sheet has since been paired with scoreboard-1 instead.
const replacedBoard = env.authenticatedContext('old-device',
  { role: 'scoreboard', clubId: 'club-a', sheetId: 'sheet-paired' }).firestore();
const adminA = env.authenticatedContext('admin-a', { role: 'clubadmin', clubId: 'club-a' }).firestore();
const bonspielA = env.authenticatedContext('bonspiel-a', { role: 'bonspieladmin', clubId: 'club-a' }).firestore();

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

// --- the admin PIN a scoreboard asks for before it disconnects ---
await check('club admin: set the scoreboard PIN', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/scoreboardPin'), { pin: '4821' }));

await check('club admin: change the scoreboard PIN', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/scoreboardPin'), { pin: '93017264' }));

await check('club admin: read the scoreboard PIN', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a/private/scoreboardPin')));

await check('attack: club admin sets a PIN that is not 4 to 8 digits', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/scoreboardPin'), { pin: '12a4' }));

await check('attack: club admin sets a PIN too short to mean anything', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/scoreboardPin'), { pin: '123' }));

await check('attack: club admin stores other fields beside the PIN', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/scoreboardPin'), { pin: '4821', note: 'x' }));

await check('attack: club admin sets another club PIN', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-b/private/scoreboardPin'), { pin: '4821' }));

await check('attack: scoreboard reads its club PIN', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/private/scoreboardPin')));

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

await check('scoreboard: report its device status', 'allow', () =>
  updateDoc(doc(board, 'clubs/club-a/sheets/sheet-paired'),
    { device: { appVersion: '0.0.46', lastSeenAt: serverTimestamp() } }));

await check('attack: device status that is not a map', 'deny', () =>
  updateDoc(doc(board, 'clubs/club-a/sheets/sheet-paired'),
    { device: 'x'.repeat(1000) }));

await check('attack: oversized device status', 'deny', () =>
  updateDoc(doc(board, 'clubs/club-a/sheets/sheet-paired'),
    { device: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])) }));

await check('attack: scoreboard renames its sheet', 'deny', () =>
  updateDoc(doc(board, 'clubs/club-a/sheets/sheet-paired'), { name: 'Renamed' }));

await check('attack: another device reports status for a paired sheet', 'deny', () =>
  updateDoc(doc(anon, 'clubs/club-a/sheets/sheet-paired'),
    { device: { appVersion: 'evil' } }));

await check('scoreboard: save a completed game', 'allow', () =>
  addDoc(collection(board, 'clubs/club-a/sheets/sheet-paired/games'), { numberOfEnds: 8 }));

// The app finishes a game with a single batch.
await check('scoreboard: save a completed game and clear liveGame together', 'allow', () =>
  writeBatch(board)
    .set(doc(collection(board, 'clubs/club-a/sheets/sheet-paired/games')), { numberOfEnds: 8 })
    .update(doc(board, 'clubs/club-a/sheets/sheet-paired'), { liveGame: deleteField() })
    .commit());

// --- club settings for paired scoreboards ---
await check('scoreboard: read its club config', 'allow', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/config/scoreboard')));

await check('club admin: read their club config', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a/config/scoreboard')));

await check('attack: scoreboard reads another club config', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-b/config/scoreboard')));

await check('attack: scoreboard without claims reads its club config', 'deny', () =>
  getDoc(doc(board, 'clubs/club-a/config/scoreboard')));

await check('attack: replaced scoreboard reads club config with its old claims', 'deny', () =>
  getDoc(doc(replacedBoard, 'clubs/club-a/config/scoreboard')));

await check('attack: unpaired device reads a club config', 'deny', () =>
  getDoc(doc(anon, 'clubs/club-a/config/scoreboard')));

await check('attack: scoreboard writes its club config', 'deny', () =>
  setDoc(doc(claimedBoard, 'clubs/club-a/config/scoreboard'), { rockColors: {} }));

const blueGreen = {
  team1: { name: 'Blue', hex: '#2196F3' },
  team2: { name: 'Green', hex: '#4CAF50' },
};

await check('club admin: set their club rock colors', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/config/scoreboard'), { rockColors: blueGreen }));

await check('scoreboard: read the rock colors its club set', 'allow', async () => {
  const snap = await getDoc(doc(claimedBoard, 'clubs/club-a/config/scoreboard'));
  if (snap.get('rockColors.team1.name') !== 'Blue') throw new Error('rock colors not stored');
});

await check('club admin: go back to the default rock colors', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/config/scoreboard'), { rockColors: deleteField() }, { merge: true }));

await check('attack: club admin sets another club rock colors', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-b/config/scoreboard'), { rockColors: blueGreen }));

await check('attack: rock color that is not a hex color', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/config/scoreboard'),
    { rockColors: { ...blueGreen, team1: { name: 'Blue', hex: 'javascript:alert(1)' } } }));

await check('attack: rock color with an oversized name', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/config/scoreboard'),
    { rockColors: { ...blueGreen, team2: { name: 'G'.repeat(21), hex: '#4CAF50' } } }));

await check('attack: only one rock color', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/config/scoreboard'), { rockColors: { team1: blueGreen.team1 } }));

await check('attack: club admin stores other settings in the scoreboard config', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/config/scoreboard'), { rockColors: blueGreen, extra: true }));

await check('attack: club admin writes another config document', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/config/other'), { rockColors: blueGreen }));

// --- leagues ---
const league = {
  name: 'Monday Night',
  active: true,
  draws: [{ day: 1, start: '18:30', end: '20:30' }],
  teams: [{ id: 't1', name: 'Team Smith' }, { id: 't2', name: 'Team Jones', externalId: '1043' }],
};

await check('club admin: create a league', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/leagues/monday'), league));

await check('club admin: update a league with a season', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/leagues/monday'), { ...league, seasonStart: '2026-10-01' }));

await check('club admin: list their leagues', 'allow', () =>
  getDocs(collection(adminA, 'clubs/club-a/leagues')));

await check('scoreboard: read a league in its club', 'allow', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/leagues/monday')));

// What the scoreboard app runs to offer teams.
await check('scoreboard: list the active leagues in its club', 'allow', () =>
  getDocs(query(collection(claimedBoard, 'clubs/club-a/leagues'), where('active', '==', true))));

await check('attack: scoreboard lists another club leagues', 'deny', () =>
  getDocs(collection(claimedBoard, 'clubs/club-b/leagues')));

await check('attack: scoreboard without claims lists its club leagues', 'deny', () =>
  getDocs(collection(board, 'clubs/club-a/leagues')));

await check('attack: replaced scoreboard lists leagues with its old claims', 'deny', () =>
  getDocs(collection(replacedBoard, 'clubs/club-a/leagues')));

await check('attack: unpaired device reads a league', 'deny', () =>
  getDoc(doc(anon, 'clubs/club-a/leagues/monday')));

await check('attack: scoreboard changes a league', 'deny', () =>
  setDoc(doc(claimedBoard, 'clubs/club-a/leagues/monday'), { ...league, name: 'Renamed' }));

await check('attack: club admin creates a league in another club', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-b/leagues/monday'), league));

await check('attack: league with no name', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/leagues/bad'), { ...league, name: '' }));

await check('attack: league whose teams are not a list', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/leagues/bad'), { ...league, teams: 'everyone' }));

await check('attack: league with an unexpected field', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/leagues/bad'), { ...league, scoreboardUid: 'attacker' }));

await check('attack: league with far too many teams', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/leagues/bad'),
    { ...league, teams: Array.from({ length: 301 }, (_, i) => ({ id: `t${i}`, name: `Team ${i}` })) }));

await check('club admin: delete a league', 'allow', async () => {
  await setDoc(doc(adminA, 'clubs/club-a/leagues/temporary'), league);
  await deleteDoc(doc(adminA, 'clubs/club-a/leagues/temporary'));
});

await check('attack: scoreboard reads its club doc', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a')));

await check('attack: scoreboard reads its club API key', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/private/apiKey')));

// The claims do not get in the way of what a scoreboard already does.
await check('scoreboard: push liveGame with claims', 'allow', () =>
  updateDoc(doc(claimedBoard, 'clubs/club-a/sheets/sheet-paired'), { liveGame: { currentEnd: 1 } }));

// Disconnecting asks for the club's admin PIN, which the unpairSheet
// function checks, so the scoreboard cannot let go of the sheet by itself.
await check('attack: scoreboard disconnects itself without the PIN', 'deny', () =>
  updateDoc(doc(board, 'clubs/club-a/sheets/sheet-paired'),
    { scoreboardUid: deleteField() }));

await env.withSecurityRulesDisabled((ctx) =>
  updateDoc(doc(ctx.firestore(), 'clubs/club-a/sheets/sheet-paired'),
    { scoreboardUid: deleteField() }));

await check('attack: disconnected scoreboard reads club config with its old claims', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/config/scoreboard')));

// --- club admins rename and unpair sheets from the admin portal ---
const board2 = env.authenticatedContext('scoreboard-2').firestore();

await check('club admin: rename own sheet', 'allow', () =>
  updateDoc(doc(adminA, 'clubs/club-a/sheets/sheet-open'), { name: 'Sheet 1' }));

await check('attack: club admin unpairs another club sheet', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-b/sheets/sheet-secret'), { scoreboardUid: deleteField() }));

await check('club admin: unpair own sheet', 'allow', () =>
  updateDoc(doc(adminA, 'clubs/club-a/sheets/sheet-to-unpair'), {
    scoreboardUid: deleteField(), pairedAt: deleteField(), device: deleteField(), liveGame: deleteField(),
  }));

await check('attack: unpaired scoreboard keeps pushing its live game', 'deny', () =>
  updateDoc(doc(board2, 'clubs/club-a/sheets/sheet-to-unpair'), { liveGame: { currentEnd: 1 } }));

// --- completed game webhook ---
const webhook = { url: 'https://hooks.example.com/services/abc', games: 'league' };

await check('webhook: club admin sets their club\'s webhook', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), webhook));

await check('webhook: club admin reads their club\'s webhook', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a/private/webhook')));

await check('webhook: club admin reads the last delivery', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a/private/webhookStatus')));

await check('attack: club admin sets another club\'s webhook', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-b/private/webhook'), webhook));

await check('attack: webhook URL that is not https', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), { ...webhook, url: 'http://hooks.example.com/abc' }));

await check('attack: webhook with an unknown games setting', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), { ...webhook, games: 'some' }));

await check('attack: webhook with extra fields', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), { ...webhook, secret: 'x' }));

await check('attack: webhook without a games setting', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), { url: webhook.url }));

await check('webhook: club admin sets a message template and time zone', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), {
    ...webhook, template: '{result} on {date}', timeZone: 'America/Chicago',
  }));

await check('attack: webhook template that is too long', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), { ...webhook, template: 'x'.repeat(1001) }));

await check('attack: webhook template that is not text', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), { ...webhook, template: { text: 'x' } }));

await check('attack: webhook time zone that is not text', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhook'), { ...webhook, timeZone: -5 }));

await check('attack: club admin forges the last delivery', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/webhookStatus'), { ok: true }));

await check('attack: paired scoreboard reads the club webhook', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/private/webhook')));

await check('attack: paired scoreboard sets the club webhook', 'deny', () =>
  setDoc(doc(claimedBoard, 'clubs/club-a/private/webhook'), webhook));

await check('webhook: club admin turns their club\'s webhook off', 'allow', () =>
  deleteDoc(doc(adminA, 'clubs/club-a/private/webhook')));

// --- display pages and their links ---
// What startDisplaySession signs a club's display link in with.
const displayA = env.authenticatedContext('display:club-a:link-1',
  { role: 'display', clubId: 'club-a', linkId: 'link-1' }).firestore();

await check('display: reads its club\'s display summary', 'allow', () =>
  getDoc(doc(displayA, 'clubs/club-a/private/displayState')));

await check('club admin: reads the display summary', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a/private/displayState')));

await check('club admin: lists the club\'s display links', 'allow', () =>
  getDocs(collection(adminA, 'clubs/club-a/displayLinks')));

await check('attack: display reads another club\'s display summary', 'deny', () =>
  getDoc(doc(displayA, 'clubs/club-b/private/displayState')));

await check('attack: signed in device reads a display summary', 'deny', () =>
  getDoc(doc(anon, 'clubs/club-a/private/displayState')));

await check('attack: unauthenticated read of a display summary', 'deny', () =>
  getDoc(doc(unauthed, 'clubs/club-a/private/displayState')));

await check('attack: paired scoreboard reads the display summary', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/private/displayState')));

await check('attack: display writes the display summary', 'deny', () =>
  setDoc(doc(displayA, 'clubs/club-a/private/displayState'), { sheets: {} }));

await check('attack: club admin writes the display summary', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayState'), { sheets: {} }));

await check('attack: display reads its club\'s API key', 'deny', () =>
  getDoc(doc(displayA, 'clubs/club-a/private/apiKey')));

await check('attack: display reads its club document', 'deny', () =>
  getDoc(doc(displayA, 'clubs/club-a')));

await check('attack: display reads a sheet', 'deny', () =>
  getDoc(doc(displayA, 'clubs/club-a/sheets/sheet-paired')));

await check('attack: display reads its club\'s config', 'deny', () =>
  getDoc(doc(displayA, 'clubs/club-a/config/scoreboard')));

await check('attack: display lists the display links', 'deny', () =>
  getDocs(collection(displayA, 'clubs/club-a/displayLinks')));

await check('display: reads its own link\'s settings', 'allow', () =>
  getDoc(doc(displayA, 'clubs/club-a/displayLinks/link-1')));

await check('attack: display reads another link\'s settings', 'deny', () =>
  getDoc(doc(displayA, 'clubs/club-a/displayLinks/link-2')));

await check('attack: display changes what its link shows', 'deny', () =>
  updateDoc(doc(displayA, 'clubs/club-a/displayLinks/link-1'), { settings: { page: 'warm-room', view: 'full' } }));

await check('club admin: points a link at a sheet\'s score bug', 'allow', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), {
    label: 'YouTube stream',
    settings: { page: 'bug', sheetId: 'sheet-paired', scale: 1.5, label: 'league' },
  }));

await check('club admin: points a link at the warm room, cycling', 'allow', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), {
    settings: { page: 'warm-room', view: 'cycle', every: 30 },
  }));

await check('attack: club admin points a score bug at no sheet', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), { settings: { page: 'bug' } }));

await check('attack: club admin sets a page that does not exist', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), { settings: { page: 'admin' } }));

await check('attack: club admin sets options out of range', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), {
    settings: { page: 'warm-room', view: 'cycle', every: 1 },
  }));

await check('attack: club admin adds an unknown option', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), {
    settings: { page: 'warm-room', script: 'alert(1)' },
  }));

await check('attack: club admin changes a link\'s secret directly', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), { secretHash: 'chosen' }));

await check('attack: club admin changes a link\'s token directly', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-a/displayLinks/link-2'), { token: 'link-2.chosen' }));

await check('attack: club admin changes another club\'s link', 'deny', () =>
  updateDoc(doc(adminA, 'clubs/club-b/displayLinks/any'), { label: 'Mine' }));

await check('attack: club admin creates a display link directly', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/displayLinks/chosen'), { label: 'Mine', secretHash: 'ab' }));

await check('attack: club admin lists another club\'s display links', 'deny', () =>
  getDocs(collection(adminA, 'clubs/club-b/displayLinks')));

// --- the warm room screen's title and logo ---
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==';

await check('club admin: sets the warm room title and logo', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'), { title: 'Club A Curling', logo: LOGO }));

await check('display: reads its club\'s branding', 'allow', () =>
  getDoc(doc(displayA, 'clubs/club-a/private/displayBranding')));

await check('club admin: sets only a title', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'), { title: 'Club A' }));

await check('attack: club admin sets an SVG logo', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'),
    { logo: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==' }));

await check('attack: club admin sets a logo that is a remote URL', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'), { logo: 'https://example.com/logo.png' }));

await check('club admin: sets a logo just under the size limit', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'),
    { logo: `data:image/webp;base64,${'A'.repeat(249000)}` }));

await check('attack: club admin sets an oversized logo', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'),
    { logo: `data:image/png;base64,${'A'.repeat(250000)}` }));

await check('attack: club admin sets a title that is too long', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'), { title: 'x'.repeat(61) }));

await check('attack: club admin stores something else with the branding', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/private/displayBranding'), { title: 'Club A', extra: true }));

await check('attack: club admin sets another club\'s branding', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-b/private/displayBranding'), { title: 'Mine now' }));

await check('attack: display reads another club\'s branding', 'deny', () =>
  getDoc(doc(displayA, 'clubs/club-b/private/displayBranding')));

await check('attack: display changes its club\'s branding', 'deny', () =>
  setDoc(doc(displayA, 'clubs/club-a/private/displayBranding'), { title: 'Hacked' }));

await check('attack: paired scoreboard reads the branding', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/private/displayBranding')));

await check('club admin: removes the branding', 'allow', () =>
  deleteDoc(doc(adminA, 'clubs/club-a/private/displayBranding')));

// --- bonspiel admins see the sheets and their games, and change nothing ---
await check('bonspiel admin: read own club', 'allow', () =>
  getDoc(doc(bonspielA, 'clubs/club-a')));

await check('bonspiel admin: list own sheets', 'allow', () =>
  getDocs(collection(bonspielA, 'clubs/club-a/sheets')));

await check('bonspiel admin: read a sheet\'s games', 'allow', () =>
  getDocs(collection(bonspielA, 'clubs/club-a/sheets/sheet-paired/games')));

await check('attack: bonspiel admin reads another club\'s sheets', 'deny', () =>
  getDocs(collection(bonspielA, 'clubs/club-b/sheets')));

await check('attack: bonspiel admin renames a sheet', 'deny', () =>
  updateDoc(doc(bonspielA, 'clubs/club-a/sheets/sheet-open'), { name: 'Renamed' }));

await check('attack: bonspiel admin adds a sheet', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/sheets/sheet-new'), { name: 'New' }));

await check('attack: bonspiel admin sets a pairing code', 'deny', () =>
  updateDoc(doc(bonspielA, 'clubs/club-a/sheets/sheet-open'), { pairingCode: 'ZZZ999' }));

await check('attack: bonspiel admin renames the club', 'deny', () =>
  updateDoc(doc(bonspielA, 'clubs/club-a'), { name: 'Renamed' }));

await check('attack: bonspiel admin reads the API key', 'deny', () =>
  getDoc(doc(bonspielA, 'clubs/club-a/private/apiKey')));

await check('attack: bonspiel admin reads the club\'s users', 'deny', () =>
  getDocs(collection(bonspielA, 'clubs/club-a/admins')));

await check('attack: bonspiel admin reads the leagues', 'deny', () =>
  getDocs(collection(bonspielA, 'clubs/club-a/leagues')));

await check('attack: bonspiel admin reads the display links', 'deny', () =>
  getDocs(collection(bonspielA, 'clubs/club-a/displayLinks')));

// --- bonspiels, planned by club and bonspiel admins ---
const bonspiel = {
  name: 'Fall Spiel',
  active: true,
  startDate: '2026-11-06',
  endDate: '2026-11-08',
  numberOfEnds: 8,
  events: [{ id: 'a', name: 'A Event' }],
  teams: [{ id: 't1', name: 'Smith' }, { id: 't2', name: 'Jones' }],
  draws: [{ id: 'd1', label: 'Draw 1', start: '2026-11-06T19:00' }],
  games: [{
    id: 'g1', label: 'A1', drawId: 'd1', sheetId: 'sheet-paired', eventId: 'a',
    team1: { teamId: 't1' }, team2: { teamId: 't2' },
  }],
};

await check('bonspiel admin: create a bonspiel', 'allow', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/fall'), bonspiel));

await check('bonspiel admin: update a bonspiel with a result', 'allow', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/fall'), {
    ...bonspiel, games: [{ ...bonspiel.games[0], result: { winner: 'team1' } }],
  }));

await check('bonspiel admin: list the bonspiels', 'allow', () =>
  getDocs(collection(bonspielA, 'clubs/club-a/bonspiels')));

await check('club admin: create a bonspiel', 'allow', () =>
  setDoc(doc(adminA, 'clubs/club-a/bonspiels/spring'), bonspiel));

await check('club admin: read a bonspiel\'s state', 'allow', () =>
  getDoc(doc(adminA, 'clubs/club-a/bonspiels/fall/state/current')));

await check('bonspiel admin: read a bonspiel\'s state', 'allow', () =>
  getDoc(doc(bonspielA, 'clubs/club-a/bonspiels/fall/state/current')));

await check('attack: bonspiel admin writes a bonspiel\'s state', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/fall/state/current'), { games: {} }));

await check('attack: club admin writes a bonspiel\'s state', 'deny', () =>
  setDoc(doc(adminA, 'clubs/club-a/bonspiels/fall/state/current'), { games: {} }));

await check('attack: bonspiel admin creates a bonspiel in another club', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-b/bonspiels/fall'), bonspiel));

await check('attack: bonspiel admin reads another club\'s bonspiels', 'deny', () =>
  getDocs(collection(bonspielA, 'clubs/club-b/bonspiels')));

await check('attack: scoreboard reads a bonspiel', 'deny', () =>
  getDoc(doc(claimedBoard, 'clubs/club-a/bonspiels/fall')));

await check('attack: unpaired device reads a bonspiel', 'deny', () =>
  getDoc(doc(anon, 'clubs/club-a/bonspiels/fall')));

await check('attack: bonspiel with no name', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/bad'), { ...bonspiel, name: '' }));

await check('attack: bonspiel with a date that is not a date', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/bad'), { ...bonspiel, startDate: 'Friday' }));

await check('attack: bonspiel with no ends', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/bad'), { ...bonspiel, numberOfEnds: 0 }));

await check('attack: bonspiel with an unexpected field', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/bad'), { ...bonspiel, owner: 'attacker' }));

await check('attack: bonspiel missing its games', 'deny', () => {
  const { games: _games, ...withoutGames } = bonspiel;
  return setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/bad'), withoutGames);
});

await check('attack: bonspiel with far too many games', 'deny', () =>
  setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/bad'),
    { ...bonspiel, games: Array.from({ length: 301 }, (_, i) => ({ ...bonspiel.games[0], id: `g${i}` })) }));

await check('bonspiel admin: delete a bonspiel', 'allow', async () => {
  await setDoc(doc(bonspielA, 'clubs/club-a/bonspiels/temporary'), bonspiel);
  await deleteDoc(doc(bonspielA, 'clubs/club-a/bonspiels/temporary'));
});

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

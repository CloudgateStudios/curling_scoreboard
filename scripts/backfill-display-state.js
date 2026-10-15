#!/usr/bin/env node
/**
 * One-off backfill of each club's display summary, clubs/{clubId}/private/displayState.
 *
 * The syncDisplaySheet and syncDisplayLastGame functions keep the summary up
 * to date from the moment they are deployed, but only for sheets that change
 * after that. This writes every existing sheet's name, live game and last
 * completed game, so the displays list all of a club's sheets straight away.
 *
 * It builds the entries with the same code as the functions, from their
 * compiled output, so build the functions first:
 *
 *   (cd ../functions && npm install && npm run build)
 *
 * Other prerequisites match seed-dev.js (`npm install`, then application
 * default credentials or GOOGLE_APPLICATION_CREDENTIALS).
 *
 *   node backfill-display-state.js                                     # dev
 *   FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-display-state.js
 *
 * Safe to re-run: it writes each sheet as it is now, and leaves a last game
 * alone unless it finds one that finished later.
 */

const { initializeApp } = require('firebase-admin/app');
const { FieldPath, getFirestore } = require('firebase-admin/firestore');
const {
  displayFinishedGame, displaySheet, isNewerGame,
} = require('../functions/lib/display/state');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

async function backfillSheet(stateRef, sheet) {
  const [lastGameSnap] = (await sheet.ref.collection('games')
    .orderBy('finishedAt', 'desc').limit(1).get()).docs;
  const lastGame = lastGameSnap ? displayFinishedGame(lastGameSnap.id, lastGameSnap.data()) : null;

  // In a transaction, like the functions, so it cannot undo a newer write
  // they make while this runs.
  await db.runTransaction(async (tx) => {
    const [current, state] = await Promise.all([tx.get(sheet.ref), tx.get(stateRef)]);
    if (!current.exists) return;
    const entry = displaySheet(sheet.id, current.data());
    const fields = [new FieldPath('sheets', sheet.id, 'name'), new FieldPath('sheets', sheet.id, 'live')];
    const lastGamePath = new FieldPath('sheets', sheet.id, 'lastGame');
    if (lastGame && isNewerGame(lastGame, state.get(lastGamePath))) {
      entry.lastGame = lastGame;
      fields.push(lastGamePath);
    }
    tx.set(stateRef, { sheets: { [sheet.id]: entry } }, { mergeFields: fields });
  });
}

async function backfill() {
  console.log(`Backfilling display summaries in project: ${PROJECT_ID}\n`);

  const clubs = await db.collection('clubs').get();
  for (const club of clubs.docs) {
    const stateRef = club.ref.collection('private').doc('displayState');
    const sheets = await club.ref.collection('sheets').get();
    for (const sheet of sheets.docs) {
      await backfillSheet(stateRef, sheet);
    }
    console.log(`  ${club.id} (${club.get('name') ?? 'unnamed'}): ${sheets.size} sheet(s)`);
  }

  console.log('\nDone.');
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});

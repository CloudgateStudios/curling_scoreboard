#!/usr/bin/env node
/**
 * One-off backfill of each club's display summary, clubs/{clubId}/private/displayState.
 *
 * The syncDisplaySheet and syncDisplayResults functions keep the summary up
 * to date from the moment they are deployed, but only for sheets and games
 * that change after that. This writes every existing sheet's name and live
 * game, so the displays list all of a club's sheets straight away, and the
 * games finished in the last day, for final scores and the warm room's
 * earlier results. It also clears the lastGame each sheet's entry had before
 * final scores came from the results.
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
 * Safe to re-run: it writes each sheet as it is now, and adds each result
 * only once.
 */

const { initializeApp } = require('firebase-admin/app');
const { FieldPath, Timestamp, getFirestore } = require('firebase-admin/firestore');
const {
  RESULTS_KEPT_MS, displayFinishedGame, displayResult, displaySheet, leagueDraws, withResult,
} = require('../functions/lib/display/state');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

async function backfillSheet(stateRef, sheet) {
  // In a transaction, like the functions, so it cannot undo a newer write
  // they make while this runs.
  await db.runTransaction(async (tx) => {
    const current = await tx.get(sheet.ref);
    if (!current.exists) return;
    tx.set(stateRef, { sheets: { [sheet.id]: displaySheet(sheet.id, current.data()) } }, {
      mergeFields: [new FieldPath('sheets', sheet.id)],
    });
  });
}

// The sheet's games from the last day, as results, each with its league's
// draws as the function would find them.
async function recentResults(club, sheet) {
  const since = Timestamp.fromMillis(Date.now() - RESULTS_KEPT_MS);
  const games = await sheet.ref.collection('games').where('finishedAt', '>=', since).get();
  const results = [];
  for (const game of games.docs) {
    const finished = displayFinishedGame(game.id, game.data());
    if (!finished) continue;
    const leagueId = game.get('league.id');
    const league = typeof leagueId === 'string' && leagueId !== ''
      ? await club.ref.collection('leagues').doc(leagueId).get()
      : null;
    const name = typeof sheet.get('name') === 'string' ? sheet.get('name') : sheet.id;
    results.push(displayResult(sheet.id, name, finished, leagueDraws(league?.data())));
  }
  return results;
}

async function backfillResults(stateRef, results) {
  if (results.length === 0) return;
  await db.runTransaction(async (tx) => {
    const state = await tx.get(stateRef);
    const now = Date.now();
    const merged = results.reduce((list, result) => withResult(list, result, now), state.get('results'));
    tx.set(stateRef, { results: merged }, { mergeFields: ['results'] });
  });
}

async function backfill() {
  console.log(`Backfilling display summaries in project: ${PROJECT_ID}\n`);

  const clubs = await db.collection('clubs').get();
  for (const club of clubs.docs) {
    const stateRef = club.ref.collection('private').doc('displayState');
    const sheets = await club.ref.collection('sheets').get();
    const results = [];
    for (const sheet of sheets.docs) {
      await backfillSheet(stateRef, sheet);
      results.push(...await recentResults(club, sheet));
    }
    await backfillResults(stateRef, results);
    console.log(`  ${club.id} (${club.get('name') ?? 'unnamed'}): ${sheets.size} sheet(s), ${results.length} result(s)`);
  }

  console.log('\nDone.');
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});

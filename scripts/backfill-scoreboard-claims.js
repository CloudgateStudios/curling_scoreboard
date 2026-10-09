#!/usr/bin/env node
/**
 * One-off backfill that gives already paired scoreboards their custom claims.
 *
 * pairSheet now sets `role: 'scoreboard'`, `clubId` and `sheetId` on a
 * scoreboard's anonymous user, which lets it read its club's settings.
 * Scoreboards paired before that have no claims, and would otherwise need
 * pairing again. They pick the claims up by themselves within the hour, when
 * their ID token next refreshes.
 *
 * Prerequisites match seed-dev.js (`npm install`, then application default
 * credentials or GOOGLE_APPLICATION_CREDENTIALS).
 *
 *   node backfill-scoreboard-claims.js                                     # dev
 *   FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-scoreboard-claims.js
 *
 * Safe to re-run: scoreboards that already have the right claims are left
 * alone, and accounts with any other role are never touched.
 */

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();
const auth = getAuth();

async function backfill() {
  console.log(`Backfilling scoreboard claims in project: ${PROJECT_ID}\n`);

  const sheets = await db.collectionGroup('sheets').get();
  for (const sheet of sheets.docs) {
    const uid = sheet.get('scoreboardUid');
    if (!uid) continue;

    const clubId = sheet.ref.parent.parent.id;
    const label = `${clubId}/${sheet.id}`;

    let user;
    try {
      user = await auth.getUser(uid);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
      console.log(`  ${label}: scoreboard user no longer exists, skipped`);
      continue;
    }

    const claims = user.customClaims || {};
    if (claims.role !== undefined && claims.role !== 'scoreboard') {
      console.log(`  ${label}: paired user has role '${claims.role}', skipped`);
      continue;
    }
    if (claims.role === 'scoreboard' && claims.clubId === clubId && claims.sheetId === sheet.id) {
      console.log(`  ${label}: already has claims`);
      continue;
    }

    await auth.setCustomUserClaims(uid, { role: 'scoreboard', clubId, sheetId: sheet.id });
    console.log(`  ${label}: claims set`);
  }

  console.log('\nDone.');
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});

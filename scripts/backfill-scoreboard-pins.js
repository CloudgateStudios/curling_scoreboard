#!/usr/bin/env node
/**
 * One-off backfill that gives every club a scoreboard admin PIN.
 *
 * A scoreboard now asks for its club's admin PIN before it disconnects, and
 * a club without one cannot disconnect its scoreboards at all. New clubs get
 * a PIN when they are created; this gives the clubs created before that a
 * random four digit one. It prints each new PIN so it can be passed on to
 * the club, whose admins can see and change it in the admin portal.
 *
 * Prerequisites match seed-dev.js (`npm install`, then application default
 * credentials or GOOGLE_APPLICATION_CREDENTIALS).
 *
 *   node backfill-scoreboard-pins.js                                     # dev
 *   FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-scoreboard-pins.js
 *
 * Safe to re-run: a club that already has a PIN keeps it.
 */

const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

function generatePin() {
  return crypto.randomInt(0, 10000).toString().padStart(4, '0');
}

async function backfill() {
  console.log(`Backfilling scoreboard admin PINs in project: ${PROJECT_ID}\n`);

  const clubs = await db.collection('clubs').get();
  for (const club of clubs.docs) {
    const pinRef = club.ref.collection('private').doc('scoreboardPin');
    const label = `${club.id} (${club.get('name') ?? 'unnamed'})`;

    // Created only if missing, so a PIN a club admin sets while this runs
    // is never overwritten.
    const pin = generatePin();
    try {
      await pinRef.create({ pin });
    } catch (err) {
      if (err.code !== 6) throw err; // 6 is ALREADY_EXISTS
      console.log(`  ${label}: already has a PIN`);
      continue;
    }
    console.log(`  ${label}: PIN set to ${pin}`);
  }

  console.log('\nDone.');
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * One-off migration that moves club API keys off the club document.
 *
 * Club documents used to hold `apiKey` directly, and any signed in client
 * could read them. Keys now live at clubs/{clubId}/private/apiKey, which only
 * the club's admins can read. The old keys must be treated as leaked, so this
 * issues every club a fresh key rather than copying the old one, and removes
 * the old `apiKey` field.
 *
 * Prerequisites match seed-dev.js (`npm install`, then application default
 * credentials or GOOGLE_APPLICATION_CREDENTIALS).
 *
 *   node migrate-api-keys.js                                     # dev
 *   FIREBASE_PROJECT_ID=curling-scoreboard-prod node migrate-api-keys.js
 *
 * Safe to re-run: clubs with no legacy `apiKey` field and an existing key in
 * the new location are left alone.
 */

const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

async function migrate() {
  console.log(`Migrating API keys in project: ${PROJECT_ID}\n`);

  const clubs = await db.collection('clubs').get();
  for (const club of clubs.docs) {
    const keyRef = club.ref.collection('private').doc('apiKey');
    const keySnap = await keyRef.get();
    const hasLegacyKey = club.get('apiKey') !== undefined;

    if (!hasLegacyKey && keySnap.exists) {
      console.log(`  ${club.id}: already migrated`);
      continue;
    }

    const batch = db.batch();
    batch.set(keyRef, { key: crypto.randomBytes(16).toString('hex') });
    batch.update(club.ref, { apiKey: FieldValue.delete() });
    await batch.commit();
    console.log(`  ${club.id}: issued a new key and removed the old one`);
  }

  console.log('\nDone.');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});

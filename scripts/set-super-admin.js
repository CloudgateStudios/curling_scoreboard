#!/usr/bin/env node
/**
 * Makes an existing Firebase Auth user a super admin.
 *
 * The setSuperAdminClaim callable can only be used by an existing super
 * admin, so the first one in a project has to be created here, with admin
 * credentials. The user must already exist (for example, created in the
 * Firebase console under Authentication) and has to sign out and back in to
 * the admin portal before the new role takes effect.
 *
 * Prerequisites match seed-dev.js (`npm install`, then application default
 * credentials or GOOGLE_APPLICATION_CREDENTIALS).
 *
 *   node set-super-admin.js someone@example.com                         # dev
 *   FIREBASE_PROJECT_ID=curling-scoreboard-prod node set-super-admin.js someone@example.com
 */

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'curling-scoreboard-dev';
const email = process.argv[2];

if (!email) {
  console.error('Usage: node set-super-admin.js <email>');
  process.exit(1);
}

initializeApp({ projectId: PROJECT_ID });

async function main() {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  // Matches setSuperAdminClaim in functions/src/admin.ts.
  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims ?? {}),
    role: 'superadmin',
    clubId: null,
  });
  console.log(`${email} (${user.uid}) is now a super admin in ${PROJECT_ID}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import crypto from 'crypto';

function requireSuperAdmin(auth: { token: admin.auth.DecodedIdToken } | undefined) {
  if (!auth || auth.token['role'] !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Super admin access required.');
  }
}

// Creates a club document and an initial admin user with a clubId claim.
export const provisionClub = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubName, adminEmail, adminPassword } = request.data as {
    clubName: string;
    adminEmail: string;
    adminPassword: string;
  };

  if (!clubName || !adminEmail || !adminPassword) {
    throw new HttpsError('invalid-argument', 'clubName, adminEmail and adminPassword are required.');
  }

  const apiKey = crypto.randomBytes(16).toString('hex');

  // Create club document with auto-generated ID
  const clubRef = await admin.firestore().collection('clubs').add({
    name: clubName,
    apiKey,
  });

  // Create the Firebase Auth user
  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: `${clubName} Admin`,
    });
  } catch (err) {
    // Roll back the club doc if user creation fails
    await clubRef.delete();
    throw new HttpsError('already-exists', `Could not create user: ${(err as Error).message}`);
  }

  // Assign the clubId custom claim
  await admin.auth().setCustomUserClaims(userRecord.uid, {
    role: 'clubadmin',
    clubId: clubRef.id,
  });

  await clubRef.collection('admins').doc(userRecord.uid).set({
    email: adminEmail,
    displayName: userRecord.displayName ?? null,
  });

  return { clubId: clubRef.id, uid: userRecord.uid };
});

// Adds a new admin user to an existing club.
export const addClubAdmin = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubId, adminEmail, adminPassword } = request.data as {
    clubId: string;
    adminEmail: string;
    adminPassword: string;
  };

  if (!clubId || !adminEmail || !adminPassword) {
    throw new HttpsError('invalid-argument', 'clubId, adminEmail and adminPassword are required.');
  }

  const clubSnap = await admin.firestore().collection('clubs').doc(clubId).get();
  if (!clubSnap.exists) {
    throw new HttpsError('not-found', 'Club not found.');
  }

  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: `${(clubSnap.data() as { name: string }).name} Admin`,
    });
  } catch (err) {
    throw new HttpsError('already-exists', `Could not create user: ${(err as Error).message}`);
  }

  await admin.auth().setCustomUserClaims(userRecord.uid, {
    role: 'clubadmin',
    clubId,
  });

  await admin.firestore()
    .collection('clubs').doc(clubId)
    .collection('admins').doc(userRecord.uid)
    .set({ email: adminEmail, displayName: userRecord.displayName ?? null });

  return { uid: userRecord.uid };
});

// Sets a user as super admin. Call this once manually via Firebase SDK or Console
// to bootstrap the first super admin account.
export const setSuperAdminClaim = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { uid } = request.data as { uid: string };
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');

  const user = await admin.auth().getUser(uid);
  const existing = (user.customClaims ?? {}) as Record<string, unknown>;
  await admin.auth().setCustomUserClaims(uid, { ...existing, role: 'superadmin', clubId: null });

  return { success: true };
});

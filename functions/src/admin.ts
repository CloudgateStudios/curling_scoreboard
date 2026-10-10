import { getFirestore, DocumentReference } from 'firebase-admin/firestore';
import { getAuth, DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { apiKeyRef, generateApiKey } from './apiKeys';
import { clearScoreboardClaims } from './pairing';

function requireSuperAdmin(auth: { token: DecodedIdToken } | undefined) {
  if (!auth || auth.token['role'] !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Super admin access required.');
  }
}

// Matches the minLength on the admin portal's password fields.
const MIN_PASSWORD_LENGTH = 8;
// Matches the club ID pattern the admin portal accepts.
const CLUB_ID_PATTERN = /^[a-z0-9-]+$/;

function requireNonEmptyStrings(fields: Record<string, unknown>) {
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new HttpsError('invalid-argument', `${name} is required.`);
    }
  }
}

function requireValidPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
}

// Turns a createUser failure into an error the admin portal can show as is.
// Unknown failures get a generic message so internals don't reach the client.
function createUserError(err: unknown): HttpsError {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case 'auth/email-already-exists':
      return new HttpsError('already-exists', 'An account with this email already exists.');
    case 'auth/invalid-email':
      return new HttpsError('invalid-argument', 'The email address is not valid.');
    case 'auth/invalid-password':
      return new HttpsError(
        'invalid-argument',
        `The password is not valid. It must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    default:
      console.error('Could not create admin user', err);
      return new HttpsError('internal', 'Could not create the admin account. Please try again.');
  }
}

// Creates a club document and an initial admin user with a clubId claim.
export const provisionClub = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubName, clubId, adminEmail, adminPassword } = (request.data ?? {}) as {
    clubName: string;
    clubId?: string;
    adminEmail: string;
    adminPassword: string;
  };

  requireNonEmptyStrings({ clubName, adminEmail, adminPassword });
  requireValidPassword(adminPassword);
  // An empty clubId means "generate one", so only check it when given.
  if (clubId !== undefined && clubId !== null && clubId !== '') {
    if (typeof clubId !== 'string' || !CLUB_ID_PATTERN.test(clubId)) {
      throw new HttpsError(
        'invalid-argument',
        'clubId may only contain lowercase letters, numbers and hyphens.',
      );
    }
  }

  let clubRef: DocumentReference;
  if (clubId) {
    clubRef = getFirestore().collection('clubs').doc(clubId);
    const existing = await clubRef.get();
    if (existing.exists) {
      throw new HttpsError('already-exists', `A club with id "${clubId}" already exists.`);
    }
    await clubRef.set({ name: clubName });
  } else {
    clubRef = await getFirestore().collection('clubs').add({ name: clubName });
  }

  await apiKeyRef(clubRef.id).set({ key: generateApiKey() });

  // Create the Firebase Auth user
  let userRecord: UserRecord;
  try {
    userRecord = await getAuth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: `${clubName} Admin`,
    });
  } catch (err) {
    // Roll back the club doc if user creation fails, whatever the reason
    await Promise.all([clubRef.delete(), apiKeyRef(clubRef.id).delete()]);
    throw createUserError(err);
  }

  // Assign the clubId custom claim
  await getAuth().setCustomUserClaims(userRecord.uid, {
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

  const { clubId, adminEmail, adminPassword } = (request.data ?? {}) as {
    clubId: string;
    adminEmail: string;
    adminPassword: string;
  };

  requireNonEmptyStrings({ clubId, adminEmail, adminPassword });
  requireValidPassword(adminPassword);

  const clubSnap = await getFirestore().collection('clubs').doc(clubId).get();
  if (!clubSnap.exists) {
    throw new HttpsError('not-found', 'Club not found.');
  }

  let userRecord: UserRecord;
  try {
    userRecord = await getAuth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: `${(clubSnap.data() as { name: string }).name} Admin`,
    });
  } catch (err) {
    throw createUserError(err);
  }

  await getAuth().setCustomUserClaims(userRecord.uid, {
    role: 'clubadmin',
    clubId,
  });

  await getFirestore()
    .collection('clubs').doc(clubId)
    .collection('admins').doc(userRecord.uid)
    .set({ email: adminEmail, displayName: userRecord.displayName ?? null });

  return { uid: userRecord.uid };
});

// Takes an admin off a club. Club admin accounts are made for one club by
// provisionClub or addClubAdmin, so the account itself is deleted too: that
// signs it out everywhere and frees the email to be added again. An account
// that is not this club's admin (say a super admin listed by hand) only
// loses the listing. A token issued before the delete still carries the
// club admin claim until it expires, which takes at most an hour.
export const removeClubAdmin = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubId, uid } = (request.data ?? {}) as { clubId: string; uid: string };
  requireNonEmptyStrings({ clubId, uid });

  const adminRef = getFirestore().collection('clubs').doc(clubId).collection('admins').doc(uid);
  if (!(await adminRef.get()).exists) {
    throw new HttpsError('not-found', 'That admin is not on this club.');
  }

  let user: UserRecord | null = null;
  try {
    user = await getAuth().getUser(uid);
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 'auth/user-not-found') throw err;
  }
  const claims = (user?.customClaims ?? {}) as Record<string, unknown>;
  if (user && claims['role'] === 'clubadmin' && claims['clubId'] === clubId) {
    await getAuth().deleteUser(uid);
  }

  await adminRef.delete();
  return { success: true };
});

// Deletes a sheet along with its game history, which a client cannot do
// itself because Firestore leaves subcollections behind. The scoreboard
// paired with it loses access straight away, as the rules look for the sheet.
export const deleteSheet = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubId, sheetId } = (request.data ?? {}) as { clubId: string; sheetId: string };
  requireNonEmptyStrings({ clubId, sheetId });

  const sheetRef = getFirestore().collection('clubs').doc(clubId).collection('sheets').doc(sheetId);
  const sheetSnap = await sheetRef.get();
  if (!sheetSnap.exists) {
    throw new HttpsError('not-found', 'Sheet not found.');
  }

  await getFirestore().recursiveDelete(sheetRef);

  const scoreboardUid = sheetSnap.get('scoreboardUid') as string | undefined;
  if (scoreboardUid) await clearScoreboardClaims(scoreboardUid);
  return { success: true };
});

// Promotes another user to super admin. Only an existing super admin can call
// this, so the first one has to be created with scripts/set-super-admin.js.
export const setSuperAdminClaim = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { uid } = request.data as { uid: string };
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');

  const user = await getAuth().getUser(uid);
  const existing = (user.customClaims ?? {}) as Record<string, unknown>;
  await getAuth().setCustomUserClaims(uid, { ...existing, role: 'superadmin', clubId: null });

  return { success: true };
});

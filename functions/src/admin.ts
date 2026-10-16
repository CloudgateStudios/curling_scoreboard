import { getFirestore, DocumentReference } from 'firebase-admin/firestore';
import { getAuth, DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { apiKeyRef, generateApiKey } from './apiKeys';
import { isValidScoreboardPin, scoreboardPinRef } from './scoreboardPin';
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

// The roles a club's portal users can have. Club admins manage the club;
// bonspiel admins only see its sheets and games, and its bonspiels.
const CLUB_USER_ROLES = ['clubadmin', 'bonspieladmin'] as const;
type ClubUserRole = (typeof CLUB_USER_ROLES)[number];

function isClubUserRole(role: unknown): role is ClubUserRole {
  return (CLUB_USER_ROLES as readonly unknown[]).includes(role);
}

// An absent role means club admin, which is all there was before roles.
function requireClubUserRole(role: unknown): ClubUserRole {
  if (role === undefined || role === null || role === '') return 'clubadmin';
  if (!isClubUserRole(role)) {
    throw new HttpsError('invalid-argument', 'role must be clubadmin or bonspieladmin.');
  }
  return role;
}

// The person's name, or undefined when none was given.
function optionalDisplayName(displayName: unknown): string | undefined {
  if (displayName === undefined || displayName === null) return undefined;
  if (typeof displayName !== 'string') {
    throw new HttpsError('invalid-argument', 'displayName must be a string.');
  }
  const trimmed = displayName.trim();
  if (trimmed.length > 80) {
    throw new HttpsError('invalid-argument', 'The name can be at most 80 characters.');
  }
  return trimmed || undefined;
}

// Whether an account was made for this club by provisionClub or
// addClubAdmin, and so is the club's to change or delete.
function isClubUser(user: UserRecord | null, clubId: string): user is UserRecord {
  const claims = (user?.customClaims ?? {}) as Record<string, unknown>;
  return user !== null && isClubUserRole(claims['role']) && claims['clubId'] === clubId;
}

// Turns a createUser or updateUser failure into an error the admin portal can
// show as is. Unknown failures get a generic message so internals don't reach
// the client.
function authUserError(err: unknown, failure = 'Could not create the admin account. Please try again.'): HttpsError {
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
      console.error('Could not create or update admin user', err);
      return new HttpsError('internal', failure);
  }
}

// Creates a club document and an initial admin user with a clubId claim.
export const provisionClub = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubName, clubId, adminName, adminEmail, adminPassword, scoreboardPin } = (request.data ?? {}) as {
    clubName: string;
    clubId?: string;
    adminName?: string;
    adminEmail: string;
    adminPassword: string;
    scoreboardPin: string;
  };

  requireNonEmptyStrings({ clubName, adminEmail, adminPassword });
  const displayName = optionalDisplayName(adminName);
  requireValidPassword(adminPassword);
  // Every club starts with the PIN its scoreboards ask for to disconnect, so
  // none of them is ever stuck paired.
  if (!isValidScoreboardPin(scoreboardPin)) {
    throw new HttpsError('invalid-argument', 'The scoreboard admin PIN must be 4 to 8 digits.');
  }
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

  await Promise.all([
    apiKeyRef(clubRef.id).set({ key: generateApiKey() }),
    scoreboardPinRef(clubRef.id).set({ pin: scoreboardPin }),
  ]);

  // Create the Firebase Auth user
  let userRecord: UserRecord;
  try {
    userRecord = await getAuth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: displayName ?? `${clubName} Admin`,
    });
  } catch (err) {
    // Roll back the club doc if user creation fails, whatever the reason
    await Promise.all([
      clubRef.delete(),
      apiKeyRef(clubRef.id).delete(),
      scoreboardPinRef(clubRef.id).delete(),
    ]);
    throw authUserError(err);
  }

  // Assign the clubId custom claim
  await getAuth().setCustomUserClaims(userRecord.uid, {
    role: 'clubadmin',
    clubId: clubRef.id,
  });

  await clubRef.collection('admins').doc(userRecord.uid).set({
    email: adminEmail,
    displayName: userRecord.displayName ?? null,
    role: 'clubadmin',
  });

  return { clubId: clubRef.id, uid: userRecord.uid };
});

// Adds a new portal user to an existing club: a club admin unless a
// bonspiel admin is asked for.
export const addClubAdmin = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubId, adminName, adminEmail, adminPassword, role: requestedRole } = (request.data ?? {}) as {
    clubId: string;
    adminName?: string;
    adminEmail: string;
    adminPassword: string;
    role?: string;
  };

  requireNonEmptyStrings({ clubId, adminEmail, adminPassword });
  requireValidPassword(adminPassword);
  const displayName = optionalDisplayName(adminName);
  const role = requireClubUserRole(requestedRole);

  const clubSnap = await getFirestore().collection('clubs').doc(clubId).get();
  if (!clubSnap.exists) {
    throw new HttpsError('not-found', 'Club not found.');
  }

  let userRecord: UserRecord;
  try {
    userRecord = await getAuth().createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: displayName ?? `${(clubSnap.data() as { name: string }).name} Admin`,
    });
  } catch (err) {
    throw authUserError(err);
  }

  await getAuth().setCustomUserClaims(userRecord.uid, { role, clubId });

  await getFirestore()
    .collection('clubs').doc(clubId)
    .collection('admins').doc(userRecord.uid)
    .set({ email: adminEmail, displayName: userRecord.displayName ?? null, role });

  return { uid: userRecord.uid };
});

// Changes a club user's name, email or role, and sets a new password when
// one is given. Only accounts made for this club can be changed, so a super
// admin listed on the club by hand is left alone. A change of role or
// password signs the user out of the portal, so they sign in again with what
// they may now do; a token issued before that keeps working with Firestore
// until it expires, which takes at most an hour.
export const updateClubAdmin = onCall(async (request) => {
  requireSuperAdmin(request.auth);

  const { clubId, uid, displayName: requestedName, email, password, role: requestedRole } =
    (request.data ?? {}) as {
      clubId: string;
      uid: string;
      displayName?: string;
      email: string;
      password?: string;
      role?: string;
    };

  requireNonEmptyStrings({ clubId, uid, email });
  const displayName = optionalDisplayName(requestedName);
  const role = requireClubUserRole(requestedRole);
  const newPassword = typeof password === 'string' && password !== '' ? password : undefined;
  if (newPassword !== undefined) requireValidPassword(newPassword);

  const adminRef = getFirestore().collection('clubs').doc(clubId).collection('admins').doc(uid);
  if (!(await adminRef.get()).exists) {
    throw new HttpsError('not-found', 'That user is not on this club.');
  }

  let user: UserRecord | null = null;
  try {
    user = await getAuth().getUser(uid);
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 'auth/user-not-found') throw err;
  }
  if (!isClubUser(user, clubId)) {
    throw new HttpsError('failed-precondition', 'That account was not made for this club, so it cannot be changed here.');
  }

  try {
    await getAuth().updateUser(uid, {
      email,
      displayName: displayName ?? null,
      ...(newPassword !== undefined && { password: newPassword }),
    });
  } catch (err) {
    throw authUserError(err, 'Could not update the account. Please try again.');
  }

  const roleChanged = user.customClaims?.['role'] !== role;
  if (roleChanged) {
    await getAuth().setCustomUserClaims(uid, { role, clubId });
  }
  if (roleChanged || newPassword !== undefined) {
    await getAuth().revokeRefreshTokens(uid);
  }

  await adminRef.set({ email, displayName: displayName ?? null, role });
  return { success: true };
});

// Takes a user off a club. Club user accounts are made for one club by
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
  if (isClubUser(user, clubId)) {
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

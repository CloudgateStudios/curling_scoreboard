import crypto from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { CollectionReference, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

// Display links let a club's score bug and warm room screen sign in without
// an account. A club admin creates one per screen in the admin portal and
// gets a token, shown once, that goes in the display page's URL. The page
// trades it with startDisplaySession for a Firebase sign-in whose claims let
// it read the club's display summary (see ./state.ts) and nothing else.
//
// Only a hash of each token's secret is stored, so the links listed in the
// portal cannot be turned back into working URLs.
//
// Each link also says what its screens show, in `settings`, which club admins
// change in the portal. A screen opened at the link's own URL,
// /display/{clubId}#k=<token>, follows them, so a screen can be pointed at
// another sheet or view without touching it.

/** A club can have this many links, which is plenty for its screens. */
const MAX_LINKS = 20;
const MAX_LABEL_LENGTH = 60;
/** lastUsedAt is only rewritten when it is older than this. */
const LAST_USED_INTERVAL_MS = 60 * 60 * 1000;

// Club IDs are slugs or Firestore auto IDs; anything else could not name a
// club, and a slash would reach into another collection.
const CLUB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
// '<link ID>.<secret>': the ID finds the link without a query, the secret
// is 128 random bits written as hex, like an API key.
const TOKEN_PATTERN = /^([A-Za-z0-9]{1,40})\.([0-9a-f]{32})$/;

const INVALID_LINK = 'This display link is not valid. Ask a club admin for a new one.';

/** What a new link shows until an admin chooses otherwise. */
export const DEFAULT_SETTINGS = { page: 'warm-room' };

function linksRef(clubId: string): CollectionReference {
  return getFirestore().collection('clubs').doc(clubId).collection('displayLinks');
}

/** The Auth user a display link signs in as. */
export function displayUid(clubId: string, linkId: string): string {
  return `display:${clubId}:${linkId}`;
}

/** What the security rules check: a display may read its club's summary. */
export function displayClaims(clubId: string, linkId: string): Record<string, string> {
  return { role: 'display', clubId, linkId };
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

// Constant time, so how long a refusal takes says nothing about the secret.
function secretMatches(secret: string, expectedHash: unknown): boolean {
  if (typeof expectedHash !== 'string') return false;
  const a = Buffer.from(hashSecret(secret), 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireClubId(value: unknown): string {
  if (typeof value !== 'string' || !CLUB_ID_PATTERN.test(value)) {
    throw new HttpsError('invalid-argument', 'clubId is required.');
  }
  return value;
}

function requireLinkId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'linkId is required.');
  }
  return value;
}

function newSecret(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Deleting a link's user ends its refresh token, so a screen signed in with
// the old secret stops within the hour. One that never signed in has no user.
async function endSessions(clubId: string, linkId: string): Promise<void> {
  try {
    await getAuth().deleteUser(displayUid(clubId, linkId));
  } catch (err) {
    if ((err as { code?: unknown }).code !== 'auth/user-not-found') throw err;
  }
}

function requireClubAdmin(token: Record<string, unknown> | undefined, clubId: string) {
  const allowed = token?.['role'] === 'superadmin'
    || (token?.['role'] === 'clubadmin' && token['clubId'] === clubId);
  if (!allowed) {
    throw new HttpsError('permission-denied', 'Admin access to this club is required.');
  }
}

// Creates a link and returns its token. The token is not stored, so this is
// the only time anyone sees it.
export const createDisplayLink = onCall(async (request) => {
  const data = (request.data ?? {}) as { clubId?: unknown; label?: unknown };
  const clubId = requireClubId(data.clubId);
  requireClubAdmin(request.auth?.token, clubId);

  const label = typeof data.label === 'string' ? data.label.trim() : '';
  if (label === '' || label.length > MAX_LABEL_LENGTH) {
    throw new HttpsError('invalid-argument', `Give the link a name of up to ${MAX_LABEL_LENGTH} characters.`);
  }

  const db = getFirestore();
  const [club, count] = await Promise.all([
    db.collection('clubs').doc(clubId).get(),
    linksRef(clubId).count().get(),
  ]);
  if (!club.exists) {
    throw new HttpsError('not-found', 'Club not found.');
  }
  if (count.data().count >= MAX_LINKS) {
    throw new HttpsError('resource-exhausted', `A club can have up to ${MAX_LINKS} display links. Remove one first.`);
  }

  const secret = newSecret();
  const ref = linksRef(clubId).doc();
  await ref.set({
    label,
    secretHash: hashSecret(secret),
    settings: DEFAULT_SETTINGS,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { linkId: ref.id, token: `${ref.id}.${secret}` };
});

// Removes a link. No new sessions can start from it straight away; a screen
// already signed in with it stops within the hour, when its sign-in would
// next be renewed.
export const revokeDisplayLink = onCall(async (request) => {
  const data = (request.data ?? {}) as { clubId?: unknown; linkId?: unknown };
  const clubId = requireClubId(data.clubId);
  requireClubAdmin(request.auth?.token, clubId);
  const linkId = requireLinkId(data.linkId);

  await linksRef(clubId).doc(linkId).delete();
  await endSessions(clubId, linkId);
  return { success: true };
});

// Gives a link a new secret, and so a new URL, keeping its name and what it
// shows. For a URL that got out, or was lost before it was copied. Screens
// on the old URL stop within the hour, as for a removed link.
export const resetDisplayLink = onCall(async (request) => {
  const data = (request.data ?? {}) as { clubId?: unknown; linkId?: unknown };
  const clubId = requireClubId(data.clubId);
  requireClubAdmin(request.auth?.token, clubId);
  const linkId = requireLinkId(data.linkId);

  const secret = newSecret();
  try {
    await linksRef(clubId).doc(linkId).update({ secretHash: hashSecret(secret) });
  } catch (err) {
    // 5 is NOT_FOUND: the link was removed.
    if ((err as { code?: unknown }).code === 5) throw new HttpsError('not-found', 'Display link not found.');
    throw err;
  }
  await endSessions(clubId, linkId);
  return { linkId, token: `${linkId}.${secret}` };
});

// Called by a display page, which is not signed in, with the token from its
// URL. Returns a custom token for signInWithCustomToken.
export const startDisplaySession = onCall(async (request) => {
  const data = (request.data ?? {}) as { clubId?: unknown; token?: unknown };
  const clubId = requireClubId(data.clubId);
  const match = typeof data.token === 'string' ? TOKEN_PATTERN.exec(data.token) : null;
  if (!match) {
    throw new HttpsError('permission-denied', INVALID_LINK);
  }
  const [, linkId, secret] = match;

  const linkRef = linksRef(clubId).doc(linkId);
  const link = await linkRef.get();
  if (!link.exists || !secretMatches(secret, link.get('secretHash'))) {
    throw new HttpsError('permission-denied', INVALID_LINK);
  }

  // Shown in the portal so admins can tell which links are still in use.
  // Kept to once an hour, since a screen that reloads often would otherwise
  // write every time.
  const lastUsedAt = link.get('lastUsedAt') as Timestamp | undefined;
  if (!lastUsedAt || Date.now() - lastUsedAt.toMillis() > LAST_USED_INTERVAL_MS) {
    try {
      await linkRef.update({ lastUsedAt: FieldValue.serverTimestamp() });
    } catch (err) {
      console.warn(`Could not record use of display link ${linkRef.path}`, err);
    }
  }

  const token = await getAuth().createCustomToken(
    displayUid(clubId, linkId),
    displayClaims(clubId, linkId),
  );
  return { token };
});

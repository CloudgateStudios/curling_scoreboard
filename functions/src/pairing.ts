import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { scoreboardPinRef } from './scoreboardPin';

// Custom claims that tell the security rules which sheet a scoreboard says it
// is paired with. The rules still check the sheet's scoreboardUid, so a claim
// left behind by an old pairing grants nothing.
export function scoreboardClaims(clubId: string, sheetId: string): Record<string, string> {
  return { role: 'scoreboard', clubId, sheetId };
}

// Best effort: the claims are already useless once the sheet belongs to
// another device, and an anonymous user may well have been deleted since.
export async function clearScoreboardClaims(uid: string): Promise<void> {
  try {
    const auth = getAuth();
    const user = await auth.getUser(uid);
    if (user.customClaims?.['role'] === 'scoreboard') {
      await auth.setCustomUserClaims(uid, null);
    }
  } catch (err) {
    console.warn(`Could not clear scoreboard claims for ${uid}`, err);
  }
}

// Pairs the calling scoreboard with the sheet holding the given pairing code.
// Done server side so clients never need to query or read pairing codes,
// which would let them list every unpaired sheet and claim any of them.
export const pairSheet = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before pairing.');
  }
  const uid = request.auth.uid;

  // Pairing replaces the caller's custom claims, which would strip an admin
  // of their access. Scoreboards sign in anonymously and have no role.
  const role = request.auth.token['role'] as string | undefined;
  if (role !== undefined && role !== 'scoreboard') {
    throw new HttpsError('failed-precondition', 'Admin accounts cannot pair as a scoreboard.');
  }

  const raw = (request.data as { pairingCode?: unknown } | undefined)?.pairingCode;
  const pairingCode = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!pairingCode) {
    throw new HttpsError('invalid-argument', 'pairingCode is required.');
  }

  const db = getFirestore();
  const matches = await db
    .collectionGroup('sheets')
    .where('pairingCode', '==', pairingCode)
    .limit(1)
    .get();
  if (matches.empty) {
    throw new HttpsError('not-found', 'Pairing code not found.');
  }

  const sheetRef = matches.docs[0].ref;
  const clubRef = sheetRef.parent.parent!;

  // Set before the sheet is claimed so the scoreboard never ends up paired
  // without them. If claiming then fails they point at a sheet that is not
  // the caller's, which the rules do not honour.
  await getAuth().setCustomUserClaims(uid, scoreboardClaims(clubRef.id, sheetRef.id));

  const { previousUid, ...result } = await db.runTransaction(async (tx) => {
    const [sheetSnap, clubSnap] = await Promise.all([tx.get(sheetRef), tx.get(clubRef)]);

    // Another device may have used the code between the query and now.
    if (!sheetSnap.exists || sheetSnap.get('pairingCode') !== pairingCode) {
      throw new HttpsError('not-found', 'Pairing code not found.');
    }

    // The device status belongs to whichever scoreboard was paired before,
    // so it is dropped; the new one reports its own once it has paired.
    tx.update(sheetRef, {
      scoreboardUid: uid,
      pairedAt: FieldValue.serverTimestamp(),
      pairingCode: FieldValue.delete(),
      device: FieldValue.delete(),
    });

    return {
      previousUid: sheetSnap.get('scoreboardUid') as string | undefined,
      clubId: clubRef.id,
      sheetId: sheetRef.id,
      clubName: (clubSnap.get('name') as string | undefined) ?? '',
      sheetName: (sheetSnap.get('name') as string | undefined) ?? '',
    };
  });

  if (previousUid && previousUid !== uid) await clearScoreboardClaims(previousUid);
  return result;
});

// Disconnects the calling scoreboard from its sheet, once the club's admin
// PIN has been entered on it. The PIN is checked here so it never has to be
// sent to the scoreboards, and so the rules can stop a scoreboard letting go
// of its sheet by itself.
export const unpairSheet = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before disconnecting.');
  }
  const uid = request.auth.uid;

  const data = request.data as { clubId?: unknown; sheetId?: unknown; pin?: unknown } | undefined;
  const isId = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && !value.includes('/');
  const { clubId, sheetId } = data ?? {};
  if (!isId(clubId) || !isId(sheetId)) {
    throw new HttpsError('invalid-argument', 'clubId and sheetId are required.');
  }
  const pin = typeof data?.pin === 'string' ? data.pin.trim() : '';

  const db = getFirestore();
  const sheetRef = db.doc(`clubs/${clubId}/sheets/${sheetId}`);

  // A scoreboard whose sheet has gone, or been paired with another device,
  // has nothing left to protect. It may let go without the PIN, and this
  // tells nobody else anything about the club.
  const sheetSnap = await sheetRef.get();
  if (!sheetSnap.exists || sheetSnap.get('scoreboardUid') !== uid) {
    return { unpaired: false };
  }

  const expected = (await scoreboardPinRef(clubId).get()).get('pin') as string | undefined;
  if (!expected) {
    throw new HttpsError('failed-precondition', 'This club has no admin PIN set.');
  }
  if (pin !== expected) {
    throw new HttpsError('permission-denied', 'Incorrect admin PIN.');
  }

  // The sheet may have been paired with another device since it was read.
  const unpaired = await db.runTransaction(async (tx) => {
    const current = await tx.get(sheetRef);
    if (current.get('scoreboardUid') !== uid) return false;
    tx.update(sheetRef, { scoreboardUid: FieldValue.delete() });
    return true;
  });
  if (unpaired) await clearScoreboardClaims(uid);
  return { unpaired };
});

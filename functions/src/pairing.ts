import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

// Pairs the calling scoreboard with the sheet holding the given pairing code.
// Done server side so clients never need to query or read pairing codes,
// which would let them list every unpaired sheet and claim any of them.
export const pairSheet = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before pairing.');
  }
  const uid = request.auth.uid;

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

  return db.runTransaction(async (tx) => {
    const [sheetSnap, clubSnap] = await Promise.all([tx.get(sheetRef), tx.get(clubRef)]);

    // Another device may have used the code between the query and now.
    if (!sheetSnap.exists || sheetSnap.get('pairingCode') !== pairingCode) {
      throw new HttpsError('not-found', 'Pairing code not found.');
    }

    tx.update(sheetRef, {
      scoreboardUid: uid,
      pairingCode: FieldValue.delete(),
    });

    return {
      clubId: clubRef.id,
      sheetId: sheetRef.id,
      clubName: (clubSnap.get('name') as string | undefined) ?? '',
      sheetName: (sheetSnap.get('name') as string | undefined) ?? '',
    };
  });
});

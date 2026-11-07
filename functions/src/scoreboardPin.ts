import { DocumentReference, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { PIN_LOCKOUT } from './limits';

// The PIN that has to be entered on a scoreboard to disconnect it, one per
// club. Kept beside the API key, where only the club's admins can read it;
// scoreboards send what was typed to unpairSheet to be checked.
export function scoreboardPinRef(clubId: string): DocumentReference {
  return getFirestore()
    .collection('clubs')
    .doc(clubId)
    .collection('private')
    .doc('scoreboardPin');
}

// Matches the firestore.rules check on club admins setting the PIN.
export function isValidScoreboardPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^[0-9]{4,8}$/.test(pin);
}

// Wrong PINs typed on each of the club's scoreboards, by sheet:
// { [sheetId]: { wrong, lockedUntil? } }. Only the functions write it.
export function pinTriesRef(clubId: string): DocumentReference {
  return getFirestore().doc(`clubs/${clubId}/private/pinTries`);
}

interface PinTries {
  wrong?: number;
  lockedUntil?: Timestamp;
}

function lockedFor(tries: PinTries | undefined, now: number): number {
  const until = tries?.lockedUntil?.toMillis() ?? 0;
  return until > now ? until - now : 0;
}

function lockedError(ms: number): HttpsError {
  const minutes = Math.ceil(ms / 60_000);
  return new HttpsError(
    'resource-exhausted',
    `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    { retryAfter: Math.ceil(ms / 1000) },
  );
}

/** Stops with `resource-exhausted` while [sheetId] is locked out. */
export async function requireNotLockedOut(clubId: string, sheetId: string): Promise<void> {
  const tries = (await pinTriesRef(clubId).get()).get(sheetId) as PinTries | undefined;
  const ms = lockedFor(tries, Date.now());
  if (ms > 0) throw lockedError(ms);
}

/**
 * Counts a wrong PIN on [sheetId], locking it out once there have been
 * [PIN_LOCKOUT.tries] in a row. Returns the error to send: the lockout once
 * it starts, otherwise a wrong PIN, saying how many tries are left.
 */
export async function countWrongPin(clubId: string, sheetId: string): Promise<HttpsError> {
  const ref = pinTriesRef(clubId);
  return getFirestore().runTransaction(async (tx) => {
    const now = Date.now();
    const tries = (await tx.get(ref)).get(sheetId) as PinTries | undefined;
    // Another try may have started a lockout since the caller checked.
    const ms = lockedFor(tries, now);
    if (ms > 0) return lockedError(ms);
    // A lockout that has run out starts the count again.
    const wrong = (tries?.lockedUntil ? 0 : tries?.wrong ?? 0) + 1;
    // mergeFields replaces this sheet's entry whole, so an old lockedUntil
    // does not linger beside the new count.
    const write = (entry: PinTries) => tx.set(ref, { [sheetId]: entry }, { mergeFields: [sheetId] });
    if (wrong >= PIN_LOCKOUT.tries) {
      write({ wrong: 0, lockedUntil: Timestamp.fromMillis(now + PIN_LOCKOUT.lockedMs) });
      return lockedError(PIN_LOCKOUT.lockedMs);
    }
    write({ wrong });
    return new HttpsError('permission-denied', 'Incorrect admin PIN.', { triesLeft: PIN_LOCKOUT.tries - wrong });
  });
}

/** Forgets the wrong PINs on [sheetId], once the right one is typed. */
export async function clearWrongPins(clubId: string, sheetId: string): Promise<void> {
  await pinTriesRef(clubId).set({ [sheetId]: FieldValue.delete() }, { merge: true });
}

import { DocumentReference, getFirestore } from 'firebase-admin/firestore';

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

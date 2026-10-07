import { DocumentReference, getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

// API keys live in a subcollection that only the club's admins can read,
// rather than on the club document itself.
export function apiKeyRef(clubId: string): DocumentReference {
  return getFirestore()
    .collection('clubs')
    .doc(clubId)
    .collection('private')
    .doc('apiKey');
}

export function generateApiKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Constant-time comparison so response timing does not reveal how much of a
// guessed key was right.
export function apiKeysMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

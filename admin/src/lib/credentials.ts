// Both of these are credentials, so they use the platform's cryptographic
// random source rather than Math.random(), whose output is predictable from
// previously observed values and is not safe for anything secret.
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // cspell:ignore ABCDEFGHJKLMNPQRSTUVWXYZ
  // 256 is an exact multiple of the 32 character alphabet, so the modulo below
  // stays uniform and needs no rejection sampling.
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

export function generateApiKey(): string {
  // 16 bytes of entropy rendered as 32 hex characters, matching the format
  // provisionClub produces server side with crypto.randomBytes(16).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// No 0/O, 1/l/I or symbols that are hard to read aloud or type on a phone,
// since the password is passed on by hand.
const PASSWORD_SETS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ', // cspell:ignore ABCDEFGHJKLMNPQRSTUVWXYZ
  'abcdefghijkmnpqrstuvwxyz', // cspell:ignore abcdefghijkmnpqrstuvwxyz
  '23456789',
  '!#$%*+-=?@',
];

/** A uniform random index below [n], from the cryptographic source, by
 *  rejecting the bytes that would favor the low indexes. */
function randomIndex(n: number): number {
  const limit = 256 - (256 % n);
  for (;;) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < limit) return byte % n;
  }
}

/** A password for a new portal user, to be sent to them: 16 characters with
 *  at least one of each kind, about 95 bits of entropy. */
export function generatePassword(length = 16): string {
  const all = PASSWORD_SETS.join('');
  const chars = PASSWORD_SETS.map((set) => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  // Shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** A six digit scoreboard admin PIN, which the club can change. */
export function generatePin(): string {
  return Array.from({ length: 6 }, () => String(randomIndex(10))).join('');
}

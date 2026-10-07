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

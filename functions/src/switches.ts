import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { Kept } from './kept';
import { KEPT_MS, RATE_LIMITS, RateLimitName } from './limits';

/**
 * Switches a super admin can use in the portal to turn a public part of the
 * service off for everyone, when it is being flooded or misused. Each is on
 * unless set to false, so a missing document leaves everything on. Turning
 * one off makes its function answer before it reads anything else.
 *
 * Scoring on the sheets carries on whatever is off, as it does offline.
 */
export interface Switches {
  /** The REST API. Off, every request gets a 503. */
  api: boolean;
  /** The public scores page's JSON and logo. Off, they get a 503. */
  scoresPage: boolean;
  /** startDisplaySession. Off, no display can sign in with its link.
   *  Displays already signed in carry on. */
  displaySessions: boolean;
  /** pairSheet and unpairSheet. Off, no scoreboard can connect to or
   *  disconnect from a sheet. */
  pairing: boolean;
  /** The rate limits, with any a super admin has changed under limits,
   *  as { limit } for a name in RATE_LIMITS. */
  limits: Record<RateLimitName, { limit: number; per: number }>;
  /** Addresses turned away from the API and the public callables, for a
   *  single caller found in the logs. */
  blockedIps: Set<string>;
}

/** [RATE_LIMITS], with each limit in [overrides] that is a whole number of
 *  at least 1 in place of the default. Anything else is ignored. */
export function limitsWith(overrides: unknown): Switches['limits'] {
  const given = (overrides && typeof overrides === 'object' ? overrides : {}) as Record<string, unknown>;
  const limits = {} as Switches['limits'];
  for (const name of Object.keys(RATE_LIMITS) as RateLimitName[]) {
    const value = given[name];
    const limit = Number.isInteger(value) && (value as number) >= 1 ? value as number : RATE_LIMITS[name].limit;
    limits[name] = { limit, per: RATE_LIMITS[name].per };
  }
  return limits;
}

/** Super admins only, by the catch-all rule in firestore.rules. Not under
 *  appConfig, which anyone can read. */
export const SWITCHES_PATH = 'adminConfig/switches';

const kept = new Kept<Switches>(KEPT_MS.switches, 1);

/** The switches as they are, read at most once in [KEPT_MS.switches] by
 *  each instance. */
export function switches(): Promise<Switches> {
  return kept.get('switches', async () => {
    const snap = await getFirestore().doc(SWITCHES_PATH).get();
    const on = (name: 'api' | 'scoresPage' | 'displaySessions' | 'pairing') => snap.get(name) !== false;
    const blocked: unknown = snap.get('blockedIps');
    return {
      api: on('api'),
      scoresPage: on('scoresPage'),
      displaySessions: on('displaySessions'),
      pairing: on('pairing'),
      limits: limitsWith(snap.get('limits')),
      blockedIps: new Set(Array.isArray(blocked) ? blocked.filter((ip) => typeof ip === 'string') : []),
    };
  });
}

/** For a callable: stops with `unavailable` while [name] is off. */
export async function requireSwitchOn(name: 'displaySessions' | 'pairing', what: string): Promise<void> {
  if (!(await switches())[name]) {
    throw new HttpsError('unavailable', `${what} is turned off for now. Try again later.`);
  }
}

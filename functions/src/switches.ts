import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { Kept } from './kept';
import { KEPT_MS } from './limits';

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
    const on = (name: keyof Switches) => snap.get(name) !== false;
    return {
      api: on('api'),
      scoresPage: on('scoresPage'),
      displaySessions: on('displaySessions'),
      pairing: on('pairing'),
    };
  });
}

/** For a callable: stops with `unavailable` while [name] is off. */
export async function requireSwitchOn(name: 'displaySessions' | 'pairing', what: string): Promise<void> {
  if (!(await switches())[name]) {
    throw new HttpsError('unavailable', `${what} is turned off for now. Try again later.`);
  }
}

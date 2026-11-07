import { setGlobalOptions } from 'firebase-functions/v2';

// The most instances of each function that may run at once. They put a
// ceiling on what a flood of requests, or a bug that calls in a loop, can
// cost. A request that arrives while a function is at its ceiling is turned
// away with a 429 before any of our code runs, and a trigger's event is
// delivered again later. Even the smallest ceiling here serves far more
// than a club sends: one instance handles many requests at once.
//
// See docs/RATE_LIMITING_PROPOSAL.md for how these were chosen.
export const MAX_INSTANCES = {
  /** The REST API that club websites and other tools call. */
  api: 5,
  /** The display pages and the public scores page, behind Hosting's CDN. */
  display: 10,
  /** Callables that anyone, or any scoreboard, can call. */
  publicCallable: 3,
  /** Triggers on game and sheet writes, which the displays wait on. */
  trigger: 10,
  /** Everything else: callables only the portal's admins can use. */
  admin: 2,
} as const;

// Every module that defines a function imports this file first, so the
// default applies to each function that does not set its own.
setGlobalOptions({ maxInstances: MAX_INSTANCES.admin });

// How long each function instance keeps what it read for a request, so that
// a burst of the same requests reads Firestore once. A change made in the
// portal reaches the function after at most this long. See ./kept.ts.
export const KEPT_MS = {
  /** Whether a club exists and its API key. A new key takes this long to
   *  work, and the old one stops working after it. */
  apiKey: 60_000,
  /** Each API answer, by club and full path. */
  apiAnswer: 15_000,
  /** Whether a club's scores page is turned on. */
  scoresSwitch: 30_000,
  /** The switches in adminConfig/switches. The emulator tests set
   *  SWITCHES_KEPT_MS to 0, in functions/.env.demo-functions, so that a
   *  switch they turn off is seen straight away. */
  switches: Number(process.env['SWITCHES_KEPT_MS'] ?? 30_000),
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// How many requests each caller may make, counted in memory by each
// instance; see ./rateLimit.ts. With the instance ceilings above, the most
// a caller gets is the limit times the function's ceiling. A super admin
// can change any of them, without a deploy, under limits in
// adminConfig/switches. See docs/RATE_LIMITING_PROPOSAL.md for how these
// were chosen.
export const RATE_LIMITS = {
  /** REST API requests from one IP address, before the key is checked. A
   *  whole club behind one router shares an address. */
  apiPerIp: { limit: 60, per: MINUTE },
  /** Wrong keys and unknown clubs from one IP address. */
  apiFailuresPerIp: { limit: 10, per: MINUTE },
  /** REST API requests for one club, with its key. A stream tool asking for
   *  each of 6 sheets every 30 seconds through a 4 hour draw makes under
   *  3,000 in a day. */
  apiPerClubPerMinute: { limit: 60, per: MINUTE },
  apiPerClubPerDay: { limit: 5000, per: DAY },
  /** startDisplaySession from one IP address. Generous, since every screen
   *  at a club shares one and they all start at once after a power cut. */
  displaySessionsPerIp: { limit: 30, per: MINUTE },
  /** pairSheet for one signed in scoreboard, and from one IP address. A
   *  real scoreboard pairs once. */
  pairingPerUser: { limit: 10, per: HOUR },
  pairingPerIp: { limit: 30, per: HOUR },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

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

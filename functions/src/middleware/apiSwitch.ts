import { NextFunction, Request, Response } from 'express';
import { Limited, callerAddresses, overLimit } from '../rateLimit';
import { switches } from '../switches';

/** How long a caller is told to wait before trying a switched off API
 *  again, in seconds. */
export const OFF_RETRY_AFTER = '300';

/** The addresses [req] may have come from; see callerAddresses. */
export function addressesOf(req: Request): string[] {
  return callerAddresses(req.headers, req.socket.remoteAddress);
}

/** Answers 429 for a limit that was reached, saying when to try again. */
export function tooMany(res: Response, limited: Limited): void {
  res.status(429).set('Retry-After', String(limited.retryAfter)).json({ error: 'Too many requests' });
}

/**
 * Runs before the key check reads anything. Answers 503 while a super admin
 * has the API switched off, 403 to an address they have blocked, and 429 to
 * an address making too many requests.
 */
export async function apiSwitch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { api, blockedIps } = await switches();
    if (!api) {
      res.status(503).set('Retry-After', OFF_RETRY_AFTER).json({ error: 'The API is turned off for now' });
      return;
    }
    const addresses = addressesOf(req);
    if (addresses.some((address) => blockedIps.has(address))) {
      res.status(403).json({ error: 'This address is blocked' });
      return;
    }
    const limited = await overLimit('apiPerIp', addresses, req.headers['x-forwarded-for']);
    if (limited) {
      tooMany(res, limited);
      return;
    }
    next();
  } catch (err) {
    console.error('Could not read the switches', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

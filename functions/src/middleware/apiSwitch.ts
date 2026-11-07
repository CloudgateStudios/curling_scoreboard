import { NextFunction, Request, Response } from 'express';
import { switches } from '../switches';

/** How long a caller is told to wait before trying a switched off API
 *  again, in seconds. */
export const OFF_RETRY_AFTER = '300';

/** Answers 503 to every request while a super admin has the API switched
 *  off, before the key check reads anything. */
export async function apiSwitch(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if ((await switches()).api) {
      next();
      return;
    }
    res.status(503).set('Retry-After', OFF_RETRY_AFTER).json({ error: 'The API is turned off for now' });
  } catch (err) {
    console.error('Could not read the switches', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

import { NextFunction, Request, Response } from 'express';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';
import { apiKeyRef, apiKeysMatch } from '../apiKeys';
import { Kept } from '../kept';
import { KEPT_MS } from '../limits';
import { overLimit, withinLimit } from '../rateLimit';
import { OFF_RETRY_AFTER, addressesOf, tooMany } from './apiSwitch';

interface ClubAndKey {
  /** The club document, or null for a club that does not exist. */
  club: DocumentData | null;
  key: string | undefined;
  /** False when the club's admins have turned their API off, in the
   *  portal, without changing the key. */
  enabled: boolean;
}

// Kept for unknown clubs and wrong keys too, so that guessing at either
// reads nothing more than one right request does.
const clubsAndKeys = new Kept<ClubAndKey>(KEPT_MS.apiKey);

function clubAndKeyOf(clubId: string): Promise<ClubAndKey> {
  return clubsAndKeys.get(clubId, async () => {
    const [clubSnap, keySnap] = await Promise.all([
      getFirestore().collection('clubs').doc(clubId).get(),
      apiKeyRef(clubId).get(),
    ]);
    return {
      club: clubSnap.exists ? clubSnap.data()! : null,
      key: keySnap.get('key') as string | undefined,
      enabled: keySnap.get('enabled') !== false,
    };
  });
}

export async function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  try {
    const clubId = req.params['clubId'] as string;
    const addresses = addressesOf(req);
    const forwardedFor = req.headers['x-forwarded-for'];

    // An address that has had too many wrong keys or unknown clubs is
    // turned away before anything is read, until its bucket refills.
    if (!(await withinLimit('apiFailuresPerIp', addresses))) {
      const limited = await overLimit('apiFailuresPerIp', addresses, forwardedFor);
      if (limited) {
        tooMany(res, limited);
        return;
      }
    }

    const { club, key, enabled } = await clubAndKeyOf(clubId);

    if (!club) {
      await overLimit('apiFailuresPerIp', addresses, forwardedFor);
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    if (!key || !apiKeysMatch(key, apiKey)) {
      await overLimit('apiFailuresPerIp', addresses, forwardedFor);
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }

    // Checked after the key, so only the club's own integrations learn it.
    if (!enabled) {
      res.status(503).set('Retry-After', OFF_RETRY_AFTER).json({ error: 'The API is turned off for this club' });
      return;
    }

    // So that one key that got out cannot use up a meaningful share of the
    // month's free requests, however many addresses it is used from.
    const limited = await overLimit('apiPerClubPerMinute', [clubId], forwardedFor)
      ?? await overLimit('apiPerClubPerDay', [clubId], forwardedFor);
    if (limited) {
      tooMany(res, limited);
      return;
    }

    res.locals['club'] = { id: clubId, data: club };
    next();
  } catch (err) {
    console.error('API key validation error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

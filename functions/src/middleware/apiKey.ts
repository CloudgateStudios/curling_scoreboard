import { NextFunction, Request, Response } from 'express';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';
import { apiKeyRef, apiKeysMatch } from '../apiKeys';
import { Kept } from '../kept';
import { KEPT_MS } from '../limits';

interface ClubAndKey {
  /** The club document, or null for a club that does not exist. */
  club: DocumentData | null;
  key: string | undefined;
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
    const { club, key } = await clubAndKeyOf(clubId);

    if (!club) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    if (!key || !apiKeysMatch(key, apiKey)) {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }

    res.locals['club'] = { id: clubId, data: club };
    next();
  } catch (err) {
    console.error('API key validation error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

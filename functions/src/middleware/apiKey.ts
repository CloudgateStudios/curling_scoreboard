import { NextFunction, Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';

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
    const clubSnap = await getFirestore()
      .collection('clubs')
      .doc(clubId)
      .get();

    if (!clubSnap.exists) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    const clubData = clubSnap.data()!;
    if (clubData['apiKey'] !== apiKey) {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }

    res.locals['club'] = { id: clubSnap.id, data: clubData };
    next();
  } catch (err) {
    console.error('API key validation error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

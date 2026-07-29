import { Router, Request, Response } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Mounted under /api/v1/clubs/:clubId/sheets/:sheetId with mergeParams.
export const gamesRouter = Router({ mergeParams: true });

gamesRouter.get('/games', async (req: Request, res: Response) => {
  const { clubId, sheetId } = req.params as Record<string, string>;
  const db = getFirestore();

  try {
    const sheetRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('sheets')
      .doc(sheetId);

    const sheetSnap = await sheetRef.get();
    if (!sheetSnap.exists) {
      res.status(404).json({ error: 'Sheet not found' });
      return;
    }

    const rawLimit = parseInt((req.query['limit'] as string) ?? '20', 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 20 : rawLimit, 1), 100);

    const gamesSnap = await sheetRef
      .collection('games')
      .orderBy('finishedAt', 'desc')
      .limit(limit)
      .get();

    const games = gamesSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        startedAt: (d['startedAt'] as Timestamp).toDate().toISOString(),
        finishedAt: (d['finishedAt'] as Timestamp).toDate().toISOString(),
        numberOfEnds: d['numberOfEnds'] as number,
        team1: d['team1'],
        team2: d['team2'],
        ends: d['ends'],
      };
    });

    res.json({ games, limit });
  } catch (err) {
    console.error('GET /games error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

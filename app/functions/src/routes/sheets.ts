import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { gamesRouter } from './games';

// Mounted under /api/v1/clubs/:clubId with mergeParams.
export const sheetsRouter = Router({ mergeParams: true });

// Nest games under a specific sheet.
sheetsRouter.use('/sheets/:sheetId', gamesRouter);

sheetsRouter.get('/sheets/:sheetId', async (req: Request, res: Response) => {
  const { clubId, sheetId } = req.params as Record<string, string>;
  const db = admin.firestore();

  try {
    const clubSnap = await db.collection('clubs').doc(clubId).get();
    if (!clubSnap.exists) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    const sheetSnap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('sheets')
      .doc(sheetId)
      .get();

    if (!sheetSnap.exists) {
      res.status(404).json({ error: 'Sheet not found' });
      return;
    }

    res.json(buildSheetResponse(sheetId, sheetSnap.data() ?? {}));
  } catch (err) {
    console.error('GET /sheets/:sheetId error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export function buildSheetResponse(
  id: string,
  data: FirebaseFirestore.DocumentData,
): object {
  const liveGame = (data['liveGame'] as FirebaseFirestore.DocumentData | undefined) ?? null;
  return {
    id,
    name: data['name'] as string,
    hasLiveGame: liveGame !== null,
    liveGame: liveGame
      ? {
          currentEnd: liveGame['currentEnd'] as number,
          team1: liveGame['team1'],
          team2: liveGame['team2'],
        }
      : null,
  };
}

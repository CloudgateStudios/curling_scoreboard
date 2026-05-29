import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { sheetsRouter, buildSheetResponse } from './sheets';

export const clubsRouter = Router();

// Nest sheet and game routes under each club.
clubsRouter.use('/clubs/:clubId', sheetsRouter);

clubsRouter.get('/clubs/:clubId', async (req: Request, res: Response) => {
  const { clubId } = req.params;
  const db = admin.firestore();

  try {
    const clubSnap = await db.collection('clubs').doc(clubId).get();
    if (!clubSnap.exists) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    const sheetsSnap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('sheets')
      .orderBy('name')
      .get();

    const sheets = sheetsSnap.docs.map((doc) =>
      buildSheetResponse(doc.id, doc.data()),
    );

    res.json({
      id: clubId,
      name: (clubSnap.data() ?? {})['name'] as string,
      sheets,
    });
  } catch (err) {
    console.error('GET /clubs/:clubId error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

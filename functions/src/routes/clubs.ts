import { Request, Response, Router } from 'express';
import * as admin from 'firebase-admin';
import { validateApiKey } from '../middleware/apiKey';
import { buildSheetResponse, sheetsRouter } from './sheets';

export const clubsRouter = Router();

// Per-club router so validateApiKey runs once for the club GET and all
// nested sheet/game routes, with the fetched club doc shared via res.locals.
const clubRouter = Router({ mergeParams: true });
clubRouter.use(validateApiKey);
clubRouter.use(sheetsRouter);

clubRouter.get('/', async (req: Request, res: Response) => {
  const clubId = req.params['clubId'] as string;
  const { data: clubData } = res.locals['club'] as {
    id: string;
    data: FirebaseFirestore.DocumentData;
  };

  try {
    const sheetsSnap = await admin
      .firestore()
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
      name: clubData['name'] as string,
      sheets,
    });
  } catch (err) {
    console.error('GET /clubs/:clubId error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

clubsRouter.use('/clubs/:clubId', clubRouter);

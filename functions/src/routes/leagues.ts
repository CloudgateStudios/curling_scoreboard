import { Router, Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';

// Mounted under /api/v1/clubs/:clubId with mergeParams.
export const leaguesRouter = Router({ mergeParams: true });

// Built field by field, like the sheet response, so nothing added to a
// league document later reaches the API without being put here on purpose.
export function buildLeagueResponse(id: string, data: FirebaseFirestore.DocumentData): object {
  const draws = Array.isArray(data['draws']) ? (data['draws'] as FirebaseFirestore.DocumentData[]) : [];
  const teams = Array.isArray(data['teams']) ? (data['teams'] as FirebaseFirestore.DocumentData[]) : [];
  return {
    id,
    name: data['name'] as string,
    active: data['active'] !== false,
    seasonStart: (data['seasonStart'] as string | undefined) ?? null,
    seasonEnd: (data['seasonEnd'] as string | undefined) ?? null,
    draws: draws.map((draw) => ({
      day: draw['day'] as number,
      start: draw['start'] as string,
      end: draw['end'] as string,
    })),
    teams: teams.map((team) => ({
      id: team['id'] as string,
      name: team['name'] as string,
      externalId: (team['externalId'] as string | undefined) ?? null,
    })),
  };
}

leaguesRouter.get('/leagues', async (req: Request, res: Response) => {
  const { clubId } = req.params as Record<string, string>;

  try {
    const leaguesSnap = await getFirestore()
      .collection('clubs')
      .doc(clubId)
      .collection('leagues')
      .orderBy('name')
      .get();

    res.json({ leagues: leaguesSnap.docs.map((doc) => buildLeagueResponse(doc.id, doc.data())) });
  } catch (err) {
    console.error('GET /leagues error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

leaguesRouter.get('/leagues/:leagueId', async (req: Request, res: Response) => {
  const { clubId, leagueId } = req.params as Record<string, string>;

  try {
    const leagueSnap = await getFirestore()
      .collection('clubs')
      .doc(clubId)
      .collection('leagues')
      .doc(leagueId)
      .get();

    if (!leagueSnap.exists) {
      res.status(404).json({ error: 'League not found' });
      return;
    }

    res.json(buildLeagueResponse(leagueId, leagueSnap.data() ?? {}));
  } catch (err) {
    console.error('GET /leagues/:leagueId error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

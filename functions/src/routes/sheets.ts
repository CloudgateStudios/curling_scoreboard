import { Router, Request, Response } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { gamesRouter } from './games';

// Mounted under /api/v1/clubs/:clubId with mergeParams.
export const sheetsRouter = Router({ mergeParams: true });

// Nest games under a specific sheet.
sheetsRouter.use('/sheets/:sheetId', gamesRouter);

sheetsRouter.get('/sheets/:sheetId', async (req: Request, res: Response) => {
  const { clubId, sheetId } = req.params as Record<string, string>;
  const db = getFirestore();

  try {
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

// A scoreboard that is switched off or loses its connection mid-game never
// clears its live game. Nothing is pushed while an end is being played, so
// this has to be comfortably longer than the slowest end. The admin portal
// applies the same cutoff in admin/src/lib/liveGame.ts.
export const LIVE_GAME_TIMEOUT_MS = 120 * 60 * 1000;

// Live games written before updatedAt existed do not have one.
function updatedAtOf(liveGame: FirebaseFirestore.DocumentData): Timestamp | null {
  const updatedAt = liveGame['updatedAt'];
  return updatedAt instanceof Timestamp ? updatedAt : null;
}

function isStale(liveGame: FirebaseFirestore.DocumentData, now: number): boolean {
  const updatedAt = updatedAtOf(liveGame);
  // Without a timestamp the game cannot be aged, so it is left as live.
  if (updatedAt === null) return false;
  return now - updatedAt.toMillis() > LIVE_GAME_TIMEOUT_MS;
}

export function buildSheetResponse(
  id: string,
  data: FirebaseFirestore.DocumentData,
  now: number = Date.now(),
): object {
  const stored = (data['liveGame'] as FirebaseFirestore.DocumentData | undefined) ?? null;
  const liveGame = stored && !isStale(stored, now) ? stored : null;
  return {
    id,
    name: data['name'] as string,
    hasLiveGame: liveGame !== null,
    liveGame: liveGame
      ? {
          updatedAt: updatedAtOf(liveGame)?.toDate().toISOString() ?? null,
          currentEnd: liveGame['currentEnd'] as number,
          team1: liveGame['team1'],
          team2: liveGame['team2'],
        }
      : null,
  };
}

import { Router, Request, Response } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { gamesRouter } from './games';
import { LIVE_GAME_TIMEOUT_MS } from '../liveGame';

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
          // Both null for games from scoreboard builds that predate them.
          numberOfEnds: (liveGame['numberOfEnds'] as number | undefined) ?? null,
          // Null for an open game, and for any game from a scoreboard build
          // that predates league games.
          league: liveGame['league'] ?? null,
          team1: liveGame['team1'],
          team2: liveGame['team2'],
          ends: liveGame['ends'] ?? null,
        }
      : null,
  };
}

import { Router, Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveBonspiel, RecordedResult, Side, StateGame, StateTeam } from '../bonspiels/state';

// Mounted under /api/v1/clubs/:clubId with mergeParams.
export const bonspielsRouter = Router({ mergeParams: true });

type Data = FirebaseFirestore.DocumentData;

const list = (value: unknown): Data[] =>
  Array.isArray(value) ? value.filter((item): item is Data => typeof item === 'object' && item !== null) : [];

/** The short form, for the list. */
export function buildBonspielSummary(id: string, data: Data): object {
  return {
    id,
    name: data['name'] as string,
    active: data['active'] !== false,
    startDate: (data['startDate'] as string | undefined) ?? null,
    endDate: (data['endDate'] as string | undefined) ?? null,
  };
}

// Where a side's team comes from, as the plan says.
function sourceOf(side: Side): object | null {
  if (side === null) return null;
  if ('teamId' in side) return { type: 'team', teamId: side.teamId };
  if ('rank' in side) return { type: 'place', eventId: side.eventId, place: side.rank };
  return { type: side.result, gameId: side.from };
}

function teamOf(team: StateTeam | null | undefined): object | null {
  return team ? { teamId: team.teamId ?? null, name: team.name } : null;
}

function sideFromPlan(value: unknown): Side {
  const side = value as Data | null | undefined;
  if (typeof side?.['teamId'] === 'string') return { teamId: side['teamId'] };
  if (typeof side?.['eventId'] === 'string' && typeof side['rank'] === 'number') {
    return { rank: side['rank'], eventId: side['eventId'] };
  }
  if (typeof side?.['from'] === 'string' && (side['result'] === 'winner' || side['result'] === 'loser')) {
    return { from: side['from'], result: side['result'] };
  }
  return null;
}

/**
 * A bonspiel in full: its plan, and who is in each game and how it went.
 * Built field by field, like the other responses, so nothing added to a plan
 * later reaches the API without being put here on purpose. The state is
 * worked out again from the plan and the results the functions keep, so it
 * is never behind a plan saved a moment ago.
 */
export function buildBonspielResponse(id: string, data: Data, results: Record<string, RecordedResult>): object {
  const resolved = resolveBonspiel(data, results);
  return {
    ...buildBonspielSummary(id, data),
    numberOfEnds: (data['numberOfEnds'] as number | undefined) ?? null,
    events: list(data['events']).map((event) => {
      const state = resolved.events[event['id'] as string];
      return {
        id: event['id'] as string,
        name: event['name'] as string,
        numberOfEnds: (event['numberOfEnds'] as number | undefined) ?? null,
        finalGameId: state?.finalGameId ?? null,
        winner: teamOf(state?.winner),
        standings: state?.standings?.map((row) => ({
          team: teamOf(row),
          place: row.place,
          tied: row.tied,
          played: row.played,
          wins: row.wins,
          losses: row.losses,
          ties: row.ties,
          points: row.points,
        })) ?? null,
        complete: state?.complete ?? null,
      };
    }),
    teams: list(data['teams']).map((team) => ({
      id: team['id'] as string,
      name: team['name'] as string,
      externalId: (team['externalId'] as string | undefined) ?? null,
    })),
    draws: list(data['draws']).map((draw) => ({
      id: draw['id'] as string,
      label: draw['label'] as string,
      start: draw['start'] as string,
    })),
    games: list(data['games']).map((game) => {
      const state: StateGame | undefined = resolved.games[game['id'] as string];
      return {
        id: game['id'] as string,
        label: game['label'] as string,
        drawId: game['drawId'] as string,
        sheetId: game['sheetId'] as string,
        eventId: game['eventId'] as string,
        status: state?.status ?? 'waiting',
        team1: { from: sourceOf(sideFromPlan(game['team1'])), team: teamOf(state?.team1), score: state?.team1Score ?? null },
        team2: { from: sourceOf(sideFromPlan(game['team2'])), team: teamOf(state?.team2), score: state?.team2Score ?? null },
        winner: state?.winner ?? null,
      };
    }),
  };
}

function bonspielsOf(clubId: string) {
  return getFirestore().collection('clubs').doc(clubId).collection('bonspiels');
}

bonspielsRouter.get('/bonspiels', async (req: Request, res: Response) => {
  const { clubId } = req.params as Record<string, string>;
  try {
    const snap = await bonspielsOf(clubId).get();
    const bonspiels = snap.docs
      .map((doc) => ({ startDate: doc.get('startDate') as string | undefined, body: buildBonspielSummary(doc.id, doc.data()) }))
      // Newest first, as in the admin portal.
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
      .map((b) => b.body);
    res.json({ bonspiels });
  } catch (err) {
    console.error('GET /bonspiels error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

bonspielsRouter.get('/bonspiels/:bonspielId', async (req: Request, res: Response) => {
  const { clubId, bonspielId } = req.params as Record<string, string>;
  try {
    const ref = bonspielsOf(clubId).doc(bonspielId);
    const [plan, state] = await Promise.all([ref.get(), ref.collection('state').doc('current').get()]);
    if (!plan.exists) {
      res.status(404).json({ error: 'Bonspiel not found' });
      return;
    }
    const results = (state.get('results') as Record<string, RecordedResult> | undefined) ?? {};
    res.json(buildBonspielResponse(bonspielId, plan.data() ?? {}, results));
  } catch (err) {
    console.error('GET /bonspiels/:bonspielId error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

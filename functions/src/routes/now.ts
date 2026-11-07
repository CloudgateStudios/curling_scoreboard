import { Router, Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { RecordedResult } from '../bonspiels/state';
import { dateOf, formatLocalTime, localTimeIn, parseLocalTime, whatIsOn } from '../now';
import { streamText } from '../streamMessage';
import { liveGameOf } from './sheets';

// Mounted under /api/v1/clubs/:clubId/sheets/:sheetId with mergeParams.
export const nowRouter = Router({ mergeParams: true });

/** The club's time zone, or null when it has none this machine knows. */
export function clubTimeZone(config: FirebaseFirestore.DocumentData | undefined): string | null {
  const timeZone = config?.['timeZone'];
  if (typeof timeZone !== 'string' || timeZone === '') return null;
  return localTimeIn(timeZone, new Date()) === null ? null : timeZone;
}

// Hosting passes the site's own host on, so the link is to the page members
// already know.
function scoresUrlFor(req: Request, clubId: string): string {
  const host = req.get('x-forwarded-host') ?? req.get('host');
  return `https://${host}/display/${encodeURIComponent(clubId)}/scores`;
}

nowRouter.get('/now', async (req: Request, res: Response) => {
  const { clubId, sheetId } = req.params as Record<string, string>;
  const { data: clubData } = res.locals['club'] as { id: string; data: FirebaseFirestore.DocumentData };
  const club = getFirestore().collection('clubs').doc(clubId);

  try {
    const [sheetSnap, clubConfig, streamConfig, publicScores, leaguesSnap, bonspielsSnap] = await Promise.all([
      club.collection('sheets').doc(sheetId).get(),
      club.collection('config').doc('club').get(),
      club.collection('config').doc('stream').get(),
      club.collection('private').doc('publicScores').get(),
      club.collection('leagues').where('active', '==', true).get(),
      club.collection('bonspiels').where('active', '==', true).get(),
    ]);

    if (!sheetSnap.exists) {
      res.status(404).json({ error: 'Sheet not found' });
      return;
    }

    const timeZone = clubTimeZone(clubConfig.data());
    const asked = req.query['at'];
    let at: number | null;
    if (asked !== undefined) {
      at = parseLocalTime(asked);
      if (at === null) {
        res.status(400).json({ error: 'at must be a local time, YYYY-MM-DDTHH:mm' });
        return;
      }
    } else if (timeZone !== null) {
      at = localTimeIn(timeZone, new Date());
    } else {
      // A guess in UTC would name the wrong draw, which is worse than none.
      res.status(400).json({ error: 'The club has no time zone set, so at is needed' });
      return;
    }
    if (at === null) {
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    // Only the bonspiels on now need their results read.
    const bonspiels = await Promise.all(bonspielsSnap.docs
      .filter((doc) => {
        const start = doc.get('startDate');
        const end = doc.get('endDate');
        const today = dateOf(at!);
        const yesterday = dateOf(at! - 24 * 60);
        return typeof start === 'string' && typeof end === 'string' && end >= yesterday && start <= today;
      })
      .map(async (doc) => {
        const state = await doc.ref.collection('state').doc('current').get();
        return {
          id: doc.id,
          data: doc.data(),
          results: (state.get('results') as Record<string, RecordedResult> | undefined) ?? {},
        };
      }));

    const sheet = sheetSnap.data() ?? {};
    const answer = whatIsOn({
      at,
      sheetId,
      liveGame: liveGameOf(sheet),
      leagues: leaguesSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
      bonspiels,
    });
    const { title, description } = streamText(streamConfig.get('templates'), {
      clubName: clubData['name'] as string,
      sheetName: sheet['name'] as string,
      match: answer.match,
      today: dateOf(at),
      scoresUrl: publicScores.get('enabled') === true ? scoresUrlFor(req, clubId) : null,
    });

    res.json({
      at: formatLocalTime(at),
      timeZone,
      title,
      description,
      match: answer.match,
      candidates: answer.candidates,
    });
  } catch (err) {
    console.error('GET /sheets/:sheetId/now error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

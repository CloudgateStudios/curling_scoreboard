import { DocumentReference, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { RecordedResult, isNewerResult, resolveBonspiel, taggedGame } from './state';

// Keeps each bonspiel's state/current document in step with its plan and the
// games scoreboards record for it. Only these functions write the state, so
// a coordinator saving the plan never overwrites a result, and the other way
// round.

function stateRef(clubId: string, bonspielId: string): DocumentReference {
  return getFirestore()
    .collection('clubs').doc(clubId)
    .collection('bonspiels').doc(bonspielId)
    .collection('state').doc('current');
}

/**
 * Rebuilds the state from the plan as it is now and the results kept so far,
 * adding [added] to those first. Like the display summary, it never works
 * from the event that fired, so a late or repeated delivery writes the same
 * thing again.
 */
async function rebuild(
  clubId: string,
  bonspielId: string,
  added?: { gameId: string; result: RecordedResult },
): Promise<void> {
  const db = getFirestore();
  const planRef = db.collection('clubs').doc(clubId).collection('bonspiels').doc(bonspielId);
  const ref = stateRef(clubId, bonspielId);
  await db.runTransaction(async (tx) => {
    const [plan, state] = await Promise.all([tx.get(planRef), tx.get(ref)]);
    if (!plan.exists) {
      // The bonspiel was deleted, which a client cannot do to the state.
      if (state.exists) tx.delete(ref);
      return;
    }
    const results = { ...((state.get('results') as Record<string, RecordedResult> | undefined) ?? {}) };
    if (added) {
      if (!isNewerResult(added.result, results[added.gameId])) return;
      results[added.gameId] = added.result;
    }
    tx.set(ref, {
      updatedAt: FieldValue.serverTimestamp(),
      results,
      ...resolveBonspiel(plan.data() ?? {}, results),
    });
  });
}

// Fires on every change to a plan, including its deletion.
export const syncBonspielPlan = onDocumentWritten(
  'clubs/{clubId}/bonspiels/{bonspielId}',
  (event) => rebuild(event.params.clubId, event.params.bonspielId),
);

// Fires on each completed game. Only games a scoreboard played for a
// bonspiel carry its tag; the rest are let go without a read.
export const syncBonspielResult = onDocumentCreated(
  'clubs/{clubId}/sheets/{sheetId}/games/{gameId}',
  async (event) => {
    const { clubId, sheetId, gameId } = event.params;
    const data = event.data?.data();
    const tagged = data ? taggedGame(sheetId, gameId, data) : null;
    if (!tagged) return;
    await rebuild(clubId, tagged.bonspielId, { gameId: tagged.gameId, result: tagged.result });
  },
);

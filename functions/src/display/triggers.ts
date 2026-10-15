import { DocumentReference, FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  DisplayFinishedGame, displayFinishedGame, displaySheet, isNewerGame,
} from './state';

// Keeps each club's display summary (see ./state.ts) in step with its sheets
// and their completed games. The displays only ever read the summary.

export function displayStateRef(clubId: string): DocumentReference {
  return getFirestore().collection('clubs').doc(clubId).collection('private').doc('displayState');
}

// Compares what two versions of a sheet show on a display. Timestamps are
// compared by their time, whichever way the SDK would turn them into JSON.
function displayKey(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    const original = this[key] as { toMillis?: unknown } | null | undefined;
    return typeof original?.toMillis === 'function' ? (original.toMillis as () => number)() : v;
  });
}

// Fires on every write to a sheet, which includes each scoreboard's status
// report every half hour. Those change nothing a display shows, so they are
// let go without touching the summary.
//
// Writes can be delivered late, out of order or more than once, so the
// summary is always rebuilt from the sheet as it is now, never from the
// event. A late delivery then writes the current state again instead of an
// older one, and a sheet that has since been deleted stays removed.
export const syncDisplaySheet = onDocumentWritten(
  'clubs/{clubId}/sheets/{sheetId}',
  async (event) => {
    const { clubId, sheetId } = event.params;
    const before = event.data?.before;
    const after = event.data?.after;
    if (before?.exists && after?.exists) {
      const shownBefore = displayKey(displaySheet(sheetId, before.data() ?? {}));
      const shownAfter = displayKey(displaySheet(sheetId, after.data() ?? {}));
      if (shownBefore === shownAfter) return;
    }

    const db = getFirestore();
    const sheetRef = db.collection('clubs').doc(clubId).collection('sheets').doc(sheetId);
    const stateRef = displayStateRef(clubId);
    await db.runTransaction(async (tx) => {
      const sheet = await tx.get(sheetRef);
      if (!sheet.exists) {
        tx.set(stateRef, { sheets: { [sheetId]: FieldValue.delete() } }, {
          mergeFields: [new FieldPath('sheets', sheetId)],
        });
        return;
      }
      // Only the name and live game are replaced, so the last game recorded
      // by syncDisplayLastGame stays.
      tx.set(stateRef, { sheets: { [sheetId]: displaySheet(sheetId, sheet.data() ?? {}) } }, {
        mergeFields: [new FieldPath('sheets', sheetId, 'name'), new FieldPath('sheets', sheetId, 'live')],
      });
    });
  },
);

// Fires on each completed game, written in the same batch that removes the
// sheet's live game. The displays show it as the final score for a while,
// unless the sheet starts another game first.
//
// A scoreboard that was offline delivers its games when it reconnects, so a
// game only replaces the sheet's last game if it finished later.
export const syncDisplayLastGame = onDocumentCreated(
  'clubs/{clubId}/sheets/{sheetId}/games/{gameId}',
  async (event) => {
    const { clubId, sheetId, gameId } = event.params;
    const game = event.data?.data();
    const finished = game ? displayFinishedGame(gameId, game) : null;
    if (!finished) return;

    const db = getFirestore();
    const sheetRef = db.collection('clubs').doc(clubId).collection('sheets').doc(sheetId);
    const stateRef = displayStateRef(clubId);
    const lastGamePath = new FieldPath('sheets', sheetId, 'lastGame');
    await db.runTransaction(async (tx) => {
      const [sheet, state] = await Promise.all([tx.get(sheetRef), tx.get(stateRef)]);
      if (!sheet.exists) return;
      const current = state.get(lastGamePath) as DisplayFinishedGame | undefined;
      if (!isNewerGame(finished, current)) return;
      // The name and live game are written too, from the sheet as it is now,
      // so a sheet the summary has not seen yet arrives complete.
      tx.set(stateRef, {
        sheets: { [sheetId]: { ...displaySheet(sheetId, sheet.data() ?? {}), lastGame: finished } },
      }, {
        mergeFields: [
          new FieldPath('sheets', sheetId, 'name'),
          new FieldPath('sheets', sheetId, 'live'),
          lastGamePath,
        ],
      });
    });
  },
);

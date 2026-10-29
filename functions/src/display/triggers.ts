import {
  DocumentReference, DocumentSnapshot, FieldPath, FieldValue, Transaction, getFirestore,
} from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  DisplaySheet, displayFinishedGame, displayResult, displaySheet, leagueDraws, withResult, withShortNames,
} from './state';

type Data = Record<string, unknown>;

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

// The league and bonspiel documents a game names, as they are now, or
// undefined for one it does not name or that no longer exists. A display
// takes their short names, and a result its league's draws.
async function eventsOf(
  get: (ref: DocumentReference) => Promise<DocumentSnapshot>,
  clubRef: DocumentReference,
  game: unknown,
): Promise<[Data | undefined, Data | undefined]> {
  const read = async (field: string, collection: string) => {
    const id = ((game as Data | null | undefined)?.[field] as Data | null | undefined)?.['id'];
    if (typeof id !== 'string' || id === '') return undefined;
    return (await get(clubRef.collection(collection).doc(id))).data();
  };
  return Promise.all([read('league', 'leagues'), read('bonspiel', 'bonspiels')]);
}

// A sheet's entry in the summary, with its live game's short names. A short
// name added or changed during a game shows from its next change of score
// or end.
async function sheetEntry(tx: Transaction, clubRef: DocumentReference, sheet: DocumentSnapshot): Promise<DisplaySheet> {
  const data = sheet.data() ?? {};
  const entry = displaySheet(sheet.id, data);
  if (!entry.live) return entry;
  const [league, bonspiel] = await eventsOf((ref) => tx.get(ref), clubRef, data['liveGame']);
  return { ...entry, live: withShortNames(entry.live, league, bonspiel) };
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
    const clubRef = db.collection('clubs').doc(clubId);
    const sheetRef = clubRef.collection('sheets').doc(sheetId);
    const stateRef = displayStateRef(clubId);
    await db.runTransaction(async (tx) => {
      const sheet = await tx.get(sheetRef);
      if (!sheet.exists) {
        tx.set(stateRef, { sheets: { [sheetId]: FieldValue.delete() } }, {
          mergeFields: [new FieldPath('sheets', sheetId)],
        });
        return;
      }
      const entry = await sheetEntry(tx, clubRef, sheet);
      // The whole entry is replaced, which also clears the lastGame that
      // entries had before a sheet's final score came from the results.
      tx.set(stateRef, { sheets: { [sheetId]: entry } }, {
        mergeFields: [new FieldPath('sheets', sheetId)],
      });
    });
  },
);

// Fires on each completed game, written in the same batch that removes the
// sheet's live game, and adds it to the summary's results. The displays
// show a sheet's latest result as its final score for a while, unless the
// sheet starts another game first, and the warm room lists the day's results
// beside the sheets.
//
// A scoreboard that was offline delivers its games when it reconnects. Such
// a game joins the results in its place by when it finished, so it does not
// become the sheet's final score over a later one.
export const syncDisplayResults = onDocumentCreated(
  'clubs/{clubId}/sheets/{sheetId}/games/{gameId}',
  async (event) => {
    const { clubId, sheetId, gameId } = event.params;
    const game = event.data?.data();
    const finished = game ? displayFinishedGame(gameId, game) : null;
    if (!finished || !game) return;

    const db = getFirestore();
    const clubRef = db.collection('clubs').doc(clubId);
    const sheetRef = clubRef.collection('sheets').doc(sheetId);
    const stateRef = displayStateRef(clubId);
    // The league's draws and the short names as they are now, read once: a
    // league edited during the day only changes how later games are grouped.
    const [league, bonspiel] = await eventsOf((ref) => ref.get(), clubRef, game);
    const draws = leagueDraws(league);
    const named = withShortNames(finished, league, bonspiel);

    await db.runTransaction(async (tx) => {
      const [sheet, state] = await Promise.all([tx.get(sheetRef), tx.get(stateRef)]);
      if (!sheet.exists) return;
      const entry = await sheetEntry(tx, clubRef, sheet);
      const results = withResult(state.get('results'), displayResult(sheetId, entry.name, named, draws), Date.now());
      // The sheet's entry is written too, from the sheet as it is now, so a
      // sheet the summary has not seen yet arrives complete.
      tx.set(stateRef, { sheets: { [sheetId]: entry }, results }, {
        mergeFields: [new FieldPath('sheets', sheetId), 'results'],
      });
    });
  },
);

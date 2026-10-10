import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';
import { DocumentReference, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { buildGameResponse } from './routes/games';

// A club's completed game webhook: a URL the club gives us, usually a Slack
// or Discord incoming webhook, that each finished game is posted to.

/** Which completed games a club wants posted. */
type WebhookGames = 'all' | 'league';

interface WebhookSettings {
  url: string;
  games: WebhookGames;
}

interface DeliveryResult {
  ok: boolean;
  // The receiver's HTTP status, when it answered at all.
  status?: number;
  error?: string;
}

const ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [1000, 3000];

// The settings sit beside the API key, where scoreboards cannot read them:
// whoever holds the URL can post to the club's channel.
function settingsRef(clubId: string): DocumentReference {
  return getFirestore().collection('clubs').doc(clubId).collection('private').doc('webhook');
}

// Kept apart from the settings so the rule on those can stay "only url and
// games", whatever is recorded here.
function statusRef(clubId: string): DocumentReference {
  return getFirestore().collection('clubs').doc(clubId).collection('private').doc('webhookStatus');
}

async function readSettings(clubId: string): Promise<WebhookSettings | null> {
  const data = (await settingsRef(clubId).get()).data();
  const url = data?.['url'];
  if (typeof url !== 'string' || url === '') return null;
  return { url, games: data?.['games'] === 'league' ? 'league' : 'all' };
}

// A league game is one where a league team was picked for either color. Open
// games only carry the names of the rock colors.
export function isLeagueGame(game: FirebaseFirestore.DocumentData): boolean {
  return [game['team1'], game['team2']].some(
    (team) => typeof team?.['teamId'] === 'string' && team['teamId'] !== '',
  );
}

/** The result on one line, e.g. "Monday Night, Sheet 2: Team Smith 7, Team Jones 4". */
export function gameSummary(sheetName: string, game: FirebaseFirestore.DocumentData): string {
  const league = game['league']?.['name'];
  const where = typeof league === 'string' && league !== '' ? `${league}, ${sheetName}` : sheetName;
  const side = (team: FirebaseFirestore.DocumentData | undefined) =>
    `${team?.['name'] ?? 'Unknown'} ${team?.['totalScore'] ?? 0}`;
  return `${where}: ${side(game['team1'])}, ${side(game['team2'])}`;
}

// Slack reads the message from `text` and Discord from `content`, so both
// carry it and either kind of webhook URL works as is.
function withMessage(text: string, rest: Record<string, unknown>): Record<string, unknown> {
  return { text, content: text, ...rest };
}

const runningInEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';

// Addresses a webhook must not reach: this machine, private networks and the
// cloud metadata service. The URL comes from a club admin, and the request is
// made from inside Google Cloud.
const blockedAddresses = new BlockList();
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('100.64.0.0', 10, 'ipv4');
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('::', 127, 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');

function isBlockedAddress(address: string): boolean {
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is still that address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blockedAddresses.check(mapped[1], 'ipv4');
  return blockedAddresses.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}

// Returns why the URL cannot be used, or null when it can. The emulator tests
// post to a server on this machine, so the checks are skipped there.
async function urlProblem(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'The webhook URL is not a valid URL.';
  }
  if (runningInEmulator) return null;
  if (url.protocol !== 'https:') return 'The webhook URL must start with https://.';

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    return 'The webhook URL\'s host could not be found.';
  }
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    return 'The webhook URL must be a public address.';
  }
  return null;
}

async function post(url: string, body: string): Promise<DeliveryResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'CurlingScoreboard-Webhook' },
      body,
      // A redirect could lead somewhere the checks above never saw.
      redirect: 'manual',
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true, status: response.status };
    return { ok: false, status: response.status, error: `The webhook answered ${response.status}.` };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, error: timedOut ? 'The webhook did not answer in time.' : 'The webhook could not be reached.' };
  }
}

// Worth another go: no answer, a server error, or being told to slow down.
// Any other answer would be the same next time.
function isRetryable(result: DeliveryResult): boolean {
  return result.status === undefined || result.status >= 500 || result.status === 429;
}

async function deliver(url: string, payload: Record<string, unknown>): Promise<DeliveryResult> {
  const problem = await urlProblem(url);
  if (problem) return { ok: false, error: problem };

  const body = JSON.stringify(payload);
  let result = await post(url, body);
  for (let attempt = 1; attempt < ATTEMPTS && !result.ok && isRetryable(result); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    result = await post(url, body);
  }
  return result;
}

// What the admin portal shows as the last delivery.
async function recordStatus(
  clubId: string,
  kind: 'game' | 'test',
  result: DeliveryResult,
): Promise<void> {
  await statusRef(clubId).set({
    at: FieldValue.serverTimestamp(),
    kind,
    ok: result.ok,
    ...(result.status !== undefined && { status: result.status }),
    ...(result.error !== undefined && { error: result.error }),
  });
}

// Fires when a scoreboard's Finish Game write lands, which is the moment a
// game stops being live. A scoreboard that was offline delivers that write
// when it reconnects, so the post can come well after the game.
export const sendCompletedGameWebhook = onDocumentCreated(
  'clubs/{clubId}/sheets/{sheetId}/games/{gameId}',
  async (event) => {
    const { clubId, sheetId, gameId } = event.params;
    const game = event.data?.data();
    if (!event.data || !game) return;

    const settings = await readSettings(clubId);
    if (!settings) return;
    if (settings.games === 'league' && !isLeagueGame(game)) return;

    // Events can be delivered more than once. Whichever delivery marks the
    // game first posts it; the mark is made before posting, so a failed post
    // is recorded and not sent again.
    const gameRef = event.data.ref;
    const db = getFirestore();
    const claimed = await db.runTransaction(async (tx) => {
      const current = await tx.get(gameRef);
      if (!current.exists || current.get('webhook') !== undefined) return false;
      tx.update(gameRef, { webhook: { attemptedAt: FieldValue.serverTimestamp() } });
      return true;
    });
    if (!claimed) return;

    const clubRef = db.collection('clubs').doc(clubId);
    const [clubSnap, sheetSnap] = await Promise.all([
      clubRef.get(),
      clubRef.collection('sheets').doc(sheetId).get(),
    ]);
    const sheetName = (sheetSnap.get('name') as string | undefined) ?? sheetId;

    const result = await deliver(settings.url, withMessage(gameSummary(sheetName, game), {
      event: 'game.completed',
      club: { id: clubId, name: (clubSnap.get('name') as string | undefined) ?? clubId },
      sheet: { id: sheetId, name: sheetName },
      game: buildGameResponse(gameId, game),
    }));
    if (!result.ok) {
      console.error(`Completed game webhook failed for ${gameRef.path}`, result);
    }
    // On the game too, so the admin portal can show how each one went. A game
    // left with only attemptedAt is one whose post never finished.
    await Promise.all([
      gameRef.update({
        'webhook.ok': result.ok,
        ...(result.status !== undefined && { 'webhook.status': result.status }),
        ...(result.error !== undefined && { 'webhook.error': result.error }),
      }),
      recordStatus(clubId, 'game', result),
    ]);
  },
);

// Posts a sample message to the club's saved webhook, so an admin finds out
// that the URL works when they set it and not after the next game.
export const sendTestWebhook = onCall(async (request) => {
  const { clubId } = (request.data ?? {}) as { clubId?: unknown };
  if (typeof clubId !== 'string' || clubId === '') {
    throw new HttpsError('invalid-argument', 'clubId is required.');
  }
  const token = request.auth?.token;
  const allowed = token?.['role'] === 'superadmin'
    || (token?.['role'] === 'clubadmin' && token['clubId'] === clubId);
  if (!allowed) {
    throw new HttpsError('permission-denied', 'Admin access to this club is required.');
  }

  const settings = await readSettings(clubId);
  if (!settings) {
    throw new HttpsError('failed-precondition', 'Save a webhook URL first.');
  }

  const clubSnap = await getFirestore().collection('clubs').doc(clubId).get();
  const clubName = (clubSnap.get('name') as string | undefined) ?? clubId;
  const result = await deliver(settings.url, withMessage(
    `Test from Curling Scoreboard for ${clubName}. Completed games will be posted here.`,
    { event: 'test', club: { id: clubId, name: clubName } },
  ));
  await recordStatus(clubId, 'test', result);
  return result;
});

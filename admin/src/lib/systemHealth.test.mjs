// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceReport, matchClubs, problems, systemHealth } from './systemHealth.ts';

const NOW = Date.parse('2026-11-11T20:00:00Z');
const MIN = 60_000;
// Enough of a Firestore Timestamp for the code under test.
const ts = (millis) => ({ toMillis: () => millis, toDate: () => new Date(millis) });
const deployed = { scoreboard: 'b81e0aaaaaaa', displays: 'd1d1d1d1d1d1' };

function sheet(name, extra = {}) {
  return { id: name.toLowerCase().replace(' ', '-'), name, clubId: 'granite', ...extra };
}
function paired(name, device = {}, extra = {}) {
  return sheet(name, {
    scoreboardUid: 'u',
    device: { lastSeenAt: ts(NOW - 2 * MIN), buildId: deployed.scoreboard, appVersion: '0.9.0', ...device },
    ...extra,
  });
}
function display(label, device, clubId = 'granite') {
  return { id: label, label, clubId, device };
}

describe('systemHealth', () => {
  test('counts each club and every club together', () => {
    const sheets = [
      paired('Sheet 1'),
      paired('Sheet 2', { lastSeenAt: ts(NOW - 3 * 60 * MIN) }),
      sheet('Sheet 3'),
      { ...paired('Sheet 1'), clubId: 'maple', liveGame: { currentEnd: 2, updatedAt: ts(NOW - MIN), team1: {}, team2: {} } },
    ];
    const screens = [display('Bar TV', { lastSeenAt: ts(NOW - MIN), buildId: deployed.displays })];
    const { byClub, total } = systemHealth(sheets, screens, deployed, NOW);
    assert.deepEqual(byClub.get('granite'), {
      sheets: 3, online: 1, offline: 1, unpaired: 1, updatePending: 0, syncErrors: 0, live: 0, screensOpen: 1,
    });
    assert.equal(byClub.get('maple').live, 1);
    assert.equal(total.sheets, 4);
    assert.equal(total.online, 2);
  });
});

describe('problems', () => {
  test('lists sync errors first, then offline, updates and clocks', () => {
    const found = problems([
      paired('Sheet 4', { clientTime: ts(NOW - 2 * MIN + 5 * MIN) }),
      paired('Sheet 3', { buildId: 'old0000000' }),
      paired('Sheet 2', { lastSeenAt: ts(NOW - 3 * 60 * MIN) }),
      paired('Sheet 1', { lastSyncError: { operation: 'saveGame', message: 'permission-denied', at: ts(NOW - 12 * MIN) } }),
    ], [], deployed, NOW);
    assert.deepEqual(found.map((p) => [p.where, p.kind]), [
      ['Sheet 1', 'syncError'], ['Sheet 2', 'offline'], ['Sheet 3', 'updatePending'], ['Sheet 4', 'clock'],
    ]);
    assert.equal(found[0].detail, 'saveGame: permission-denied');
    assert.equal(found[2].detail, 'On old0000');
  });

  test('a paired scoreboard that never reported is offline; an unpaired sheet is fine', () => {
    const found = problems([sheet('Sheet 5', { scoreboardUid: 'u' }), sheet('Sheet 6')], [], deployed, NOW);
    assert.deepEqual(found.map((p) => [p.where, p.kind, p.detail]), [['Sheet 5', 'offline', 'Never reported']]);
  });

  test('a closed screen is fine, one open on an old build is not', () => {
    const found = problems([], [
      display('Lobby', { lastSeenAt: ts(NOW - 5 * 60 * MIN), buildId: 'old' }),
      display('Bar TV', { lastSeenAt: ts(NOW - MIN), buildId: 'old0000000' }),
    ], deployed, NOW);
    assert.deepEqual(found.map((p) => [p.where, p.kind, p.device]), [['Bar TV', 'updatePending', 'screen']]);
  });
});

describe('matchClubs', () => {
  const clubs = [
    { id: 'lake-granite', name: 'Lake Granite' },
    { id: 'granite', name: 'Granite CC' },
    { id: 'maple', name: 'Maple Leaf' },
  ];

  test('lists every club by name with no term', () => {
    assert.deepEqual(matchClubs(clubs, '').map((c) => c.id), ['granite', 'lake-granite', 'maple']);
  });

  test('matches name or ID, those starting with the term first', () => {
    assert.deepEqual(matchClubs(clubs, 'gran').map((c) => c.id), ['granite', 'lake-granite']);
    assert.deepEqual(matchClubs(clubs, 'MAPLE').map((c) => c.id), ['maple']);
  });
});

describe('deviceReport', () => {
  test('summarizes scoreboards, screens and services in UTC', () => {
    const text = deviceReport({
      club: { id: 'granite', name: 'Granite CC' },
      sheets: [
        paired('Sheet 2', { platform: 'web', renderer: 'wasm' }),
        sheet('Sheet 10'),
        paired('Sheet 1', { lastSyncError: { operation: 'saveGame', message: 'permission-denied', at: ts(NOW - 12 * MIN) } }),
      ],
      displays: [display('Bar TV', { lastSeenAt: ts(NOW - MIN), buildId: 'old0000000', page: 'warm-room' })],
      deployed,
      now: new Date(NOW),
      apiEnabled: true,
      publicPage: false,
      webhook: { at: new Date(NOW - 8 * MIN), ok: false, status: 404, error: 'Not found' },
    });
    assert.equal(text, [
      'Granite CC (granite), 2026-11-11 20:00 UTC',
      'Deployed builds: scoreboard b81e0aa, displays d1d1d1d',
      '',
      'Scoreboards',
      '- Sheet 1: online, v0.9.0, build b81e0aa, seen 2026-11-11 19:58 UTC',
      '  last sync error 2026-11-11 19:48 UTC: saveGame: permission-denied',
      '- Sheet 2: online, v0.9.0, build b81e0aa, web wasm, seen 2026-11-11 19:58 UTC',
      '- Sheet 10: no scoreboard',
      '',
      'Screens',
      '- Bar TV: open, warm-room, build old0000, update pending, seen 2026-11-11 19:59 UTC',
      '',
      'REST API: on',
      'Public scores page: off',
      'Webhook: last post failed (404) 2026-11-11 19:52 UTC: Not found',
    ].join('\n'));
  });
});

// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clockSkew, deviceHealth, sheetsHealth } from './deviceHealth.ts';

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const at = (millis) => ({ toMillis: () => millis, toDate: () => new Date(millis) });

describe('deviceHealth', () => {
  test('is null for a device that has not reported', () => {
    assert.equal(deviceHealth(undefined, 'abc', NOW), null);
  });

  test('is online until two reports are missed', () => {
    assert.equal(deviceHealth({ lastSeenAt: at(NOW - 64 * MINUTE) }, null, NOW).online, true);
    assert.equal(deviceHealth({ lastSeenAt: at(NOW - 65 * MINUTE) }, null, NOW).online, false);
    assert.equal(deviceHealth({}, null, NOW).online, false);
  });

  test('has an update pending while it runs another build than the deployed one', () => {
    assert.equal(deviceHealth({ buildId: 'old' }, 'new', NOW).updatePending, true);
    assert.equal(deviceHealth({ buildId: 'new' }, 'new', NOW).updatePending, false);
    assert.equal(deviceHealth({ buildId: 'old' }, null, NOW).updatePending, false, 'nothing deployed yet');
    assert.equal(deviceHealth({}, 'new', NOW).updatePending, false, 'a local build');
  });

  test('flags a sync error from the last day', () => {
    const error = (ago) => ({ lastSyncError: { operation: 'write', message: 'x', at: at(NOW - ago) } });
    assert.equal(deviceHealth(error(23 * 60 * MINUTE), null, NOW).recentSyncError, true);
    assert.equal(deviceHealth(error(25 * 60 * MINUTE), null, NOW).recentSyncError, false);
  });
});

describe('sheetsHealth', () => {
  test('counts paired sheets by how their scoreboards are doing', () => {
    const sheets = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', scoreboardUid: 'u1', device: { lastSeenAt: at(NOW), buildId: 'new' } },
      { id: 'c', name: 'C', scoreboardUid: 'u2', device: { lastSeenAt: at(NOW), buildId: 'old' } },
      { id: 'd', name: 'D', scoreboardUid: 'u3' },
    ];
    assert.deepEqual(sheetsHealth(sheets, 'new', NOW),
      { online: 2, offline: 1, updatePending: 1, syncErrors: 0, unpaired: 1 });
  });
});

describe('clockSkew', () => {
  test('says how far out a clock is, once it is two minutes out', () => {
    assert.equal(clockSkew({ clientTime: at(NOW + 5 * MINUTE), lastSeenAt: at(NOW) }), '5m ahead');
    assert.equal(clockSkew({ clientTime: at(NOW - 3 * MINUTE), lastSeenAt: at(NOW) }), '3m behind');
    assert.equal(clockSkew({ clientTime: at(NOW + MINUTE), lastSeenAt: at(NOW) }), null);
    assert.equal(clockSkew({ lastSeenAt: at(NOW) }), null);
  });
});

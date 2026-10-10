import type { Sheet } from '../types';

// Scoreboards report every 30 minutes (Constants.deviceStatusHeartbeat in the
// app). Two missed reports, plus some slack, is treated as offline.
const OFFLINE_AFTER_MS = 65 * 60_000;

const RECENT_SYNC_ERROR_MS = 24 * 60 * 60_000;

export interface DeviceHealth {
  /** Reported within the heartbeat window. */
  online: boolean;
  /** Running a different build from the one deployed. */
  updatePending: boolean;
  /** A write failed in the last day. */
  recentSyncError: boolean;
}

/** How the scoreboard paired with [sheet] is doing, or null when it has
 *  not reported since pairing. */
export function deviceHealth(sheet: Sheet, deployedBuildId: string | null, now: number): DeviceHealth | null {
  const device = sheet.device;
  if (!device) return null;
  const lastSeen = device.lastSeenAt?.toMillis();
  return {
    online: lastSeen !== undefined && now - lastSeen < OFFLINE_AFTER_MS,
    updatePending:
      deployedBuildId !== null && device.buildId !== undefined && device.buildId !== deployedBuildId,
    recentSyncError:
      device.lastSyncError !== undefined && now - device.lastSyncError.at.toMillis() < RECENT_SYNC_ERROR_MS,
  };
}

export interface SheetsHealth {
  online: number;
  /** Paired, but offline or never reported. */
  offline: number;
  updatePending: number;
  syncErrors: number;
  unpaired: number;
}

/** Counts for the summary above the sheet list. */
export function sheetsHealth(sheets: Sheet[], deployedBuildId: string | null, now: number): SheetsHealth {
  const counts: SheetsHealth = { online: 0, offline: 0, updatePending: 0, syncErrors: 0, unpaired: 0 };
  for (const sheet of sheets) {
    if (!sheet.scoreboardUid) {
      counts.unpaired++;
      continue;
    }
    const health = deviceHealth(sheet, deployedBuildId, now);
    if (health?.online) counts.online++;
    else counts.offline++;
    if (health?.updatePending) counts.updatePending++;
    if (health?.recentSyncError) counts.syncErrors++;
  }
  return counts;
}

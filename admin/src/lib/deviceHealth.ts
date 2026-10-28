import type { Timestamp } from 'firebase/firestore';
import type { DeviceStatus, Sheet } from '../types';

// Scoreboards and display pages report every 30 minutes
// (Constants.deviceStatusHeartbeat in the app, STATUS_HEARTBEAT_MS in the
// display pages). Two missed reports, plus some slack, is treated as offline.
const OFFLINE_AFTER_MS = 65 * 60_000;

// A device clock this far from the server's is worth pointing out, since game
// times are stamped by the device.
const CLOCK_SKEW_WARNING_MS = 2 * 60_000;

const RECENT_SYNC_ERROR_MS = 24 * 60 * 60_000;

export interface DeviceHealth {
  /** Reported within the heartbeat window. */
  online: boolean;
  /** Running a different build from the one deployed. */
  updatePending: boolean;
  /** A write failed in the last day. */
  recentSyncError: boolean;
}

/** What a scoreboard or a display page last said about itself: the parts
 *  both report. */
type ReportedStatus = Pick<DeviceStatus, 'lastSeenAt' | 'buildId' | 'lastSyncError'>;

/** How a scoreboard or display page is doing, from what it last reported,
 *  or null when it has not reported. */
export function deviceHealth(
  device: ReportedStatus | undefined,
  deployedBuildId: string | null,
  now: number,
): DeviceHealth | null {
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
    const health = deviceHealth(sheet.device, deployedBuildId, now);
    if (health?.online) counts.online++;
    else counts.offline++;
    if (health?.updatePending) counts.updatePending++;
    if (health?.recentSyncError) counts.syncErrors++;
  }
  return counts;
}

/** A commit SHA, cut to what people recognize. */
export function shortBuild(buildId: string): string {
  return buildId.slice(0, 7);
}

export function formatTime(time: Timestamp | undefined): string | null {
  return time ? time.toDate().toLocaleString() : null;
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${Math.floor(abs / 60)}:${mm}`;
}

/** How far the device's clock is out, as "3m ahead", or null when it is
 *  close enough. */
export function clockSkew(device: Pick<DeviceStatus, 'clientTime' | 'lastSeenAt'>): string | null {
  if (!device.clientTime || !device.lastSeenAt) return null;
  const skewMs = device.clientTime.toMillis() - device.lastSeenAt.toMillis();
  if (Math.abs(skewMs) < CLOCK_SKEW_WARNING_MS) return null;
  const minutes = Math.round(Math.abs(skewMs) / 60_000);
  return `${minutes}m ${skewMs > 0 ? 'ahead' : 'behind'}`;
}

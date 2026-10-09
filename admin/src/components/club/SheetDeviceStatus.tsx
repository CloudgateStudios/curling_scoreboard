import type { Timestamp } from 'firebase/firestore';
import { formatAgo } from '../../lib/format';
import type { Sheet } from '../../types';
import common from '../../styles/common.module.css';
import styles from './SheetDeviceStatus.module.css';

// Scoreboards report every 30 minutes (Constants.deviceStatusHeartbeat in the
// app). Two missed reports, plus some slack, is treated as offline.
const OFFLINE_AFTER_MS = 65 * 60_000;

// A device clock this far from the server's is worth pointing out, since game
// times are stamped by the device.
const CLOCK_SKEW_WARNING_MS = 2 * 60_000;

const RECENT_SYNC_ERROR_MS = 24 * 60 * 60_000;

interface Props {
  sheet: Sheet;
  /** The build currently deployed, from appConfig/scoreboard. */
  deployedBuildId: string | null;
  now: Date;
}

function shortBuild(buildId: string): string {
  return buildId.slice(0, 7);
}

function formatTime(time: Timestamp | undefined): string | null {
  return time ? time.toDate().toLocaleString() : null;
}

function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${Math.floor(abs / 60)}:${mm}`;
}

function clockSkew(device: NonNullable<Sheet['device']>): string | null {
  if (!device.clientTime || !device.lastSeenAt) return null;
  const skewMs = device.clientTime.toMillis() - device.lastSeenAt.toMillis();
  if (Math.abs(skewMs) < CLOCK_SKEW_WARNING_MS) return null;
  const minutes = Math.round(Math.abs(skewMs) / 60_000);
  return `${minutes}m ${skewMs > 0 ? 'ahead' : 'behind'}`;
}

/** The app version, check-in state and device details of a paired sheet's scoreboard. */
export function SheetDeviceStatus({ sheet, deployedBuildId, now }: Props) {
  const device = sheet.device;

  if (!device) {
    return (
      <div className={common.rowMeta}>
        <span
          className={common.idleChip}
          title="The scoreboard has not reported in since it was paired. It may be switched off, or running a version from before status reporting."
        >
          No status reported
        </span>
      </div>
    );
  }

  const lastSeen = device.lastSeenAt?.toDate();
  const online = lastSeen !== undefined && now.getTime() - lastSeen.getTime() < OFFLINE_AFTER_MS;
  const updatePending =
    deployedBuildId !== null && device.buildId !== undefined && device.buildId !== deployedBuildId;
  const syncError = device.lastSyncError;
  const syncErrorIsRecent =
    syncError !== undefined && now.getTime() - syncError.at.toMillis() < RECENT_SYNC_ERROR_MS;
  const skew = clockSkew(device);

  const details: [string, string | null | undefined][] = [
    ['Build', device.buildId ? shortBuild(device.buildId) : 'Local build'],
    ['Waiting to load', device.updateTargetBuildId && shortBuild(device.updateTargetBuildId)],
    ['Last update reload', formatTime(device.lastReloadAttemptAt)],
    ['Platform', [device.platform, device.renderer].filter(Boolean).join(' · ')],
    ['Browser', device.userAgent],
    ['Screen', device.screen && `${device.screen.width} × ${device.screen.height} @${device.screen.pixelRatio}x`],
    [
      'Time zone',
      [device.timezone, device.utcOffsetMinutes !== undefined && formatUtcOffset(device.utcOffsetMinutes)]
        .filter(Boolean)
        .join(' · '),
    ],
    ['Device clock', skew],
    ['Running since', formatTime(device.sessionStartedAt)],
    ['Last seen', formatTime(device.lastSeenAt)],
    ['Paired', formatTime(sheet.pairedAt)],
    ['Last sync error', syncError && `${syncError.operation}: ${syncError.message} (${formatTime(syncError.at)})`],
  ];

  return (
    <>
      <div className={common.rowMeta}>
        {device.appVersion && (
          <span className={common.versionChip} title={device.buildId && `Build ${shortBuild(device.buildId)}`}>
            v{device.appVersion}
          </span>
        )}
        {online ? (
          <span className={common.onlineChip}>Online · seen {formatAgo(lastSeen, now)}</span>
        ) : (
          <span className={common.warningChip}>
            Offline{lastSeen ? ` · last seen ${formatAgo(lastSeen, now)}` : ''}
          </span>
        )}
        {updatePending && (
          <span
            className={common.warningChip}
            title="A newer build is deployed. The scoreboard loads it between games."
          >
            Update pending
          </span>
        )}
        {syncErrorIsRecent && (
          <span className={common.errorChip} title={`${syncError.operation}: ${syncError.message}`}>
            Sync error {formatAgo(syncError.at.toDate(), now)}
          </span>
        )}
        {skew && <span className={common.warningChip}>Clock {skew}</span>}
      </div>
      <details className={styles.deviceDetails}>
        <summary>Device details</summary>
        <dl className={styles.deviceDetailList}>
          {details.map(
            ([label, value]) =>
              value && (
                <div key={label} style={{ display: 'contents' }}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ),
          )}
        </dl>
      </details>
    </>
  );
}

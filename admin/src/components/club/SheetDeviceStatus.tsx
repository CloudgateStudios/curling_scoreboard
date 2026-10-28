import { clockSkew, deviceHealth, formatTime, formatUtcOffset, shortBuild } from '../../lib/deviceHealth';
import { formatAgo } from '../../lib/format';
import type { Sheet } from '../../types';
import common from '../../styles/common.module.css';
import { DeviceDetails } from './DeviceDetails';

interface Props {
  sheet: Sheet;
  /** The build currently deployed, from appConfig/scoreboard. */
  deployedBuildId: string | null;
  now: Date;
}

/** The app version, check-in state and device details of a paired sheet's scoreboard. */
export function SheetDeviceStatus({ sheet, deployedBuildId, now }: Props) {
  const device = sheet.device;
  const health = deviceHealth(device, deployedBuildId, now.getTime());

  if (!device || !health) {
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
  const { online, updatePending, recentSyncError } = health;
  const syncError = device.lastSyncError;
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
        {online && lastSeen ? (
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
        {recentSyncError && syncError && (
          <span className={common.errorChip} title={`${syncError.operation}: ${syncError.message}`}>
            Sync error {formatAgo(syncError.at.toDate(), now)}
          </span>
        )}
        {skew && <span className={common.warningChip}>Clock {skew}</span>}
      </div>
      <DeviceDetails details={details} />
    </>
  );
}

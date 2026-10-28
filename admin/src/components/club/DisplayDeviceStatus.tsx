import { clockSkew, deviceHealth, formatTime, formatUtcOffset, shortBuild } from '../../lib/deviceHealth';
import { formatAgo } from '../../lib/format';
import type { DisplayStatus } from '../../types';
import common from '../../styles/common.module.css';
import { DeviceDetails } from './DeviceDetails';

interface Props {
  device: DisplayStatus | undefined;
  /** The build currently deployed, from appConfig/displays. */
  deployedBuildId: string | null;
  /** The score bug's sheet name, for the details. */
  sheetName: (sheetId: string) => string | undefined;
  now: Date;
}

const PAGE_NAMES: Record<NonNullable<DisplayStatus['page']>, string> = {
  bug: 'Score bug',
  'warm-room': 'Warm room',
  bonspiel: 'Bonspiel',
  link: 'Opening the link',
};

/** The version, check-in state and details of the screen on a display link.
 *  Mirrors SheetDeviceStatus for a scoreboard. */
export function DisplayDeviceStatus({ device, deployedBuildId, sheetName, now }: Props) {
  const health = deviceHealth(device, deployedBuildId, now.getTime());

  if (!device || !health) {
    return (
      <div className={common.rowMeta}>
        <span
          className={common.idleChip}
          title="No screen has reported in on this link. It may not be open anywhere, or be running a version from before status reporting. Refresh it once to start."
        >
          No status reported
        </span>
      </div>
    );
  }

  const lastSeen = device.lastSeenAt?.toDate();
  const { online, updatePending } = health;
  const skew = clockSkew(device);
  const page = device.page && PAGE_NAMES[device.page];

  const details: [string, string | null | undefined][] = [
    ['Build', device.buildId ? shortBuild(device.buildId) : 'Local build'],
    ['Waiting to load', device.updateTargetBuildId && shortBuild(device.updateTargetBuildId)],
    ['Last update reload', formatTime(device.lastReloadAttemptAt)],
    ['Showing', [page, device.sheetId && (sheetName(device.sheetId) ?? 'a removed sheet')].filter(Boolean).join(' · ')],
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
  ];

  return (
    <>
      <div className={common.rowMeta}>
        {device.appVersion && (
          <span className={common.versionChip} title={device.buildId && `Build ${shortBuild(device.buildId)}`}>
            v{device.appVersion}
          </span>
        )}
        {/* Screens are switched off between events, so this is no warning. */}
        {online && lastSeen ? (
          <span className={common.onlineChip}>Online · seen {formatAgo(lastSeen, now)}</span>
        ) : (
          <span className={common.idleChip}>Not open{lastSeen ? ` · last seen ${formatAgo(lastSeen, now)}` : ''}</span>
        )}
        {updatePending && (
          <span
            className={common.warningChip}
            title={
              device.page === 'bug'
                ? 'A newer version is deployed. The score bug loads it between games, or when it is next opened.'
                : 'A newer version is deployed. The screen loads it shortly, or when it is next opened.'
            }
          >
            Update pending
          </span>
        )}
        {skew && <span className={common.warningChip}>Clock {skew}</span>}
      </div>
      <DeviceDetails details={details} />
    </>
  );
}

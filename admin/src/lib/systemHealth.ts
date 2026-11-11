// How every club's scoreboards and screens are doing, for the super admin's
// overview, and the plain text report copied from a club's Sheets page.

import { clockSkew, deviceHealth, shortBuild } from './deviceHealth.ts';
import { activeLiveGame } from './liveGame.ts';
import type { Club, DisplayLink, Sheet } from '../types';

/** A sheet, with the club it belongs to. */
export interface ClubSheet extends Sheet {
  clubId: string;
}

/** A display link, with the club it belongs to. */
export interface ClubDisplay extends DisplayLink {
  clubId: string;
}

/** The builds every scoreboard and screen should end up running. */
export interface DeployedBuilds {
  scoreboard: string | null;
  displays: string | null;
}

export interface ClubHealth {
  sheets: number;
  /** Paired and reporting. */
  online: number;
  /** Paired, but offline or never reported. */
  offline: number;
  unpaired: number;
  /** Online, on an older build than the one deployed. */
  updatePending: number;
  syncErrors: number;
  /** Sheets with a game being played on them now. */
  live: number;
  /** Display links with a screen open on them now. */
  screensOpen: number;
}

const empty = (): ClubHealth => ({
  sheets: 0, online: 0, offline: 0, unpaired: 0, updatePending: 0, syncErrors: 0, live: 0, screensOpen: 0,
});

/** Each club's counts, by club ID, and the totals across every club. */
export function systemHealth(
  sheets: ClubSheet[],
  displays: ClubDisplay[],
  deployed: DeployedBuilds,
  now: number,
): { byClub: Map<string, ClubHealth>; total: ClubHealth } {
  const byClub = new Map<string, ClubHealth>();
  const total = empty();
  const countsFor = (clubId: string) => {
    if (!byClub.has(clubId)) byClub.set(clubId, empty());
    return byClub.get(clubId)!;
  };
  const add = (clubId: string, key: keyof ClubHealth) => {
    countsFor(clubId)[key]++;
    total[key]++;
  };

  for (const sheet of sheets) {
    add(sheet.clubId, 'sheets');
    if (activeLiveGame(sheet.liveGame, now)) add(sheet.clubId, 'live');
    if (!sheet.scoreboardUid) {
      add(sheet.clubId, 'unpaired');
      continue;
    }
    const health = deviceHealth(sheet.device, deployed.scoreboard, now);
    add(sheet.clubId, health?.online ? 'online' : 'offline');
    // One that is offline is counted as that, not as behind too.
    if (health?.online && health.updatePending) add(sheet.clubId, 'updatePending');
    if (health?.recentSyncError) add(sheet.clubId, 'syncErrors');
  }
  for (const link of displays) {
    countsFor(link.clubId);
    if (deviceHealth(link.device, deployed.displays, now)?.online) add(link.clubId, 'screensOpen');
  }
  return { byClub, total };
}

export type ProblemKind = 'syncError' | 'offline' | 'updatePending' | 'clock';

/** Something on one device worth a look. */
export interface Problem {
  clubId: string;
  kind: ProblemKind;
  /** "Sheet 3", or a display link's label. */
  where: string;
  device: 'scoreboard' | 'screen';
  /** More about it: the error, the build, how far the clock is out. */
  detail: string | null;
  /** When it was last heard from, or when the error happened. */
  since: Date | null;
}

const RANK: Record<ProblemKind, number> = { syncError: 0, offline: 1, updatePending: 2, clock: 3 };

/**
 * Everything that needs a look, worst first. A paired scoreboard that is
 * offline is one; a screen that is closed is not, since screens are
 * switched off between events, but one open on an old build is.
 */
export function problems(
  sheets: ClubSheet[],
  displays: ClubDisplay[],
  deployed: DeployedBuilds,
  now: number,
): Problem[] {
  const found: Problem[] = [];
  for (const sheet of sheets) {
    if (!sheet.scoreboardUid) continue;
    const device = sheet.device;
    const health = deviceHealth(device, deployed.scoreboard, now);
    const base = { clubId: sheet.clubId, where: sheet.name, device: 'scoreboard' as const };
    const lastSeen = device?.lastSeenAt?.toDate() ?? null;
    if (health?.recentSyncError && device?.lastSyncError) {
      found.push({
        ...base, kind: 'syncError',
        detail: `${device.lastSyncError.operation}: ${device.lastSyncError.message}`,
        since: device.lastSyncError.at.toDate(),
      });
    }
    if (!health?.online) {
      found.push({ ...base, kind: 'offline', detail: health ? null : 'Never reported', since: lastSeen });
      continue;
    }
    if (health.updatePending) {
      found.push({ ...base, kind: 'updatePending', detail: device?.buildId ? `On ${shortBuild(device.buildId)}` : null, since: lastSeen });
    }
    const skew = device && clockSkew(device);
    if (skew) found.push({ ...base, kind: 'clock', detail: `Clock ${skew}`, since: lastSeen });
  }
  for (const link of displays) {
    const health = deviceHealth(link.device, deployed.displays, now);
    if (!health?.online || !health.updatePending) continue;
    found.push({
      clubId: link.clubId, kind: 'updatePending', where: link.label, device: 'screen',
      detail: link.device?.buildId ? `On ${shortBuild(link.device.buildId)}` : null,
      since: link.device?.lastSeenAt?.toDate() ?? null,
    });
  }
  return found.sort((a, b) =>
    RANK[a.kind] - RANK[b.kind] || (b.since?.getTime() ?? 0) - (a.since?.getTime() ?? 0) || a.where.localeCompare(b.where),
  );
}

/** Clubs whose name or ID holds [term], those starting with it first. */
export function matchClubs<T extends Pick<Club, 'id' | 'name'>>(clubs: T[], term: string): T[] {
  const t = term.trim().toLowerCase();
  const sorted = [...clubs].sort((a, b) => a.name.localeCompare(b.name));
  if (!t) return sorted;
  const starts = (c: T) => c.name.toLowerCase().startsWith(t) || c.id.startsWith(t);
  return sorted
    .filter((c) => c.name.toLowerCase().includes(t) || c.id.includes(t))
    .sort((a, b) => Number(starts(b)) - Number(starts(a)));
}

export interface DeviceReportInput {
  club: Pick<Club, 'id' | 'name'>;
  sheets: Sheet[];
  displays: DisplayLink[];
  deployed: DeployedBuilds;
  now: Date;
  /** What the club's API, public page and webhook are doing; null when not known. */
  apiEnabled: boolean | null;
  publicPage: boolean | null;
  webhook: { at: Date; ok: boolean; status?: number; error?: string } | null;
}

const when = (date: Date | null | undefined) => (date ? date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never');

/** A plain text summary of a club's devices, to paste into an issue or a
 *  message. Times are in UTC, so whoever reads it reads the same thing. */
export function deviceReport(input: DeviceReportInput): string {
  const { club, deployed, now } = input;
  const at = now.getTime();
  const sorted = [...input.sheets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const lines = [
    `${club.name} (${club.id}), ${when(now)}`,
    `Deployed builds: scoreboard ${deployed.scoreboard ? shortBuild(deployed.scoreboard) : 'unknown'}, displays ${deployed.displays ? shortBuild(deployed.displays) : 'unknown'}`,
    '',
    'Scoreboards',
  ];
  for (const sheet of sorted) {
    if (!sheet.scoreboardUid) {
      lines.push(`- ${sheet.name}: no scoreboard`);
      continue;
    }
    const device = sheet.device;
    const health = deviceHealth(device, deployed.scoreboard, at);
    const parts = [
      health ? (health.online ? 'online' : 'offline') : 'never reported',
      device?.appVersion && `v${device.appVersion}`,
      device?.buildId && `build ${shortBuild(device.buildId)}`,
      health?.updatePending && 'update pending',
      [device?.platform, device?.renderer].filter(Boolean).join(' ') || null,
      device && clockSkew(device) && `clock ${clockSkew(device)}`,
      health && `seen ${when(device?.lastSeenAt?.toDate())}`,
    ].filter(Boolean);
    lines.push(`- ${sheet.name}: ${parts.join(', ')}`);
    if (device?.lastSyncError) {
      const e = device.lastSyncError;
      lines.push(`  last sync error ${when(e.at.toDate())}: ${e.operation}: ${e.message}`);
    }
  }
  if (sorted.length === 0) lines.push('- no sheets');

  lines.push('', 'Screens');
  for (const link of [...input.displays].sort((a, b) => a.label.localeCompare(b.label))) {
    const device = link.device;
    const health = deviceHealth(device, deployed.displays, at);
    const parts = [
      health ? (health.online ? 'open' : 'not open') : 'never reported',
      device?.page,
      device?.buildId && `build ${shortBuild(device.buildId)}`,
      health?.online && health.updatePending && 'update pending',
      health && `seen ${when(device?.lastSeenAt?.toDate())}`,
    ].filter(Boolean);
    lines.push(`- ${link.label}: ${parts.join(', ')}`);
  }
  if (input.displays.length === 0) lines.push('- no display links');

  const onOff = (value: boolean | null) => (value === null ? 'unknown' : value ? 'on' : 'off');
  const hook = input.webhook;
  lines.push(
    '',
    `REST API: ${onOff(input.apiEnabled)}`,
    `Public scores page: ${onOff(input.publicPage)}`,
    `Webhook: ${hook ? `last post ${hook.ok ? 'worked' : 'failed'}${hook.status ? ` (${hook.status})` : ''} ${when(hook.at)}${hook.error ? `: ${hook.error}` : ''}` : 'no posts yet'}`,
  );
  return lines.join('\n');
}

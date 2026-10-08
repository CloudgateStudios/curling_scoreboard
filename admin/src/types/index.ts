import type { Timestamp } from 'firebase/firestore';

export interface Club {
  id: string;
  name: string;
}

export interface Sheet {
  id: string;
  name: string;
  scoreboardUid?: string;
  pairingCode?: string;
  /** When the current scoreboard paired. Absent for sheets paired before
   *  this was recorded. */
  pairedAt?: Timestamp;
  liveGame?: LiveGame;
  device?: DeviceStatus;
}

/** What the paired scoreboard last said about itself. All of it is
 *  self-reported by the app, and older app versions send none of it, so
 *  every field is optional. */
export interface DeviceStatus {
  appVersion?: string;
  /** Commit the app was built from. Absent on local builds. */
  buildId?: string;
  platform?: string;
  /** Web only: 'wasm', or 'js' when the browser could not run WebAssembly. */
  renderer?: string;
  userAgent?: string;
  screen?: { width: number; height: number; pixelRatio: number };
  timezone?: string;
  utcOffsetMinutes?: number;
  /** Set by the server on every report, unlike the other times here. */
  lastSeenAt?: Timestamp;
  /** The scoreboard's own clock at the moment of the report. */
  clientTime?: Timestamp;
  sessionStartedAt?: Timestamp;
  /** A deployed build the scoreboard knows about but has not loaded yet. */
  updateTargetBuildId?: string;
  lastReloadAttemptAt?: Timestamp;
  lastSyncError?: { operation: string; message: string; at: Timestamp };
}

export interface LiveGame {
  currentEnd: number;
  team1: { name: string; score: number; hasHammer: boolean };
  team2: { name: string; score: number; hasHammer: boolean };
}

export type TeamSlot = 'team1' | 'team2';

export interface GameEnd {
  endNumber: number;
  /** Display name of the scoring team. Ambiguous when both teams share a
   *  name, so prefer scoringTeamSlot when it is present. */
  scoringTeam: string | null;
  /** Unambiguous slot. Absent on games saved before slots were recorded. */
  scoringTeamSlot?: TeamSlot | null;
  score: number;
  gameTimeInSeconds: number;
}

export interface Game {
  id: string;
  startedAt: Date;
  finishedAt: Date;
  numberOfEnds: number;
  team1: { name: string; totalScore: number; hadLastStoneFirstEnd: boolean };
  team2: { name: string; totalScore: number; hadLastStoneFirstEnd: boolean };
  ends: GameEnd[];
}

export type UserRole = 'superadmin' | 'clubadmin' | null;

export interface AuthUser {
  uid: string;
  email: string | null;
  role: UserRole;
  clubId: string | null;
}

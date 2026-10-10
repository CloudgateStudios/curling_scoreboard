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

/** One color of rocks: what it is called and how it is drawn. */
export interface RockColor {
  name: string;
  /** `#RRGGBB` */
  hex: string;
}

/** The two colors of rocks a club plays with. Team 1 throws `team1`. */
export interface RockColors {
  team1: RockColor;
  team2: RockColor;
}

export interface LiveGame {
  /** Server time of the scoreboard's last write. Absent on live games written
   *  before it was recorded. */
  updatedAt?: Timestamp | null;
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
  /** Absent on games that were not league games, and on games saved before
   *  league games existed. */
  league?: { id: string; name: string } | null;
  team1: GameTeam;
  team2: GameTeam;
  ends: GameEnd[];
}

export interface GameTeam {
  name: string;
  totalScore: number;
  hadLastStoneFirstEnd: boolean;
  /** The rocks the team threw. Absent on games saved before rock colors. */
  color?: RockColor;
  /** The team's ID in the club's league software, for league games. */
  externalId?: string;
}

/** One regular time a league plays, in the club's local time. */
export interface LeagueDraw {
  /** 1 (Monday) to 7 (Sunday). */
  day: number;
  /** 24 hour `HH:mm`. */
  start: string;
  end: string;
}

export interface LeagueTeam {
  /** Stable across renames and imports, so games can refer to the team. */
  id: string;
  name: string;
  /** The team's ID in the club's own league software, for reporting scores. */
  externalId?: string;
}

/** A league and the teams in it, which scoreboards offer when a game is
 *  started as a league game. */
export interface League {
  id: string;
  name: string;
  /** Inactive leagues are kept but not offered on scoreboards. */
  active: boolean;
  /** `YYYY-MM-DD`, inclusive. Absent means no limit on that side. */
  seasonStart?: string;
  seasonEnd?: string;
  draws: LeagueDraw[];
  teams: LeagueTeam[];
}

export type UserRole = 'superadmin' | 'clubadmin' | null;

export interface AuthUser {
  uid: string;
  email: string | null;
  role: UserRole;
  clubId: string | null;
}

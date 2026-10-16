import type { Timestamp } from 'firebase/firestore';
import type { DisplaySettings } from '../lib/displayLinks';

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
  /** How posting the game to the club's webhook went. Absent when it was not
   *  posted: no webhook was set, or the game was filtered out. */
  webhook?: GameWebhook;
}

export interface GameWebhook {
  attemptedAt: Timestamp;
  /** Absent if the post never finished. */
  ok?: boolean;
  /** The receiver's HTTP status, when it answered at all. */
  status?: number;
  error?: string;
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

/** Club admins manage their club. Bonspiel admins only see its sheets and
 *  games, and its bonspiels. */
export type ClubUserRole = 'clubadmin' | 'bonspieladmin';

export type UserRole = 'superadmin' | ClubUserRole | null;

/** Someone who can sign in to the portal for a club. */
export interface ClubUser {
  uid: string;
  email: string;
  displayName: string | null;
  role: ClubUserRole;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  role: UserRole;
  clubId: string | null;
}

/** Which completed games a club's webhook is sent. */
export type WebhookGames = 'all' | 'league';

/** How the last post to a club's webhook went, as the functions record it. */
export interface WebhookStatus {
  at: Date;
  kind: 'game' | 'test';
  ok: boolean;
  // The receiver's HTTP status, when it answered at all.
  status?: number;
  error?: string;
}

/** A link a club's score bug or warm room screen signs in with. */
export interface DisplayLink {
  id: string;
  label: string;
  /** What goes in the link's URL. Absent on links made before it was kept,
   *  until they are given a new URL. */
  token?: string;
  /** What the link's screens show; the warm room's totals when absent. */
  settings?: DisplaySettings;
  createdAt?: Timestamp;
  /** Updated at most hourly, when a display starts with the link. */
  lastUsedAt?: Timestamp;
}

/** A part of a bonspiel with its own final and winner: "A Event", "Pool 2". */
export interface BonspielEvent {
  id: string;
  name: string;
  /** For this event's games, in place of the bonspiel's. */
  numberOfEnds?: number;
}

export interface BonspielTeam {
  /** Stable across renames, so games can refer to the team. */
  id: string;
  name: string;
  externalId?: string;
}

export interface BonspielDraw {
  id: string;
  label: string;
  /** `YYYY-MM-DDTHH:mm` in the club's local time, as a datetime-local input
   *  gives it. */
  start: string;
}

/** Where one side of a game gets its team: placed in the plan, out of an
 *  earlier game, or not decided yet. */
export type BonspielSide =
  | { teamId: string }
  | { from: string; result: 'winner' | 'loser' }
  | null;

export interface BonspielGame {
  /** Random and never shown, so the label can change without breaking the
   *  games that come from this one. */
  id: string;
  /** What everyone calls the game: "A7". */
  label: string;
  drawId: string;
  sheetId: string;
  eventId: string;
  /** Throws the first rock color. */
  team1: BonspielSide;
  team2: BonspielSide;
  /** Set by the coordinator, and wins over a scoreboard's result. */
  result?: { winner: TeamSlot; team1Score?: number; team2Score?: number };
}

/** A bonspiel's plan, which its coordinators write. */
export interface Bonspiel {
  id: string;
  name: string;
  /** Inactive bonspiels are kept but not offered on scoreboards. */
  active: boolean;
  /** `YYYY-MM-DD`, inclusive. */
  startDate: string;
  endDate: string;
  numberOfEnds: number;
  events: BonspielEvent[];
  teams: BonspielTeam[];
  draws: BonspielDraw[];
  games: BonspielGame[];
}

/** A team in a game of a bonspiel, as far as the functions know. */
export interface BonspielStateTeam {
  /** Absent when a scoreboard recorded a team the plan does not have. */
  teamId?: string;
  name: string;
}

/** One game as the functions work it out from the plan and the results. */
export interface BonspielStateGame {
  status: 'waiting' | 'ready' | 'final';
  team1: BonspielStateTeam | null;
  team2: BonspielStateTeam | null;
  team1Score?: number;
  team2Score?: number;
  winner?: TeamSlot;
  /** A result with no winner, which a game others come from cannot have. */
  tied?: true;
  resultFrom?: 'coordinator' | 'scoreboard';
  sheetId?: string;
  sheetGameId?: string;
}

/** A bonspiel's state/current document, written only by the functions. */
export interface BonspielState {
  games: Record<string, BonspielStateGame>;
  events: Record<string, { finalGameId?: string; winner?: BonspielStateTeam }>;
}

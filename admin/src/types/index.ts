export interface Club {
  id: string;
  name: string;
  apiKey: string;
}

export interface Sheet {
  id: string;
  name: string;
  scoreboardUid?: string;
  pairingCode?: string;
  liveGame?: LiveGame;
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

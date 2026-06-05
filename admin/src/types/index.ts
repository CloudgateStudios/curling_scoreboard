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

export interface Game {
  id: string;
  startedAt: Date;
  finishedAt: Date;
  numberOfEnds: number;
  team1: { name: string; totalScore: number; hadLastStoneFirstEnd: boolean };
  team2: { name: string; totalScore: number; hadLastStoneFirstEnd: boolean };
  ends: Array<{
    endNumber: number;
    scoringTeam: 1 | 2 | null;
    score: number;
    gameTimeInSeconds: number;
  }>;
}

export type UserRole = 'superadmin' | 'clubadmin' | null;

export interface AuthUser {
  uid: string;
  email: string | null;
  role: UserRole;
  clubId: string | null;
}

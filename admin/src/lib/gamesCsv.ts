import type { Game, TeamSlot } from '../types';
import { endScoredBy } from './gameEnds.ts';

/** A completed game and the sheet it was played on. */
export interface ExportedGame extends Game {
  sheetName: string;
}

function cell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` in the viewer's time zone, which sorts and that spreadsheets read as a date. */
function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The points [slot] scored in each end: a number, or empty for a blank end. */
function endPoints(game: Game, slot: TeamSlot): string[] {
  return game.ends.map((end) => {
    if (endScoredBy(end, slot, game)) return String(end.score);
    const blank = end.scoringTeamSlot == null && end.scoringTeam == null;
    return blank ? '' : '0';
  });
}

/** Games as a spreadsheet, oldest first: one row per game with each team's
 *  total and points per end, for keeping league standings. */
export function gamesCsv(games: ExportedGame[]): string {
  const sorted = [...games].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const endCount = Math.max(0, ...sorted.map((game) => game.ends.length));
  const endHeaders = Array.from({ length: endCount }, (_, i) => i + 1);

  const header = [
    'Date', 'Started', 'Finished', 'Sheet', 'League',
    'Team 1', 'Team 1 Color', 'Team 1 External ID', 'Team 1 Score',
    'Team 2', 'Team 2 Color', 'Team 2 External ID', 'Team 2 Score',
    'Winner', 'Ends Played',
    ...endHeaders.map((n) => `Team 1 End ${n}`),
    ...endHeaders.map((n) => `Team 2 End ${n}`),
  ];

  const rows = sorted.map((game) => {
    const { team1, team2 } = game;
    const winner =
      team1.totalScore > team2.totalScore ? team1.name
        : team2.totalScore > team1.totalScore ? team2.name
          : 'Tie';
    const ends = (slot: TeamSlot) => {
      const points = endPoints(game, slot);
      return endHeaders.map((_, i) => points[i] ?? '');
    };
    return [
      localDate(game.startedAt), localTime(game.startedAt), localTime(game.finishedAt),
      game.sheetName, game.league?.name ?? '',
      team1.name, team1.color?.name ?? '', team1.externalId ?? '', team1.totalScore,
      team2.name, team2.color?.name ?? '', team2.externalId ?? '', team2.totalScore,
      winner, game.ends.length,
      ...ends('team1'), ...ends('team2'),
    ];
  });

  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Hands [csv] to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
  // The byte order mark tells Excel the file is UTF-8, so names keep their accents.
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A filename for games from [from] to [to], e.g. `granite-games-2026-10-03-to-2026-10-09.csv`. */
export function gamesCsvFilename(prefix: string, from: Date, to: Date): string {
  const slug = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'club';
  const start = localDate(from);
  const end = localDate(to);
  return `${slug}-games-${start === end ? start : `${start}-to-${end}`}.csv`;
}

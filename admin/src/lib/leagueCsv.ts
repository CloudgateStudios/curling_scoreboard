import type { League, LeagueDraw, LeagueTeam } from '../types';

// Importing leagues and their teams from a CSV file: one row per team, with
// the league's name and schedule repeated on each of its rows.
//
//   league,day,start,end,team,external_id
//   Monday Night,Mon,18:30,20:30,Team Smith,1042
//
// Only `league` and `team` are required. Nothing here touches Firestore, so
// the whole import can be previewed before anything is written.

export const CSV_COLUMNS = ['league', 'day', 'start', 'end', 'team', 'external_id'];

export const CSV_EXAMPLE = [
  'league,day,start,end,team,external_id',
  'Monday Night,Mon,18:30,20:30,Team Smith,1042',
  'Monday Night,Mon,18:30,20:30,Team Jones,1043',
  'Thursday Doubles,Thu,19:00,21:00,Stone Cold,',
].join('\n');

export interface CsvProblem {
  /** Line in the file, counting the header as line 1. */
  line: number;
  message: string;
}

export interface ParsedTeam {
  name: string;
  externalId?: string;
}

export interface ParsedLeague {
  name: string;
  draws: LeagueDraw[];
  teams: ParsedTeam[];
}

export interface ParsedCsv {
  leagues: ParsedLeague[];
  problems: CsvProblem[];
}

/** Splits CSV text into rows of cells. Handles quoted cells, doubled quotes
 *  inside them, and both kinds of line ending. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  // Spreadsheets like to start the file with a byte order mark.
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** 1 (Monday) to 7 (Sunday) from "Mon", "monday" or "1". */
export function parseDay(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (/^[1-7]$/.test(v)) return Number(v);
  const index = DAYS.findIndex((d) => v.length >= 3 && v.startsWith(d));
  return index === -1 ? null : index + 1;
}

/** 24 hour `HH:mm` from "18:30", "6:30 PM", "6pm" or "1830". */
export function parseTime(value: string): string | null {
  const match = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Reads the leagues and teams out of a CSV file. Rows with a problem are
 *  reported and left out; the rest are still usable. */
export function parseLeagueCsv(text: string): ParsedCsv {
  const rows = parseCsvRows(text);
  const problems: CsvProblem[] = [];
  if (rows.length === 0) {
    return { leagues: [], problems: [{ line: 1, message: 'The file is empty.' }] };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const column = (name: string) => header.indexOf(name);
  for (const required of ['league', 'team']) {
    if (column(required) === -1) {
      problems.push({ line: 1, message: `The header row has no "${required}" column.` });
    }
  }
  if (problems.length > 0) return { leagues: [], problems };

  const leagues = new Map<string, ParsedLeague>();
  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const cell = (name: string) => (column(name) === -1 ? '' : (row[column(name)] ?? '').trim());
    if (row.every((c) => c.trim() === '')) return;

    const leagueName = cell('league');
    const teamName = cell('team');
    if (!leagueName) return void problems.push({ line, message: 'No league name.' });
    if (!teamName) return void problems.push({ line, message: 'No team name.' });

    let draw: LeagueDraw | null = null;
    if (cell('day') || cell('start') || cell('end')) {
      const day = parseDay(cell('day'));
      const start = parseTime(cell('start'));
      const end = parseTime(cell('end'));
      if (day === null) return void problems.push({ line, message: `"${cell('day')}" is not a day of the week.` });
      if (start === null) return void problems.push({ line, message: `"${cell('start')}" is not a start time.` });
      if (end === null) return void problems.push({ line, message: `"${cell('end')}" is not an end time.` });
      if (end <= start) return void problems.push({ line, message: 'The draw ends before it starts.' });
      draw = { day, start, end };
    }

    const key = leagueName.toLowerCase();
    const league = leagues.get(key) ?? { name: leagueName, draws: [], teams: [] };
    leagues.set(key, league);

    if (draw && !league.draws.some((d) => d.day === draw.day && d.start === draw.start && d.end === draw.end)) {
      league.draws.push(draw);
    }

    // A team listed once per draw is still one team.
    if (league.teams.some((t) => t.name.toLowerCase() === teamName.toLowerCase())) return;
    const externalId = cell('external_id');
    league.teams.push({ name: teamName, ...(externalId ? { externalId } : {}) });
  });

  return { leagues: [...leagues.values()], problems };
}

export type ImportMode = 'merge' | 'replace';

export interface LeagueImportPlan {
  /** The existing league this updates, or null for a new league. */
  existingId: string | null;
  /** The league as it will be stored. */
  league: Omit<League, 'id'>;
  added: string[];
  renamed: { from: string; to: string }[];
  removed: string[];
  unchanged: number;
}

/**
 * Works out what importing `parsed` would do to the club's `existing`
 * leagues, without changing anything.
 *
 * Leagues match by name. Teams match by external ID when both sides have
 * one, otherwise by name, and keep their ID, so games already recorded
 * against a team still point at it. `merge` keeps teams the file does not
 * mention; `replace` drops them. A league's schedule is replaced only when
 * the file gives one. Leagues the file does not mention are left alone.
 */
export function planLeagueImport(
  existing: League[],
  parsed: ParsedLeague[],
  mode: ImportMode,
  newId: () => string,
): LeagueImportPlan[] {
  return parsed.map((incoming) => {
    const current = existing.find((l) => l.name.trim().toLowerCase() === incoming.name.toLowerCase());
    const currentTeams = current?.teams ?? [];
    const claimed = new Set<string>();
    const added: string[] = [];
    const renamed: { from: string; to: string }[] = [];
    let unchanged = 0;

    const teams: LeagueTeam[] = incoming.teams.map((team) => {
      const match =
        (team.externalId && currentTeams.find((t) => !claimed.has(t.id) && t.externalId === team.externalId)) ||
        currentTeams.find((t) => !claimed.has(t.id) && t.name.trim().toLowerCase() === team.name.toLowerCase());
      if (!match) {
        added.push(team.name);
        return { id: newId(), ...team };
      }
      claimed.add(match.id);
      const externalId = team.externalId ?? match.externalId;
      if (match.name !== team.name) renamed.push({ from: match.name, to: team.name });
      else if (externalId === match.externalId) unchanged++;
      return { id: match.id, name: team.name, ...(externalId ? { externalId } : {}) };
    });

    const leftOver = currentTeams.filter((t) => !claimed.has(t.id));
    const removed = mode === 'replace' ? leftOver.map((t) => t.name) : [];
    if (mode === 'merge') {
      teams.push(...leftOver);
      unchanged += leftOver.length;
    }

    return {
      existingId: current?.id ?? null,
      league: {
        name: current?.name ?? incoming.name,
        active: current?.active ?? true,
        seasonStart: current?.seasonStart,
        seasonEnd: current?.seasonEnd,
        draws: incoming.draws.length > 0 ? incoming.draws : (current?.draws ?? []),
        teams,
      },
      added,
      renamed,
      removed,
      unchanged,
    };
  });
}

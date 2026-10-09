import type { RockColor, RockColors } from '../types';

/** The colors offered for a club's rocks, chosen to read clearly on the
 *  scoreboard. A club can also pick a custom color of its own. */
export const ROCK_COLOR_PRESETS: RockColor[] = [
  { name: 'Red', hex: '#F44336' },
  { name: 'Yellow', hex: '#FFEB3B' },
  { name: 'Blue', hex: '#2196F3' },
  { name: 'Green', hex: '#4CAF50' },
  { name: 'Orange', hex: '#FF9800' },
  { name: 'Purple', hex: '#9C27B0' },
  { name: 'Pink', hex: '#E91E63' },
  { name: 'Grey', hex: '#9E9E9E' },
  { name: 'Black', hex: '#212121' },
];

/** What every scoreboard uses until a club chooses otherwise. They match the
 *  red and yellow built into the scoreboard app. */
export const DEFAULT_ROCK_COLORS: RockColors = {
  team1: ROCK_COLOR_PRESETS[0],
  team2: ROCK_COLOR_PRESETS[1],
};

/** Longest name the Firestore rules accept for a rock color. */
export const MAX_ROCK_COLOR_NAME_LENGTH = 20;

export function sameRockColor(a: RockColor, b: RockColor): boolean {
  return a.name === b.name && a.hex.toUpperCase() === b.hex.toUpperCase();
}

/** The preset [color] is, or undefined for a custom color. */
export function rockColorPreset(color: RockColor): RockColor | undefined {
  return ROCK_COLOR_PRESETS.find((preset) => sameRockColor(preset, color));
}

export function isDefaultRockColors(colors: RockColors): boolean {
  return (
    sameRockColor(colors.team1, DEFAULT_ROCK_COLORS.team1) &&
    sameRockColor(colors.team2, DEFAULT_ROCK_COLORS.team2)
  );
}

/** Reads the colors off a club's scoreboard config, falling back to the
 *  defaults when none are set or they are not in a shape we understand. */
export function rockColorsFrom(config: unknown): RockColors {
  const stored = (config as { rockColors?: Partial<RockColors> } | undefined)?.rockColors;
  const valid = (c: Partial<RockColor> | undefined): c is RockColor =>
    typeof c?.name === 'string' && typeof c?.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.hex);
  if (!valid(stored?.team1) || !valid(stored?.team2)) return DEFAULT_ROCK_COLORS;
  return { team1: stored.team1, team2: stored.team2 };
}

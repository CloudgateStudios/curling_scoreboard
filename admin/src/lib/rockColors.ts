import type { RockColor, RockColors } from '../types';

/** The colors a club can pick for its rocks. A fixed list, so every choice
 *  is one that reads clearly on the scoreboard. */
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

export function isDefaultRockColors(colors: RockColors): boolean {
  return (
    colors.team1.hex === DEFAULT_ROCK_COLORS.team1.hex &&
    colors.team2.hex === DEFAULT_ROCK_COLORS.team2.hex
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

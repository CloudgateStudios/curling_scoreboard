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

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Black or white, whichever the scoreboard draws on [hex]. Mirrors
 *  `RockColor.textColor` in the app, which uses Flutter's
 *  `ThemeData.estimateBrightnessForColor`. */
export function rockTextColor(hex: string): '#000000' | '#FFFFFF' {
  const [r, g, b] = channels(hex).map(linear);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) ** 2 > 0.15 ? '#000000' : '#FFFFFF';
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear);
  // sRGB to XYZ (D65), scaled to the reference white.
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

/** How different two colors look (CIE76 ΔE): about 2 is just noticeable,
 *  100 or more is black against white. */
export function rockColorDifference(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Below this the two teams' colors are easy to mix up across the rink.
 *  Every pair of presets clears it. */
export const MIN_ROCK_COLOR_DIFFERENCE = 25;

export function rockColorsTooSimilar(colors: RockColors): boolean {
  return rockColorDifference(colors.team1.hex, colors.team2.hex) < MIN_ROCK_COLOR_DIFFERENCE;
}

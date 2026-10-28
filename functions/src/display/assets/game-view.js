// What the display pages show about a game, and the one DOM helper they
// all use. Nothing here loads Firebase, so the scores page, which fetches
// plain JSON, can use it as well as the pages that sign in.

/**
 * True when a live game has played its ends and is not tied, so it is over
 * though nobody has tapped Finish Game yet. Mirrors isGameComplete in the
 * app's CurlingGame. Unknown for scoreboards that do not send their ends.
 */
export function isPlayedOut(game) {
  return Boolean(game.numberOfEnds && game.ends
    && game.ends.length >= game.numberOfEnds && game.team1.score !== game.team2.score);
}

/** What a display says about where a game is: the end, or Final. */
export function endLabel(view) {
  if (view.kind === 'final' || isPlayedOut(view.game)) return 'Final';
  const { currentEnd, numberOfEnds } = view.game;
  return numberOfEnds && currentEnd > numberOfEnds ? 'Extra end' : `End ${currentEnd}`;
}

/** Black or white, whichever reads better on the hex color. */
export function textColorOn(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return '#fff';
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#111' : '#fff';
}

/** Creates an element with a class and, optionally, its text. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

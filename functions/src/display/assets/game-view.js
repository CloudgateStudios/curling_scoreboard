// What the display pages show about a game, and the DOM helpers they share.
// Nothing here loads Firebase, so the scores page, which fetches
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

/**
 * The first end a finished game never played, when the teams shook hands
 * before its ends were up, or null. Those ends are marked X, as on a paper
 * scoreboard. [kind] is the sheet view's: a live game has not ended, however
 * far behind one team is. A game with no ends recorded is left alone.
 */
export function firstUnplayedEnd(game, kind) {
  if (kind !== 'final' || !game.numberOfEnds || !game.ends?.length) return null;
  const played = Math.max(...game.ends.map((end) => end.endNumber));
  return played < game.numberOfEnds ? played + 1 : null;
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

// Ends a game shows before it is played, when it does not say how many.
const DEFAULT_ENDS = 8;

function endCell(end, slot, isCurrent, unplayed) {
  const cell = el('span', isCurrent ? 'cell current' : 'cell');
  if (unplayed) {
    cell.classList.add('unplayed');
    cell.textContent = 'X';
    return cell;
  }
  if (!end) return cell;
  const scored = end.scoringTeamSlot === slot && end.score > 0;
  cell.textContent = scored ? String(end.score) : '0';
  if (scored) cell.classList.add('scored');
  return cell;
}

/**
 * The game end by end, as a grid: a column per end, the scoring team's
 * points on its rock color and 0 for the other team, as on the scoreboard
 * itself, then the totals. The end being played is picked out, and the ends
 * of a game that finished early are marked X. [corner] goes
 * above the team names. The warm room's full view and the linescore page
 * both draw it, each sizing it in its own stylesheet.
 */
export function lineScore(game, view, changedSlots, corner = el('span', 'corner')) {
  const ends = game.ends ?? [];
  // The end being played, if there is one: a game played out has none left.
  const live = view.kind === 'live' && !isPlayedOut(game);
  const played = Math.max(0, ...ends.map((end) => end.endNumber));
  const columns = Math.max(game.numberOfEnds ?? DEFAULT_ENDS, played, live ? game.currentEnd : 0);
  const byNumber = new Map(ends.map((end) => [end.endNumber, end]));
  const unplayedFrom = firstUnplayedEnd(game, view.kind) ?? Infinity;

  const table = el('div', 'line-score');
  table.style.gridTemplateColumns = `minmax(0, 1fr) repeat(${columns}, var(--cell)) var(--total)`;
  table.style.setProperty('--columns', String(columns));
  table.append(corner);
  for (let n = 1; n <= columns; n++) {
    const head = el('span', 'end-head', String(n));
    if (live && n === game.currentEnd) head.classList.add('current');
    table.append(head);
  }
  table.append(el('span', 'end-head', 'T'));

  for (const slot of ['team1', 'team2']) {
    const team = game[slot];
    const hex = team.color?.hex ?? '#666666';
    const label = el('span', 'team-label');
    const swatch = el('span', 'swatch');
    swatch.style.background = hex;
    const hammer = el('span', 'hammer');
    hammer.title = 'Hammer';
    hammer.classList.toggle('off', !live || team.hasHammer !== true);
    label.append(swatch, el('span', 'name', team.name), hammer);
    table.append(label);
    for (let n = 1; n <= columns; n++) {
      const cell = endCell(byNumber.get(n), slot, live && n === game.currentEnd, n >= unplayedFrom);
      if (cell.classList.contains('scored')) {
        cell.style.background = hex;
        cell.style.color = textColorOn(hex);
      }
      table.append(cell);
    }
    const total = el('span', changedSlots.has(slot) ? 'total changed' : 'total', String(team.score));
    total.style.background = hex;
    total.style.color = textColorOn(hex);
    table.append(total);
  }
  return table;
}

/**
 * Makes [node]'s text smaller, down to [minShrink] of its size in the
 * stylesheet, until it fits its box, before it is cut short. Text width grows
 * with its size, so a step or two finds the size that fits; more than one,
 * since system fonts draw small text a little wider. The text is measured
 * itself, since scrollWidth rounds to whole pixels and an ellipsis shows for
 * less. Needs the node shown, to measure.
 */
export function fitText(node, minShrink) {
  node.style.fontSize = '';
  const style = getComputedStyle(node);
  const room = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const full = parseFloat(style.fontSize);
  const range = document.createRange();
  range.selectNodeContents(node);
  let size = full;
  for (let step = 0; step < 3; step++) {
    const width = range.getBoundingClientRect().width;
    if (width <= room || size <= full * minShrink) return;
    size = Math.max(size * (room / width) * 0.98, full * minShrink);
    node.style.fontSize = `${size}px`;
  }
}

// The warm room screen: every sheet at the club with its teams, rock colors
// and scores, for a TV left on in the club. The sheets are laid out to fill
// the screen at whatever size it is, without scrolling.
//
// Options, in the query string:
//   view=totals        each game's total scores (the default)
//   view=full          each game end by end, like a scoreboard
//   view=cycle         the two in turn
//   every=20           with view=cycle, seconds on each, from 5 to 300

import {
  STATUS_MESSAGES, connect, el, endLabel, followLink, followsLink, isPlayedOut, now, sheetView,
  textColorOn,
} from './display.js';

// Width over height of a sheet's card, which the layout keeps to as closely
// as the screen allows. The full view is a wide, short line score, so it
// asks for wider cards, which leaves the team names room beside the ends.
const CARD_ASPECT = { totals: 1.6, full: 2.0 };
const GAP_PX = 16;

const params = new URLSearchParams(location.search);
const viewOption = ['totals', 'full', 'cycle'].includes(params.get('view')) ? params.get('view') : 'totals';
const cycleMs = Math.min(Math.max(Number(params.get('every')) || 20, 5), 300) * 1000;
// What is on screen now; only changes by itself with view=cycle.
let currentView = viewOption === 'full' ? 'full' : 'totals';

// Ends a game shows before it is played, when it does not say how many.
const DEFAULT_ENDS = 8;

const root = document.getElementById('display');
const header = el('header', 'top');
const brand = el('div', 'brand');
const logo = el('img', 'logo hidden');
logo.alt = '';
const DEFAULT_TITLE = 'Live Scores';
const title = el('h1', 'title', DEFAULT_TITLE);
brand.append(logo, title);
const clock = el('time', 'clock');
header.append(brand, clock);
const grid = el('div', 'grid');
const status = el('p', 'status hidden');
root.append(header, grid, status);

let summary = undefined;
let linkStatus = 'connecting';
// Each sheet's scores as last shown, so a change can be marked as it lands.
const shown = new Map();

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function teamRow(team, view, changed) {
  const hex = team.color?.hex ?? '#666666';
  const row = el('div', 'team');
  const swatch = el('span', 'swatch');
  swatch.style.background = hex;
  const name = el('span', 'name', team.name);
  const hammer = el('span', 'hammer');
  hammer.title = 'Hammer';
  // Hidden but kept in the grid, so the scores line up either way.
  hammer.classList.toggle('off', view.kind !== 'live' || team.hasHammer !== true);
  const score = el('span', changed ? 'score changed' : 'score', String(team.score));
  score.style.background = hex;
  score.style.color = textColorOn(hex);
  row.append(swatch, name, hammer, score);
  return row;
}

function endCell(end, slot, isCurrent) {
  const cell = el('span', isCurrent ? 'cell current' : 'cell');
  if (!end) return cell;
  const scored = end.scoringTeamSlot === slot && end.score > 0;
  cell.textContent = scored ? String(end.score) : '0';
  if (scored) cell.classList.add('scored');
  return cell;
}

// The game end by end: a column per end, the scoring team's points on its
// rock color and 0 for the other team, as on the scoreboard itself, then the
// totals. The end being played is picked out.
function lineScore(game, view, changedSlots) {
  const ends = game.ends ?? [];
  // The end being played, if there is one: a game played out has none left.
  const live = view.kind === 'live' && !isPlayedOut(game);
  const played = Math.max(0, ...ends.map((end) => end.endNumber));
  const columns = Math.max(game.numberOfEnds ?? DEFAULT_ENDS, played, live ? game.currentEnd : 0);
  const byNumber = new Map(ends.map((end) => [end.endNumber, end]));

  const table = el('div', 'line-score');
  table.style.gridTemplateColumns = `minmax(0, 1fr) repeat(${columns}, var(--cell)) var(--total)`;
  table.append(el('span', 'corner'));
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
      const cell = endCell(byNumber.get(n), slot, live && n === game.currentEnd);
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

function sheetCard(id, sheet, at) {
  const view = sheetView(sheet, at);
  const card = el('section', `sheet ${view.kind}`);
  const top = el('div', 'sheet-top');
  top.append(el('h2', 'sheet-name', sheet.name));
  if (view.kind !== 'idle') {
    const label = endLabel(view);
    top.append(el('span', 'state', label));
    // A game played out but not yet finished on the scoreboard looks final too.
    if (label === 'Final') card.classList.add('final');
  }
  card.append(top);

  if (view.kind === 'idle') {
    shown.delete(id);
    card.append(el('p', 'idle-text', 'No game'));
    return card;
  }

  const { game } = view;
  const key = view.kind === 'final' ? game.gameId : 'live';
  const before = shown.get(id);
  card.append(el('p', 'league', game.league?.name ?? game.bonspiel?.name ?? ''));
  const changedSlots = new Set(['team1', 'team2']
    .filter((slot) => before?.key === key && before[slot] !== game[slot].score));
  // A live game from a scoreboard that does not send its ends yet can only
  // be shown by its totals.
  if (currentView === 'full' && game.ends) {
    card.classList.add('full');
    card.append(lineScore(game, view, changedSlots));
  } else {
    // Sized to the full view's shorter cards when shown among them.
    if (currentView === 'full') card.classList.add('compact');
    for (const slot of ['team1', 'team2']) card.append(teamRow(game[slot], view, changedSlots.has(slot)));
  }
  shown.set(id, { key, team1: game.team1.score, team2: game.team2.score });
  return card;
}

// Picks the number of columns that makes the cards largest, then sizes
// everything in the cards from --u, a hundredth of a card's width.
function layout(count) {
  const width = grid.clientWidth;
  const height = grid.clientHeight;
  let best = { columns: 1, rows: 1, cardWidth: 0 };
  for (let columns = 1; columns <= Math.max(count, 1); columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (width - GAP_PX * (columns - 1)) / columns;
    const cellHeight = (height - GAP_PX * (rows - 1)) / rows;
    const cardWidth = Math.min(cellWidth, cellHeight * CARD_ASPECT[currentView]);
    if (cardWidth > best.cardWidth) best = { columns, rows, cardWidth };
  }
  grid.style.gridTemplateColumns = `repeat(${best.columns}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = `repeat(${best.rows}, minmax(0, 1fr))`;
  grid.style.setProperty('--u', `${best.cardWidth / 100}px`);
}

function showStatus(message) {
  status.textContent = message ?? '';
  status.classList.toggle('hidden', !message);
  grid.classList.toggle('hidden', Boolean(message));
}

function render() {
  const at = now();
  clock.textContent = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const message = STATUS_MESSAGES[linkStatus];
  if (message) {
    showStatus(message);
    return;
  }
  if (summary === undefined) return; // Still connecting: keep what is shown.

  const sheets = Object.entries(summary?.sheets ?? {})
    .sort(([, a], [, b]) => collator.compare(a.name, b.name));
  if (sheets.length === 0) {
    showStatus('No sheets yet.');
    return;
  }
  showStatus(null);
  grid.replaceChildren(...sheets.map(([id, sheet]) => sheetCard(id, sheet, at)));
  layout(sheets.length);
}

// The club's own title and logo, set in the admin portal. The logo is a data
// URL of a raster image, which the page's CSP allows and nothing else.
function showBranding(branding) {
  title.textContent = branding?.title || DEFAULT_TITLE;
  const src = typeof branding?.logo === 'string' && branding.logo.startsWith('data:image/') ? branding.logo : '';
  if (src) logo.src = src;
  else logo.removeAttribute('src');
  logo.classList.toggle('hidden', !src);
  document.title = branding?.title ? `${branding.title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE;
}

connect({
  // Opened from the display link's own URL: go wherever its settings say.
  onLink: followsLink ? followLink : undefined,
  onBranding: showBranding,
  onSummary: (next) => {
    summary = next;
    render();
  },
  onStatus: (next) => {
    linkStatus = next;
    render();
  },
});

window.addEventListener('resize', () => layout(grid.childElementCount));

// Hides the pointer after it has been still for a few seconds, and shows it
// again as soon as it moves, so it is there to use on a computer but does
// not sit over the scores on a TV.
const CURSOR_IDLE_MS = 3_000;
let cursorTimer = null;
function wakeCursor() {
  document.documentElement.classList.remove('cursor-idle');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.documentElement.classList.add('cursor-idle'), CURSOR_IDLE_MS);
}
for (const type of ['pointermove', 'pointerdown', 'keydown']) {
  window.addEventListener(type, wakeCursor, { passive: true });
}
wakeCursor();
// Keeps the clock right, and takes a final score down ten minutes after the
// game with no write to say so.
setInterval(render, 15_000);

if (viewOption === 'cycle') {
  setInterval(() => {
    currentView = currentView === 'full' ? 'totals' : 'full';
    render();
  }, cycleMs);
}

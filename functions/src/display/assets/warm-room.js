// The warm room screen: every sheet at the club with its teams, rock colors
// and scores, for a TV left on in the club. The sheets are laid out to fill
// the screen at whatever size it is, without scrolling.

import {
  STATUS_MESSAGES, connect, el, now, sheetView, textColorOn,
} from './display.js';

// Width over height of a sheet's card, which the layout keeps to as closely
// as the screen allows.
const CARD_ASPECT = 1.6;
const GAP_PX = 16;

const root = document.getElementById('display');
const header = el('header', 'top');
const title = el('h1', 'title', 'Live Scores');
const clock = el('time', 'clock');
header.append(title, clock);
const grid = el('div', 'grid');
const status = el('p', 'status hidden');
root.append(header, grid, status);

let summary = undefined;
let linkStatus = 'connecting';
// Each sheet's scores as last shown, so a change can be marked as it lands.
const shown = new Map();

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function endText(view) {
  if (view.kind === 'final') return 'Final';
  const { currentEnd, numberOfEnds } = view.game;
  return numberOfEnds && currentEnd > numberOfEnds ? 'Extra end' : `End ${currentEnd}`;
}

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

function sheetCard(id, sheet, at) {
  const view = sheetView(sheet, at);
  const card = el('section', `sheet ${view.kind}`);
  const top = el('div', 'sheet-top');
  top.append(el('h2', 'sheet-name', sheet.name));
  if (view.kind !== 'idle') top.append(el('span', 'state', endText(view)));
  card.append(top);

  if (view.kind === 'idle') {
    shown.delete(id);
    card.append(el('p', 'idle-text', 'No game'));
    return card;
  }

  const { game } = view;
  const key = view.kind === 'final' ? game.gameId : 'live';
  const before = shown.get(id);
  card.append(el('p', 'league', game.league?.name ?? ''));
  for (const slot of ['team1', 'team2']) {
    const changed = before?.key === key && before[slot] !== game[slot].score;
    card.append(teamRow(game[slot], view, changed));
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
    const cardWidth = Math.min(cellWidth, cellHeight * CARD_ASPECT);
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

connect({
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
// Keeps the clock right, and takes a final score down ten minutes after the
// game with no write to say so.
setInterval(render, 15_000);

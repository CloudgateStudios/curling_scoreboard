// The linescore: one sheet's game end by end, as a wide banner for an OBS
// browser source, to show across the stream between ends. It is the warm
// room's end by end view of a single sheet, so each sheet can have its own
// and a stream can show its sheet without waiting on the others.
//
// The page is transparent and the banner always the same size, 1600 by 360
// pixels at scale 1, so it can be placed in OBS at any time. While the sheet
// has no game it shows the sheet's name in the same space.
//
// Options, in the query string:
//   scale=1.5          size, from 0.5 to 4
//   label=league       what the corner above the names says: sheet
//                      (default), league, both (the league, then the sheet)
//                      or none. A league or bonspiel goes by its short name,
//                      if the club gave it one

import {
  STATUS_MESSAGES, config, connect, el, endLabel, followLink, followsLink, now, sheetView,
} from './display.js';
import { fitText, lineScore } from './game-view.js';

const params = new URLSearchParams(location.search);
const scale = Math.min(Math.max(Number(params.get('scale')) || 1, 0.5), 4);
const label = ['sheet', 'league', 'both', 'none'].includes(params.get('label')) ? params.get('label') : 'sheet';
document.documentElement.style.setProperty('--scale', String(scale));

// A name too long for its row is made smaller, down to this share of its
// size in the stylesheet, before it is cut short.
const MIN_NAME_SHRINK = 0.8;

const root = document.getElementById('display');
const card = el('div', 'linescore hidden');
const status = el('p', 'status hidden');
root.append(card, status);

let summary = undefined;
let linkStatus = 'connecting';
// The scores last shown, so a change can be marked as it lands.
let shown = null;
// Whether a game is on screen, which a reload onto a new version would
// blank on the stream for a moment.
let onAir = false;

// What the corner names: the sheet, the league or bonspiel, or both. A game
// with no league or bonspiel names just the sheet, either way.
function captionOf(sheet, game) {
  if (label === 'none') return '';
  if (label === 'sheet') return sheet.name;
  const nameOf = (event) => event && (event.shortName || event.name);
  const event = nameOf(game.league) ?? nameOf(game.bonspiel);
  if (!event) return sheet.name;
  return label === 'both' ? `${event} · ${sheet.name}` : event;
}

// Above the team names: the caption, and Final once the game is over. The
// end being played needs no label: the column is picked out, after the ends
// already scored.
function corner(sheet, view) {
  const box = el('div', 'corner');
  const text = captionOf(sheet, view.game);
  const caption = el('span', 'caption', text);
  caption.title = text;
  box.append(caption);
  if (endLabel(view) === 'Final') box.append(el('span', 'state final', 'Final'));
  return box;
}

function fitNames() {
  for (const name of card.querySelectorAll('.name')) fitText(name, MIN_NAME_SHRINK);
}

// And again when the page is laid out, as after the first render.
new ResizeObserver(fitNames).observe(card);

// An idle sheet: its name where the game goes, in a banner the size a
// game's will be.
function showIdle(sheet) {
  const idle = el('div', 'idle-card');
  const name = el('span', 'idle-sheet', sheet.name);
  name.title = sheet.name;
  idle.append(name, el('span', 'idle-note', 'No game right now'));
  card.replaceChildren(idle);
  card.classList.add('idle');
  card.classList.remove('hidden');
  fitText(name, MIN_NAME_SHRINK);
}

function showStatus(message) {
  status.textContent = message ?? '';
  status.classList.toggle('hidden', !message);
}

function render() {
  onAir = false;
  const message = STATUS_MESSAGES[linkStatus];
  if (message) {
    card.classList.add('hidden');
    showStatus(message);
    return;
  }
  if (summary === undefined) return; // Still connecting: keep what is shown.

  const sheet = summary?.sheets?.[config.sheetId];
  if (!sheet) {
    card.classList.add('hidden');
    showStatus(summary ? 'This sheet is not in the club\'s scores yet.' : null);
    return;
  }
  showStatus(null);

  const view = sheetView(summary, config.sheetId, now());
  if (view.kind === 'idle') {
    shown = null;
    showIdle(sheet);
    return;
  }

  const { game } = view;
  const key = view.kind === 'final' ? game.gameId : 'live';
  const changedSlots = new Set(['team1', 'team2']
    .filter((slot) => shown !== null && shown.key === key && shown[slot] !== game[slot].score));
  shown = { key, team1: game.team1.score, team2: game.team2.score };

  // A scoreboard that does not send its ends yet leaves the ends blank,
  // with the totals still shown.
  card.replaceChildren(lineScore(game, view, changedSlots, corner(sheet, view)));
  card.classList.remove('idle', 'hidden');
  onAir = true;
  fitNames();
}

connect({
  // Opened from the display link's own URL: go wherever its settings say.
  onLink: followsLink ? followLink : undefined,
  onSummary: (next) => {
    summary = next;
    render();
  },
  onStatus: (next) => {
    linkStatus = next;
    render();
  },
  // Only between games. Still connecting, a game may be about to show.
  readyToUpdate: () => summary !== undefined && !onAir,
});

// A final score is taken down ten minutes after the game ends, with no write
// to say so, and an abandoned game expires the same way.
setInterval(render, 15_000);

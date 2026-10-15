// The score bug: a sheet's two teams, their rock colors and scores, for an
// OBS browser source. The page is transparent, so it sits over the video
// without a chroma key, and it hides itself while the sheet has no game.
//
// Options, in the query string:
//   scale=1.5          size, from 0.5 to 4
//   label=league       what the bottom line names: sheet (default), league
//                      or none
//   preview            while setting up: show an outlined placeholder of the
//                      same size while the sheet has no game, instead of
//                      nothing, so the bug can be placed in OBS between draws

import {
  STATUS_MESSAGES, config, connect, el, endLabel, followLink, followsLink, now, sheetView,
  textColorOn,
} from './display.js';

const params = new URLSearchParams(location.search);
const scale = Math.min(Math.max(Number(params.get('scale')) || 1, 0.5), 4);
const label = ['sheet', 'league', 'none'].includes(params.get('label')) ? params.get('label') : 'sheet';
const preview = params.has('preview') && params.get('preview') !== '0';
document.documentElement.style.setProperty('--scale', String(scale));

const root = document.getElementById('display');
const bug = el('div', 'bug hidden');
const status = el('p', 'status hidden');
root.append(bug, status);

function teamRow() {
  const row = el('div', 'team');
  const stripe = el('span', 'stripe');
  const name = el('span', 'name');
  const hammer = el('span', 'hammer');
  hammer.title = 'Hammer';
  const score = el('span', 'score');
  row.append(stripe, name, hammer, score);
  return { row, stripe, name, hammer, score };
}

const rows = { team1: teamRow(), team2: teamRow() };
const footer = el('div', 'footer');
const footerLabel = el('span', 'label');
const footerEnd = el('span', 'end');
footer.append(footerLabel, footerEnd);
bug.append(rows.team1.row, rows.team2.row, footer);

let summary = undefined;
let linkStatus = 'connecting';
// The scores last shown, so a change can be marked as it lands.
let shown = null;

function labelText(sheet, view) {
  if (label === 'league') return view.game.league?.name ?? sheet.name;
  return label === 'sheet' ? sheet.name : '';
}

function showTeam(parts, team, view, changed) {
  const hex = team.color?.hex ?? '#666666';
  parts.stripe.style.background = hex;
  parts.name.textContent = team.name;
  parts.name.title = team.name;
  // Hidden but kept in the grid, so the scores line up either way.
  parts.hammer.classList.toggle('off', view.kind !== 'live' || team.hasHammer !== true);
  parts.score.textContent = String(team.score);
  parts.score.style.background = hex;
  parts.score.style.color = textColorOn(hex);
  if (changed) {
    parts.score.classList.remove('changed');
    // Restarts the animation when two changes come close together.
    void parts.score.offsetWidth;
    parts.score.classList.add('changed');
  }
}

// What an idle sheet shows with ?preview: the bug at its real size, faded
// and outlined, so it can be placed in OBS before a game starts.
function showPlaceholder(sheet) {
  for (const [slot, name] of [['team1', 'Team 1'], ['team2', 'Team 2']]) {
    const parts = rows[slot];
    parts.stripe.style.background = '';
    parts.name.textContent = name;
    parts.name.title = '';
    parts.hammer.classList.add('off');
    parts.score.textContent = '0';
    parts.score.style.background = '';
    parts.score.style.color = '';
    parts.score.classList.remove('changed');
  }
  footerLabel.textContent = label === 'none' ? '' : sheet.name;
  footerEnd.textContent = 'No game';
  bug.classList.remove('final');
  bug.classList.add('placeholder');
  bug.classList.remove('hidden');
}

function showStatus(message) {
  status.textContent = message ?? '';
  status.classList.toggle('hidden', !message);
}

function render() {
  const message = STATUS_MESSAGES[linkStatus];
  if (message) {
    bug.classList.add('hidden');
    showStatus(message);
    return;
  }
  if (summary === undefined) return; // Still connecting: keep what is shown.

  const sheet = summary?.sheets?.[config.sheetId];
  if (!sheet) {
    bug.classList.add('hidden');
    showStatus(summary ? 'This sheet is not in the club\'s scores yet.' : null);
    return;
  }
  showStatus(null);

  const view = sheetView(sheet, now());
  if (view.kind === 'idle') {
    shown = null;
    if (preview) showPlaceholder(sheet);
    else bug.classList.add('hidden');
    return;
  }
  bug.classList.remove('placeholder');

  const { game } = view;
  const key = view.kind === 'final' ? game.gameId : 'live';
  for (const slot of ['team1', 'team2']) {
    const changed = shown !== null && shown.key === key && shown[slot] !== game[slot].score;
    showTeam(rows[slot], game[slot], view, changed);
  }
  shown = { key, team1: game.team1.score, team2: game.team2.score };

  footerLabel.textContent = labelText(sheet, view);
  footerEnd.textContent = endLabel(view);
  bug.classList.toggle('final', footerEnd.textContent === 'Final');
  bug.classList.remove('hidden');
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
});

// A final score is taken down ten minutes after the game ends, with no write
// to say so, and an abandoned game expires the same way.
setInterval(render, 15_000);

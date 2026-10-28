// The public scores page: every sheet at the club, for members following
// along on their phones. There is no sign-in and no Firebase: the page polls
// live.json, which Hosting's CDN keeps for half a minute, so the club pays
// the same however many phones are watching. results.json and the logo are
// fetched again only when live.json says they have changed. See
// scores-model.js for how often it asks.
//
// Tap a game to see it end by end.

import { el, endLabel, isPlayedOut, textColorOn } from './game-view.js';
import { endedOffSchedule, todaysDraws, winnerOf } from './results-model.js';
import { asSummaryResults, isIdle, pollDelay, timeUntilDue } from './scores-model.js';

// Ends a game shows before it is played, when it does not say how many.
const DEFAULT_ENDS = 8;
const DEFAULT_TITLE = 'Live Scores';

// /display/{club}/scores/, whether or not the address ends in a slash.
const base = `${location.pathname.replace(/\/+$/, '')}/`;

const root = document.getElementById('display');
const header = el('header', 'top');
const logo = el('img', 'logo hidden');
logo.alt = '';
const heading = el('div', 'heading');
const title = el('h1', 'title', DEFAULT_TITLE);
const updated = el('p', 'updated');
heading.append(title, updated);
header.append(logo, heading);
const notice = el('p', 'notice hidden');
const paused = el('button', 'paused hidden', 'Paused to save data. Tap to keep following.');
paused.type = 'button';
const sheetsList = el('div', 'sheets');
const earlier = el('section', 'earlier hidden');
root.append(header, paused, notice, sheetsList, earlier);

let live = null;
let results = [];
let resultsVersion = null;
let status = 'loading';
let updatedAt = null;
let timer = null;
// A poll is under way. Another asked for meanwhile is left to it, so the
// two never both fetch results.json.
let polling = false;
let lastActiveAt = Date.now();
let isPaused = false;
// The sheets shown end by end, by ID.
const expanded = new Set();
// Each sheet's scores as last shown, so a change can be marked as it lands.
const shown = new Map();

const timeOf = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// Asks the browser to check its copy with the server, which answers 304
// when nothing has changed, so an unchanged poll costs only headers.
async function fetchJson(name) {
  const res = await fetch(`${base}${name}`, { cache: 'no-cache' });
  if (res.status === 404) return { off: true };
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return { json: await res.json() };
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(poll, ms);
}

async function poll() {
  clearTimeout(timer);
  if (polling || document.visibilityState === 'hidden') return;
  if (isIdle(lastActiveAt, Date.now())) {
    isPaused = true;
    render();
    return;
  }
  polling = true;
  try {
    const next = await fetchJson('live.json');
    if (next.off) {
      status = 'off';
      live = null;
    } else {
      live = next.json;
      status = 'ok';
      updatedAt = Date.now();
      if (live.resultsVersion !== resultsVersion) {
        const fetched = await fetchJson('results.json');
        results = fetched.off ? [] : asSummaryResults(fetched.json);
        resultsVersion = live.resultsVersion;
      }
    }
  } catch (err) {
    console.warn('Scores could not be fetched', err);
    status = 'offline';
  } finally {
    polling = false;
  }
  render();
  schedule(pollDelay(live));
}

function wake() {
  lastActiveAt = Date.now();
  if (!isPaused) return;
  isPaused = false;
  poll();
}

function swatch(hex) {
  const node = el('span', 'swatch');
  node.style.background = hex ?? '#666666';
  return node;
}

function teamRow(team, kind, changed) {
  const hex = team.color ?? '#666666';
  const row = el('div', 'team');
  const hammer = el('span', 'hammer');
  hammer.title = 'Hammer';
  hammer.classList.toggle('off', kind !== 'live' || team.hasHammer !== true);
  const score = el('span', changed ? 'score changed' : 'score', String(team.score));
  score.style.background = hex;
  score.style.color = textColorOn(hex);
  row.append(swatch(hex), el('span', 'name', team.name), hammer, score);
  return row;
}

// The game end by end, as on the warm room screen: the scoring team's
// points on its rock color and 0 for the other team, then the totals.
function lineScore(game, kind) {
  const ends = game.ends ?? [];
  const playing = kind === 'live' && !isPlayedOut(game);
  const played = Math.max(0, ...ends.map((end) => end.endNumber));
  const columns = Math.max(game.numberOfEnds ?? DEFAULT_ENDS, played, playing ? game.currentEnd : 0);
  const byNumber = new Map(ends.map((end) => [end.endNumber, end]));

  const table = el('div', 'line-score');
  table.style.gridTemplateColumns = `minmax(0, 1fr) repeat(${columns}, var(--cell)) var(--total)`;
  table.append(el('span', 'corner'));
  for (let n = 1; n <= columns; n++) {
    const head = el('span', 'end-head', String(n));
    if (playing && n === game.currentEnd) head.classList.add('current');
    table.append(head);
  }
  table.append(el('span', 'end-head', 'T'));

  for (const slot of ['team1', 'team2']) {
    const team = game[slot];
    const hex = team.color ?? '#666666';
    table.append(el('span', 'team-label', team.name));
    for (let n = 1; n <= columns; n++) {
      const end = byNumber.get(n);
      const cell = el('span', playing && n === game.currentEnd ? 'cell current' : 'cell');
      if (end) {
        const scored = end.scoringTeamSlot === slot && end.score > 0;
        cell.textContent = scored ? String(end.score) : '0';
        if (scored) {
          cell.classList.add('scored');
          cell.style.background = hex;
          cell.style.color = textColorOn(hex);
        }
      }
      table.append(cell);
    }
    const total = el('span', 'total', String(team.score));
    total.style.background = hex;
    total.style.color = textColorOn(hex);
    table.append(total);
  }
  return table;
}

function sheetCard(sheet) {
  const card = el('section', `sheet ${sheet.kind}`);
  const top = el('div', 'sheet-top');
  top.append(el('h2', 'sheet-name', sheet.name));

  if (sheet.kind === 'idle') {
    shown.delete(sheet.id);
    top.append(el('span', 'state', 'No game'));
    card.append(top);
    return card;
  }

  const { game } = sheet;
  const label = endLabel({ kind: sheet.kind, game });
  if (label === 'Final') card.classList.add('final');
  top.append(el('span', 'state', label));
  card.append(top);
  if (game.event) card.append(el('p', 'event', game.event));

  const key = `${sheet.kind}:${game.team1.name}:${game.team2.name}`;
  const before = shown.get(sheet.id);
  const changed = (slot) => before?.key === key && before[slot] !== game[slot].score;
  shown.set(sheet.id, { key, team1: game.team1.score, team2: game.team2.score });

  const teams = [teamRow(game.team1, sheet.kind, changed('team1')), teamRow(game.team2, sheet.kind, changed('team2'))];
  // A scoreboard that does not send its ends can only be shown by its totals.
  if (!game.ends) {
    card.append(...teams);
    return card;
  }
  const open = expanded.has(sheet.id);
  const toggle = el('button', 'teams');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', `${sheet.name}: ${open ? 'hide' : 'show'} the ends`);
  toggle.append(...teams);
  toggle.addEventListener('click', () => {
    if (expanded.has(sheet.id)) expanded.delete(sheet.id);
    else expanded.add(sheet.id);
    render();
  });
  card.append(toggle);
  if (open) card.append(lineScore(game, sheet.kind));
  return card;
}

// A sheet's name as short as it can be put beside a result: 'A' for
// 'Sheet A', and the whole name for anything else.
const shortSheetName = (name) => (name ?? '').replace(/^sheet\s+/i, '');

function resultRow(result) {
  const winner = winnerOf(result);
  const row = el('div', 'result');
  row.append(el('span', 'result-sheet', shortSheetName(result.sheetName)));
  for (const slot of ['team1', 'team2']) {
    const team = result[slot];
    const won = winner === slot ? ' won' : '';
    row.append(swatch(team.color?.hex), el('span', `result-name${won}`, team.name),
      el('span', `result-score${won}`, String(team.score)));
  }
  if (endedOffSchedule(result)) row.append(el('span', 'result-note', `Final after ${result.endsPlayed} ends`));
  return row;
}

function renderEarlier() {
  const draws = todaysDraws(results, Date.now());
  earlier.classList.toggle('hidden', draws.length === 0);
  if (draws.length === 0) {
    earlier.replaceChildren();
    return;
  }
  const children = [el('h2', 'earlier-title', 'Earlier today')];
  for (const draw of draws) {
    const head = el('div', 'draw-head');
    head.append(el('span', 'draw-time', timeOf(draw.start)), el('span', 'draw-names', draw.names.join(' · ')));
    children.push(head, ...draw.results.map(resultRow));
  }
  earlier.replaceChildren(...children);
}

function showNotice(message) {
  notice.textContent = message ?? '';
  notice.classList.toggle('hidden', !message);
}

// The club's title and logo, from the portal. The logo's URL changes with
// the logo, so the browser keeps each one for good.
function renderBranding() {
  title.textContent = live?.title || DEFAULT_TITLE;
  document.title = live?.title ? `${live.title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE;
  const src = live?.logo ? `${base}${live.logo}` : '';
  if (src && logo.getAttribute('src') !== src) logo.src = src;
  if (!src) logo.removeAttribute('src');
  logo.classList.toggle('hidden', !src);
}

function render() {
  paused.classList.toggle('hidden', !isPaused);
  updated.textContent = updatedAt ? `Updated ${timeOf(updatedAt)}` : '';

  if (status === 'off') {
    renderBranding();
    showNotice('This club\'s live scores page is turned off.');
    sheetsList.replaceChildren();
    earlier.classList.add('hidden');
    return;
  }
  if (status === 'offline') {
    showNotice(live ? 'Can\'t reach the scores right now. Trying again…' : 'Can\'t reach the scores. Trying again…');
  } else {
    showNotice(status === 'ok' && live.sheets.length === 0 ? 'No sheets yet.' : null);
  }
  if (!live) return;
  renderBranding();
  sheetsList.replaceChildren(...live.sheets.map(sheetCard));
  renderEarlier();
}

paused.addEventListener('click', wake);
for (const type of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
  window.addEventListener(type, wake, { passive: true });
}
// Nothing is fetched while the page is hidden. Showing it again catches up
// straight away if a poll came due meanwhile, and otherwise waits out the
// rest of the time.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    clearTimeout(timer);
  } else {
    lastActiveAt = Date.now();
    isPaused = false;
    render();
    schedule(timeUntilDue(live, updatedAt, Date.now()));
  }
});

poll();

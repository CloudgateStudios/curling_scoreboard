// A bonspiel's screen, for a TV in the club: the draw on now with its scores
// and the one after it, every draw's games, and each event as a bracket.
// Everything is sized to the screen, without scrolling.
//
// Options, in the query string:
//   view=now           the draw on now and the next one (the default)
//   view=schedule      every draw's games, sheet by sheet
//   view=brackets      each event's bracket, one at a time
//   view=cycle         all of them in turn
//   every=20           seconds on each screen when there is more than one,
//                      from 5 to 300

import {
  STATUS_MESSAGES, config, connect, el, endLabel, followLink, followsLink, now, sheetView, textColorOn,
} from './display.js';
import {
  bracketRounds, currentDraw, drawStart, eventsWithGames, gamesIn, isPool, nextDraw, resultOf, sideOf, sortedDraws,
} from './bonspiel-model.js';

const VIEWS = ['now', 'schedule', 'brackets', 'cycle'];
const params = new URLSearchParams(location.search);
const viewOption = VIEWS.includes(params.get('view')) ? params.get('view') : 'now';
const turnMs = Math.min(Math.max(Number(params.get('every')) || 20, 5), 300) * 1000;

const root = document.getElementById('display');
const header = el('header', 'top');
const brand = el('div', 'brand');
const logo = el('img', 'logo hidden');
logo.alt = '';
const titles = el('div', 'titles');
const title = el('h1', 'title', 'Bonspiel');
const subtitle = el('p', 'subtitle');
titles.append(title, subtitle);
brand.append(logo, titles);
const clock = el('time', 'clock');
header.append(brand, clock);
const body = el('div', 'body');
const status = el('p', 'status hidden');
root.append(header, body, status);

// undefined until read; null when there is no such bonspiel.
let plan = undefined;
let bonspielState = null;
let summary = null;
let linkStatus = 'connecting';
// Which of the screens is up, when there are several to take turns.
let turn = 0;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** "Sat 2:00 PM" */
function when(draw) {
  const start = drawStart(draw);
  return start
    ? start.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
}

function sheetName(sheetId) {
  return summary?.sheets?.[sheetId]?.name ?? 'Sheet';
}

/** The bonspiel's games on the ice or just finished, by game ID, from the
 *  club's display summary. */
function liveGames(at) {
  const games = new Map();
  for (const sheetId of Object.keys(summary?.sheets ?? {})) {
    const view = sheetView(summary, sheetId, at);
    const tag = view.kind === 'idle' ? null : view.game.bonspiel;
    if (tag?.id === config.bonspielId) games.set(tag.gameId, view);
  }
  return games;
}

/** The screens to show: one, or several in turn. */
function screens() {
  const events = eventsWithGames(plan).map((event) => ({ kind: 'bracket', event }));
  switch (viewOption) {
    case 'schedule': return [{ kind: 'schedule' }];
    case 'brackets': return events.length ? events : [{ kind: 'schedule' }];
    case 'cycle': return [{ kind: 'now' }, { kind: 'schedule' }, ...events];
    default: return [{ kind: 'now' }];
  }
}

/** A team's line in a game: its rock color while it plays, its name, and
 *  its score once there is one. */
function teamLine(game, slot, live, result) {
  const side = sideOf(plan, bonspielState, game, slot);
  const liveTeam = live?.game[slot];
  const won = result?.winner === slot;
  const line = el('div', `team${side.known || liveTeam ? '' : ' unknown'}${won ? ' won' : ''}`);
  const swatch = el('span', 'swatch');
  if (liveTeam?.color?.hex) swatch.style.background = liveTeam.color.hex;
  else swatch.classList.add('off');
  // A scoreboard knows who is actually playing, ahead of the state.
  line.append(swatch, el('span', 'name', liveTeam?.name || side.name));
  const score = liveTeam ? liveTeam.score : result?.[`${slot}Score`];
  const scoreText = score ?? (won ? 'W' : '');
  const scoreCell = el('span', 'score', String(scoreText));
  if (liveTeam?.color?.hex) {
    scoreCell.style.background = liveTeam.color.hex;
    scoreCell.style.color = textColorOn(liveTeam.color.hex);
  }
  line.append(scoreCell);
  return line;
}

/** Where a game is: the end, Final, or [pending] before it starts. */
function gameState(live, result, pending) {
  if (live) return endLabel(live);
  if (result) return result.tied ? 'Tied' : 'Final';
  return pending;
}

function gameCard(game, { live, top, pending }) {
  const result = resultOf(bonspielState, game);
  const card = el('section', `game${live?.kind === 'live' ? ' live' : ''}${result || live?.kind === 'final' ? ' done' : ''}`);
  const head = el('div', 'game-head');
  head.append(el('span', 'game-where', top), el('span', 'game-state', gameState(live, result, pending)));
  card.append(head, teamLine(game, 'team1', live, result), teamLine(game, 'team2', live, result));
  return card;
}

const bySheet = (a, b) => collator.compare(sheetName(a.sheetId), sheetName(b.sheetId));

// The draw on now as cards, with the next draw's games under it.
function nowScreen(at) {
  const draw = currentDraw(plan, at);
  if (!draw) return { subtitle: 'Schedule', content: el('p', 'empty', 'No draws yet.') };
  const live = liveGames(at);
  const wrap = el('div', 'now');
  const cards = el('div', 'cards');
  const games = gamesIn(plan, draw).sort(bySheet);
  // A row of up to four on a TV, or two across on one turned on its side,
  // so the cards stay a good size either way.
  const across = window.innerHeight > window.innerWidth ? 2 : 4;
  const columns = Math.max(1, games.length <= across ? games.length : Math.ceil(games.length / Math.ceil(games.length / across)));
  cards.style.setProperty('--columns', String(columns));
  cards.style.setProperty('--rows', String(Math.max(1, Math.ceil(games.length / columns))));
  for (const game of games) {
    // The game's name says its event: "B1".
    const label = [sheetName(game.sheetId), game.label].filter(Boolean).join(' · ');
    cards.append(gameCard(game, { live: live.get(game.id), top: label, pending: 'Not started' }));
  }
  wrap.append(cards);

  const next = nextDraw(plan, draw);
  if (next) {
    const list = el('section', 'next');
    list.append(el('h2', 'next-title', `Next: ${next.label} · ${when(next)}`));
    for (const game of gamesIn(plan, next).sort(bySheet)) {
      const row = el('div', 'next-game');
      const team1 = sideOf(plan, bonspielState, game, 'team1');
      const team2 = sideOf(plan, bonspielState, game, 'team2');
      row.append(
        el('span', 'next-where', `${sheetName(game.sheetId)} · ${game.label}`),
        el('span', team1.known ? 'next-team' : 'next-team unknown', team1.name),
        el('span', 'next-vs', 'vs'),
        el('span', team2.known ? 'next-team' : 'next-team unknown', team2.name),
      );
      list.append(row);
    }
    wrap.append(list);
  }
  return { subtitle: `Now: ${draw.label} · ${when(draw)}`, content: wrap };
}

// Every draw, a row each, and a column for each sheet games are played on.
// A long bonspiel shows the draws from the one before the current one on.
function scheduleScreen(at) {
  const draws = sortedDraws(plan);
  if (draws.length === 0) return { subtitle: 'Schedule', content: el('p', 'empty', 'No draws yet.') };
  const sheetIds = [...new Set((plan.games ?? []).map((game) => game.sheetId))]
    .sort((a, b) => collator.compare(sheetName(a), sheetName(b)));
  const current = currentDraw(plan, at);
  const live = liveGames(at);

  // Rows no shorter than this share of the screen; any more and the
  // earliest scroll off.
  const fits = Math.max(1, Math.floor((body.clientHeight || window.innerHeight * 0.85) / (window.innerHeight * 0.075)) - 1);
  const currentIndex = Math.max(0, draws.findIndex((d) => d.id === current?.id));
  const first = Math.max(0, Math.min(currentIndex - 1, draws.length - fits));
  const shown = draws.slice(first, first + fits);

  const table = el('div', 'schedule');
  table.style.setProperty('--sheets', String(sheetIds.length));
  table.style.setProperty('--rows', String(shown.length));
  table.append(el('span', 'corner'));
  for (const id of sheetIds) table.append(el('span', 'sheet-head', sheetName(id)));
  for (const draw of shown) {
    const isCurrent = draw.id === current?.id;
    const head = el('div', `draw-head${isCurrent ? ' current' : ''}`);
    head.append(el('span', 'draw-label', draw.label), el('span', 'draw-when', when(draw)));
    table.append(head);
    for (const id of sheetIds) {
      const game = (plan.games ?? []).find((g) => g.drawId === draw.id && g.sheetId === id);
      if (!game) {
        table.append(el('span', `cell empty${isCurrent ? ' current' : ''}`));
        continue;
      }
      // The row says when.
      const card = gameCard(game, { live: live.get(game.id), top: game.label, pending: '' });
      card.classList.add('cell');
      if (isCurrent) card.classList.add('current');
      table.append(card);
    }
  }
  return { subtitle: 'Schedule', content: table };
}

// A pool: its standings, as far as its games have been played.
function standingsScreen(event) {
  const eventState = bonspielState?.events?.[event.id];
  const rows = eventState?.standings ?? [];
  const table = el('div', 'standings');
  table.style.setProperty('--rows', String(Math.max(rows.length, 1)));
  for (const heading of ['', 'Team', 'Played', 'Won', 'Lost', 'Tied', 'Points']) {
    table.append(el('span', 'standings-head', heading));
  }
  for (const row of rows) {
    table.append(
      el('span', 'standings-place', `${row.place}${row.tied ? '=' : ''}`),
      el('span', 'standings-name', row.name),
      el('span', 'standings-number', String(row.played)),
      el('span', 'standings-number', String(row.wins)),
      el('span', 'standings-number', String(row.losses)),
      el('span', 'standings-number', String(row.ties)),
      el('span', 'standings-points', String(row.points)),
    );
  }
  const content = rows.length ? table : el('p', 'empty', 'No games played yet.');
  return { subtitle: eventState?.complete ? `${event.name} · Final standings` : event.name, content };
}

// One event as a bracket: its rounds in columns, each as tall as the
// screen, so later rounds sit between the games that feed them.
function bracketScreen(event, at) {
  if (isPool(plan, event.id)) return standingsScreen(event);
  const rounds = bracketRounds(plan, event.id);
  const live = liveGames(at);
  const draws = new Map((plan.draws ?? []).map((d) => [d.id, d]));
  const bracket = el('div', 'bracket');
  const most = Math.max(...rounds.map((games) => games.length));
  bracket.style.setProperty('--most', String(most));
  rounds.forEach((games, i) => {
    const column = el('div', 'round');
    const isFinal = i === rounds.length - 1 && games.length === 1;
    column.append(el('h2', 'round-title', isFinal ? 'Final' : `Round ${i + 1}`));
    const list = el('div', 'round-games');
    for (const game of games) {
      const draw = draws.get(game.drawId);
      const top = [game.label, draw?.label, sheetName(game.sheetId)].filter(Boolean).join(' · ');
      list.append(gameCard(game, { live: live.get(game.id), top, pending: when(draw) }));
    }
    column.append(list);
    bracket.append(column);
  });
  const winner = bonspielState?.events?.[event.id]?.winner?.name;
  return { subtitle: winner ? `${event.name} · Won by ${winner}` : event.name, content: bracket };
}

function showStatus(message) {
  status.textContent = message ?? '';
  status.classList.toggle('hidden', !message);
  body.classList.toggle('hidden', Boolean(message));
}

function render() {
  const at = now();
  clock.textContent = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const message = STATUS_MESSAGES[linkStatus];
  if (message) return showStatus(message);
  if (plan === undefined) return; // Still connecting: keep what is shown.
  if (plan === null) return showStatus('This bonspiel is no longer there. Ask a club admin to point this screen at another.');
  showStatus(null);

  title.textContent = plan.name ?? 'Bonspiel';
  document.title = plan.name ?? 'Bonspiel';
  const all = screens();
  const screen = all[turn % all.length];
  const shown = screen.kind === 'now' ? nowScreen(at)
    : screen.kind === 'schedule' ? scheduleScreen(at)
      : bracketScreen(screen.event, at);
  subtitle.textContent = shown.subtitle;
  body.dataset.screen = screen.kind;
  body.replaceChildren(shown.content);
}

// The club's logo from the warm room's settings. The title is the
// bonspiel's own name.
function showBranding(branding) {
  const src = typeof branding?.logo === 'string' && branding.logo.startsWith('data:image/') ? branding.logo : '';
  if (src) logo.src = src;
  else logo.removeAttribute('src');
  logo.classList.toggle('hidden', !src);
}

connect({
  // Opened from the display link's own URL: go wherever its settings say.
  onLink: followsLink ? followLink : undefined,
  onBranding: showBranding,
  onSummary: (next) => {
    summary = next;
    render();
  },
  extraDocs: [
    { what: 'bonspiel', path: ['bonspiels', config.bonspielId], on: (next) => { plan = next; render(); } },
    {
      what: 'bonspiel state',
      path: ['bonspiels', config.bonspielId, 'state', 'current'],
      on: (next) => { bonspielState = next; render(); },
    },
  ],
  onStatus: (next) => {
    linkStatus = next;
    render();
  },
});

window.addEventListener('resize', render);

// Hides the pointer after it has been still for a few seconds, as on the
// warm room screen.
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
// Keeps the clock right, moves on to the next draw, and takes a final score
// down when its time is up, with no write to say so.
setInterval(render, 15_000);
setInterval(() => {
  turn += 1;
  if (screens().length > 1) render();
}, turnMs);

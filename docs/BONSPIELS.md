# Bonspiels

A design proposal for running bonspiels in the app: planning the draws and
brackets in the admin portal, showing them on a monitor at the club, and
letting each sheet's scoreboard start the right game with the right teams.
Nothing here is built yet. Once it is, the parts that describe the system
move into [ARCHITECTURE.md](ARCHITECTURE.md) and this file goes.

## What a bonspiel looks like

A bonspiel runs over a few days, with up to 32 teams. The draw times and
sheets are known well ahead, but most of the teams in a game are not: they
come out of the games before it, often only minutes before the draw starts.

The format changes from one bonspiel to the next, and often within one:

- Knockouts. Everyone starts in the A event, and a loss drops a team into
  B, then C, and so on. Which round's losers go to which event differs by
  club.
- Pools played as a round robin, with the top teams going on.
- Whatever the coordinator decides, such as placing teams by hand.

At club bonspiels each event ends in a final between two teams, and the
winner of the final wins the event. There is no playoff across events.

So the app never stores a format. It stores the games, and for each side of
each game where its team comes from. Any format can be written that way,
and anything the links below cannot express is left for a person to fill in.

## Who does what

- **Bonspiel coordinators** have the bonspiel admin role, or are club
  admins. They plan the bonspiel on the portal's Bonspiels tab, place teams
  the links cannot, and correct results.
- **Scoreboards** read the club's active bonspiels, offer the game planned
  for their sheet, and tag the games they record with it.
- **A Cloud Function** works out who is in each game from the plan and the
  results, so nothing else has to.
- **Display screens** show the schedule, the brackets and the games on the
  ice now.

## Data model

Each bonspiel is two documents: the plan, which only people write, and its
state, which only the functions write. Keeping them apart means a
coordinator saving the plan can never overwrite a result that has just come
in, or the other way round, and the bracket logic lives in one place, in the
functions, instead of in the portal, the scoreboard and the display page.

```
clubs/{clubId}/bonspiels/{bonspielId}        // the plan
  name: string
  active: bool                 // inactive bonspiels are not offered on scoreboards
  startDate: string            // 'YYYY-MM-DD', the club's local time, inclusive
  endDate: string
  numberOfEnds: int            // for every game unless its event says otherwise
  events: [{
    id: string
    name: string               // "A Event", "Pool 2"
    numberOfEnds?: int
  }]
  teams: [{
    id: string                 // stable across renames
    name: string
    externalId?: string
    seed?: int                 // where a template places the team; 1 is first
  }]
  draws: [{
    id: string
    label: string              // "Draw 5"
    start: string              // 'YYYY-MM-DDTHH:mm', the club's local time
  }]
  games: [{
    id: string                 // "A7"; stable, as games and results refer to it
    drawId: string
    sheetId: string
    eventId: string            // every game is in exactly one event
    label?: string             // "A Final"
    team1: Side                // throws the first rock color
    team2: Side
    result?: {                 // set by a coordinator, and wins over the scoreboard's
      winner: 'team1' | 'team2'
      team1Score?: int
      team2Score?: int
    }
  }]

Side = { teamId: string }                                   // placed
     | { from: string, result: 'winner' | 'loser' }         // out of game `from`
     | { rank: int, eventId: string }                       // a later phase, see below
     | null                                                 // to be decided

clubs/{clubId}/bonspiels/{bonspielId}/state/current   // written by the functions
  updatedAt: timestamp
  games: {
    [gameId]: {
      status: 'waiting' | 'ready' | 'live' | 'final'
      team1: { teamId: string, name: string } | null   // null until known
      team2: { ...the same }
      team1Score?: int
      team2Score?: int
      winner?: 'team1' | 'team2'
      sheetGameId?: string     // the games document it came from, if a scoreboard played it
    }
  }
  events: {
    [eventId]: { winnerTeamId?: string }   // the winner of the event's final
  }
```

`waiting` is a game with a side still unknown, `ready` one with both teams,
`live` one a scoreboard has started, and `final` one with a result.

A 32 team triple knockout is about 90 games, so the plan is tens of KB,
well inside a document's 1 MB. A scoreboard or display reads both documents
with one listener each, as displays already do with `displayState`.

### An event's final

An event's final is the game in that event whose winner no other game in
the event comes from. Its winner is the event's winner. Nothing has to mark
it, so the bracket view and `state` find it the same way whatever the
format.

### Working out the state

`syncBonspielState` rebuilds `state/current` in a transaction from the plan
and the bonspiel's results, whenever either changes:

- on any write to the plan
- on a new `games` document, under any sheet, tagged with the bonspiel

For each game in draw order it works out both sides: a placed team as it
is, a `from` side from the winner or loser of that game once it has one,
anything else as unknown. A game's result is the coordinator's `result` if
there is one, otherwise the latest completed game a scoreboard recorded for
it. A tied game in an event that needs a winner is left without one and the
portal flags it.

Like the display summary, it rebuilds from the documents as they are rather
than from the event that fired, so late or repeated events write the same
thing again.

The plan is checked when it is saved: every `from` names a game in an
earlier draw, nothing refers to itself, and a team is not in two games in
one draw. The portal says what is wrong; the rules only check the outline,
as they do for leagues.

### Results from scoreboards

A game started from a bonspiel carries `bonspiel: { id, name, gameId }` in
`liveGame` and in its `games` document, beside `league` for league games.
The `games` document also keeps both teams' `teamId`, so a game played by
other teams than the plan expected, after a last minute change, still
records who played. When that happens the function places those teams into
the game.

### Rules

- Club admins and bonspiel admins of the club read and write the plans.
  Bonspiel admins get nothing else new.
- Paired scoreboards read the club's bonspiels and their state, with the
  same check on the sheet as for leagues.
- Displays read the club's bonspiels and their state, and nothing else
  of them.
- Only the functions write `state`.

## Admin portal

The Bonspiels tab lists the club's bonspiels, newest first, with a button to
add one. Each opens at `/bonspiels/:bonspielId`, like a league:

1. **Setup**: the name, the dates, the number of ends, the events and the
   teams. Teams can be pasted or imported from CSV, like a league's.
2. **Draw board**: the draws down the side and the sheets across, one game
   to a cell. Tapping a game edits its two sides (a team, the winner or loser
   of another game, or to be decided) and its result. It works on a phone,
   since that is what the coordinator has on the day.
3. **Brackets**: each event drawn the way the display page draws it, so the
   coordinator sees what the monitor will.

Getting the games in:

- **Templates** fill in the games and their draws and sheets. Clubs have no
  other software to import from, so these come early. The first is a
  knockout: the number of teams, the number of events, and which round's
  losers go to which event (A round 1 losers to B, round 2 to C, and so on),
  with byes for team counts that are not a power of two. The template then
  places the games into the draws in order, never playing a game before the
  ones it comes from, and never giving a team two games in a row without a
  draw off where there is room.
- **Duplicate** copies a bonspiel, without its teams and results, for next
  year.
- After that, everything is edited by hand. A template is only a starting
  point and the plan it makes is not tied to it.

## Display page

`/display/{clubId}/bonspiels/{bonspielId}`, a new display link page,
`page: 'bonspiel'`, with the bonspiel in its settings so the portal can
point a monitor at it. Its views, which it can cycle through like the warm
room's:

- **Now and next**: the games on the ice in the current draw, with live
  scores, and the next draw's games as far as they are known ("Sheet C:
  Smith vs winner of A4").
- **Schedule**: every draw and sheet, with the teams and results so far. It
  works for any format.
- **Brackets**: one event at a time, its games in columns by how many games
  each one comes after, ending at the final and its winner. A team coming in
  from another event is shown as where it came from ("Loser of A3").

Live scores come from `displayState`, which the page already listens to.
`syncDisplaySheet` only has to pass the live game's `bonspiel.gameId` along.

## Scoreboard

- `BonspielService` follows the club's active bonspiels and their state, and
  keeps the last it saw so a scoreboard that starts offline still has them,
  like `LeagueService`.
- On a bonspiel's dates it takes over the setup screen's league bar. The
  current draw is the one starting next, from 30 minutes before its start
  time until the next draw's. The bar offers this sheet's game in it:
  "Draw 5 · A7: Smith vs Jones", started with one tap, or "Winner of A3 vs
  Winner of A4", which fills in as those games finish. Leagues are still
  there through the league chooser.
- A game with a side still to be decided opens the team picker with the
  likely teams first: those not already in a game this draw and not out of
  every event. All of the teams are a tap away.
- The game takes its number of ends from its event, or the bonspiel.

## Phases

Each phase can be released on its own.

1. **Plans**: the data model, rules and their tests, `syncBonspielState`,
   and the portal's setup, draw board, results and duplicate. A coordinator
   can run a bonspiel, entering results by hand.
2. **Templates**: the knockout template, and the portal's bracket view.
3. **Scoreboards**: the setup screen's bonspiel game, tagging games, and
   results coming in on their own.
4. **Display**: the display page, its link settings, and live scores from
   `displayState`.
5. **Later**: pools, with `rank` sides and a standings order the coordinator
   picks (wins, head to head, last stone draw); bonspiels in the REST API
   and the completed game webhook.

## Decided

- Hammer stays a choice on the scoreboard, as in any other game. The plan
  says nothing about it.
- Every game belongs to one event, and no game is between the winners of
  two events. Teams still move between events, as a loss in A drops a team
  into B, but an event's final is always its own.

# Bonspiels

The plan for running bonspiels in the app: planning the draws and brackets
in the admin portal, showing them on a monitor at the club, and letting each
sheet's scoreboard start the right game with the right teams.

The first two phases are built: the plans, their state, and planning them
in the portal, with a knockout template and a bracket view. How those work
is under Bonspiels in [ARCHITECTURE.md](ARCHITECTURE.md), along with the
data model. This file is
what is still to come, and goes once it is all built.

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
- **Brackets**: one event at a time, laid out as the portal's bracket view
  is, ending at the final and its winner. A team coming in
  from another event is shown as where it came from ("Loser of A3").

Live scores come from `displayState`, which the page already listens to.
`syncDisplaySheet` only has to pass the live game's `bonspiel.gameId` along.

## Scoreboard

Scoreboards will read the club's bonspiels and their state, with the same
check on the sheet as for leagues, and displays will read them and nothing
else of them. Neither can yet.

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

1. **Plans** (built): the data model, rules and their tests, the state
   functions, and the portal's setup, draw board, results and duplicate. A
   coordinator can run a bonspiel, entering results by hand.
2. **Templates** (built): the knockout template, and the portal's bracket
   view.
3. **Scoreboards**: the setup screen's bonspiel game, tagging games, and
   results coming in on their own. The functions already take in tagged
   games.
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

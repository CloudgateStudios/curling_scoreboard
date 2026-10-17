# Bonspiels

The plan for running bonspiels in the app: planning the draws and brackets
in the admin portal, showing them on a monitor at the club, and letting each
sheet's scoreboard start the right game with the right teams.

The first four phases are built: the plans, their state, planning them in
the portal with a knockout template and a bracket view, the scoreboards
starting each sheet's game and sending in its result, and a screen for the
club's TV. How those work is under Bonspiels and Display pages in
[ARCHITECTURE.md](ARCHITECTURE.md), along with the data model. This file is
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

## Phases

Each phase can be released on its own.

1. **Plans** (built): the data model, rules and their tests, the state
   functions, and the portal's setup, draw board, results and duplicate. A
   coordinator can run a bonspiel, entering results by hand.
2. **Templates** (built): the knockout template, and the portal's bracket
   view.
3. **Scoreboards** (built): the setup screen's bonspiel game, tagging
   games, and results coming in on their own.
4. **Display** (built): the display page, its link settings, and live
   scores from `displayState`.
5. **Later**: pools, with `rank` sides and a standings order the coordinator
   picks (wins, head to head, last stone draw); bonspiels in the REST API
   and the completed game webhook.

## Decided

- Hammer stays a choice on the scoreboard, as in any other game. The plan
  says nothing about it.
- Every game belongs to one event, and no game is between the winners of
  two events. Teams still move between events, as a loss in A drops a team
  into B, but an event's final is always its own.

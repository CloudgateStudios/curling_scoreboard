# Glossary

The curling words the code and docs use all the time, and the words this
system gives its own meaning to. Written for developers who don't curl. See
also [FEATURES](FEATURES.md) and [ARCHITECTURE](ARCHITECTURE.md).

## Curling

| Term                         | Meaning                                                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sheet**                    | One playing surface. A club has several side by side, named "Sheet 1" or "Sheet A", and one game is played on each at a time. The system puts one scoreboard on each sheet.                                             |
| **Rock**, **stone**          | The granite stones the teams throw. A team's rocks have handles of one color, usually red or yellow, so a team is known by its **rock color** until it has a name.                                                     |
| **End**                      | A round of play, like an inning: both teams throw all their rocks, then the points are counted. A club game is usually 8 ends, the scoreboard's default.                                                                       |
| **Score**                    | Only one team can score in an end: one point for each of its rocks closer to the center than the other team's closest.                                                                                                  |
| **Blank end**                | An end where nobody scores.                                                                                                                                                                                             |
| **Hammer**                   | The last rock of the end, an advantage. A team that scores gives the hammer to the other. After a blank end the same team keeps it, except in doubles, where it passes. The scoreboard works it out from the ends.       |
| **Last stone in the first end** | Who has the hammer in the first end, decided before the game (often by a coin toss). Everything after follows from it and the scores.                                                                              |
| **Extra end**                | Played when a game is tied after its scheduled ends. Shown as "E" on the scoreboard, which has room for one.                                                                                                             |
| **Fours**, **doubles**       | A team of four players, the usual club game, or two (mixed doubles), which plays shorter ends. The scoreboard paces the game clock at 15 minutes an end for fours and 12 for doubles.                                    |
| **House**                    | The rings at each end of the sheet that rocks are thrown at.                                                                                                                                                             |
| **Draw** (schedule)          | A time slot when a set of games starts across the sheets, as in "the 7 pm draw". A league plays the same draws each week; a bonspiel has a list of draws over its days. (In play, a draw is also a kind of shot, which this system never means.) |
| **League**                   | A season of weekly games between the same teams, at set draw times.                                                                                                                                                      |
| **Bonspiel**                 | A tournament, usually over a few days, run as one or more events.                                                                                                                                                        |
| **Event**                    | One competition within a bonspiel, usually a bracket: the **A event**, **B event** and so on. In the common club format, teams that lose early in A drop to B, and so on down.                                          |
| **Knockout**                 | An event where losing a game sends a team out of it, to another event or home. A **triple knockout** gives every team three losses before it is out.                                                                    |
| **Bye**                      | A place in a round with no opponent, so a team goes through without playing, when the number of teams does not fill a bracket.                                                                                         |
| **Pool**, **round robin**    | A group of teams that each play the others, ranked by their record. Pools usually send their top teams to a **playoff**.                                                                                                |
| **Standings**                | A pool's table: 2 points a win and 1 a tie, then the games between teams level on points, then the coordinator's order.                                                                                                 |
| **Tiebreak**                 | How teams level in the standings are separated, often by a **last stone draw** (each team's throws measured to the center) or a tiebreak game. In the system, the order the coordinator sets after it.                  |
| **Warm room**                | The club's lounge, usually behind glass looking over the sheets. The warm room screen is a TV there.                                                                                                                     |

## This system

| Term                    | Meaning                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Open game**           | A game in neither a league nor a bonspiel, whose teams are named by their rock colors.                                                                                                          |
| **League game**         | A game whose teams were picked from a league, carrying each team's `teamId` and `externalId`.                                                                                                    |
| **Bonspiel game**       | A game started as one of the games in a bonspiel's plan, carrying `bonspiel: { id, name, gameId }`.                                                                                              |
| **Live game**           | The game in progress on a sheet, `liveGame` on the sheet document. It counts as live for two hours after its last write.                                                                       |
| **Completed game**      | A finished game, written once by the scoreboard as a `games` document under its sheet. Everything else that shows a result is made from it.                                                    |
| **Pairing**             | Connecting a scoreboard to a sheet with a six character **pairing code** from the portal. A **paired scoreboard** syncs; an unpaired one only scores.                                          |
| **Admin PIN**           | The club's four to eight digit PIN, asked for before a scoreboard disconnects.                                                                                                                  |
| **Club admin**          | Someone who runs one club in the admin portal.                                                                                                                                                  |
| **Bonspiel admin**, **coordinator** | Someone who plans and runs a club's bonspiels in the portal, and can change nothing else.                                                                                           |
| **Super admin**         | Someone who looks after every club: creates clubs and their users.                                                                                                                              |
| **Display**             | A screen with nobody to sign in: the score bug, the warm room screen or the bonspiel screen.                                                                                                    |
| **Display link**        | The URL a display signs in with, made by a club admin, which also says what the display shows.                                                                                                  |
| **Score bug**           | A small overlay of one sheet's score for a live stream, in broadcast terms; here a transparent page for an OBS browser source.                                                                 |
| **Display summary**     | `private/displayState`, the one document per club the displays listen to, kept by functions from the sheets and their games.                                                                    |
| **Public scores page**  | The club's scores for members' phones, with no sign-in, served as cached JSON.                                                                                                                  |
| **Plan**                | A bonspiel's draws, events, teams and games, as its coordinators write it.                                                                                                                      |
| **Side**                | Where one of a bonspiel game's two teams comes from: a team, the winner or loser of an earlier game, a place in a pool, or to be decided.                                                      |
| **State**               | What the functions work out from a bonspiel's plan and results: who is in each game, how it went, and each event's standings and winner.                                                        |
| **Final**               | An event's one game whose winner goes to no other game in it. Also what a display shows for a game that has finished.                                                                           |

How each of these works is in the [architecture docs](ARCHITECTURE.md).

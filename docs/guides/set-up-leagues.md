# Set up leagues

With leagues set up, a connected scoreboard suggests the league playing now
and offers its teams as buttons, and every game records which teams played.
[How it works](../architecture/leagues.md).

## From a spreadsheet

The quickest way, for all your leagues at once and again each season.

1. Make a CSV file with one row per team. Only `league` and `team` are
   required:

   ```csv
   league,day,start,end,team,external_id
   Monday Night,Mon,18:30,20:30,Team Smith,1042
   Monday Night,Mon,18:30,20:30,Team Jones,1043
   Thursday Doubles,Thu,19:00,21:00,Stone Cold,
   ```

   `day`, `start` and `end` are when the league plays each week, in the club's
   local time. `external_id` is the team's ID in your own league software, if
   you have one. The import dialog has **Download this as a sample CSV** to
   start from.
2. Open **Leagues**, press **Import CSV** and choose the file.
3. Choose what happens to **Teams already in a league that are not in the
   file**: **Keep them** or **Remove them**.
4. Check the preview: each league is a **New league** or an **Update**, with
   the teams it will add, rename and remove. Rows it cannot read are listed.
5. Press **Import**, which says how many leagues it will write.

Importing again is safe. Leagues are matched by name, and teams by
`external_id`, or by name without one, so a renamed team keeps its past games.

## By hand

On **Leagues**, press **+ Add League**, name it, and press **Save**. Then
press **Edit →** on it:

- **Active: offered on scoreboards when starting a league game**. Clear it
  between seasons.
- **Season starts** and **Season ends**, both optional.
- **Schedule**: **+ Add Draw** for each weekly time slot. A scoreboard
  suggests the league from half an hour before a draw starts until it ends.
- **Teams**: **+ Add Team**, with an optional external ID.

Press **Save Changes**.

The Leagues tab shows a week of every league's draws, and flags any that
overlap.

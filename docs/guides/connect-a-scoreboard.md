# Connect a scoreboard to a sheet

A scoreboard scores games on its own. Connected to one of your club's
sheets, it also sends each game to the portal, the screens, the public
scores page and your integrations, and picks up your rock colors, leagues
and bonspiels. [How it works](../architecture/scoreboard.md#pairing-a-scoreboard).

You need the sheet in the portal. Only a super admin can add sheets; ask one
if a sheet is missing.

## Connect it

1. In the admin portal, open **Sheets & Games** and find the sheet.
2. Press **Generate Pairing Code**. A six character code appears beside the
   sheet.
3. On the scoreboard, on the game setup screen, press **Connection** in the
   bottom corner.
4. Type the code under **Pairing Code** and press **Connect**.

The setup screen now says "Connected as" your club and sheet, and in the
portal the sheet shows **Paired**, with the scoreboard's version and when it
was last seen. The code works once and then disappears. **Clear** removes a
code nobody has used yet.

"Pairing code not found" means the code was mistyped, already used or
cleared. Generate a new one.

## Replace a scoreboard

Connect the new one to the same sheet with a new code. The old one stops
syncing at once; nothing has to be done to it first.

## Disconnect it

Disconnecting is hidden so players don't do it by accident, and needs your
club's admin PIN:

1. On the setup screen, press and hold "Connected as …" for four seconds,
   until the ring fills.
2. Press **Disconnect** and enter the **Admin PIN**.

Or, from the portal: on **Sheets & Games**, press **Edit** on the sheet, then
**Unpair Scoreboard**.

## Set the admin PIN

Open **Settings**, then **Scoreboards**, and under **Scoreboard Admin PIN**
press **Set PIN** or **Change PIN**. It is four to eight digits, one for the
whole club, and applies to every scoreboard straight away. A club with no PIN
cannot disconnect a scoreboard from the scoreboard itself.

The same page sets the club's **rock colors**, if you don't play with red and
yellow. Scoreboards use them from their next game.

## "Scores are not syncing"

The scoreboard says this when its sheet has been connected to another device
since. Press and hold the connection, **Disconnect**, then connect it again
with a new code, or leave it disconnected if the other device replaced it.

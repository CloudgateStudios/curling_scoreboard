# Set up a screen or stream

Each screen gets its own display link: the warm room TV, a score bug or
linescore in a stream, or a bonspiel screen. A link's URL never changes; you change what it
shows from the portal, and the screen follows within seconds.
[How it works](../architecture/displays.md).

## Make a link

1. Open **Displays**. Under **Display Links**, type a name such as "Warm room
   TV" and press **Create Link**.
2. In the dialog, choose what it **Shows**: the warm room, a score bug, a
   linescore or a bonspiel screen. A score bug or linescore also asks for its
   **Sheet**, and a bonspiel screen for its **Bonspiel**. Pick its options
   (below), then **Save**.
3. Press **Copy URL** and put that URL on the screen. **Done** closes the
   dialog.

A club can have 20 links. Anyone with a link can see the club's scores, so
keep it on the screen it is for.

## A warm room TV

Under **Shows**, choose **Warm room screen, every sheet**. Then:

- **View**: **Total scores**, **End by end**, or **Both, in turn**, with
  **Seconds on each**.
- **Earlier results**: **Today's, beside the sheets** adds the day's finished
  games down the side, for a screen left on through several draws.

Open the URL in the TV's browser, full screen. It fills any screen, either
way round, and hides the mouse pointer when it is still.

**Warm Room Screen**, further down the Displays tab, sets the title at the
top (in place of "Live Scores") and adds your club's logo. Press **Save**.

## A score bug in OBS

Under **Shows**, choose **Score bug**, and its **Sheet**. Then pick its
**Size**, the **Caption under the bug** (the sheet name, the league name,
both, or none), and which side the **End** box is on. The caption uses a league's or bonspiel's
short name if it has one; give it one on the league's or bonspiel's page.

1. In OBS, add a **Browser** source and paste the URL. Leave the size at your
   canvas's, such as 1920 × 1080.
2. The page is transparent with the bug in its top left corner. Move or crop
   the source to place it.
3. Between games the bug shows the sheet's name and "No game right now". It is
   the same size as during a game, so you can place it at any time.

## A linescore in OBS

A linescore is a sheet's game end by end, as a banner to show across the
stream between ends. Under **Shows**, choose **Linescore**, and its **Sheet**.
Then pick its **Size** and what goes **Above the team names** (the sheet
name, the league name, both, or nothing). Final shows there once the game is
over, and a game that ended early has X in the ends it never played.

1. In OBS, add a **Browser** source and paste the URL. At the **Normal** size
   the banner fills a source 1600 wide and 360 high; **Small** fits 1200 by
   270.
2. The page is transparent, so only the banner shows. Show and hide the
   source between ends, or put it in a scene of its own.
3. Between games it shows the sheet's name and "No game right now", at the
   same size.

Give each sheet you stream its own linescore link, beside its score bug.

## A bonspiel screen

Under **Shows**, choose **Bonspiel screen**, and its **Bonspiel**. Its
**View** is the draw on now and the next, every draw, the brackets, or all of
them in turn.

## Change or retire a link

- **Edit** changes its name or what it shows, even mid-stream.
- **New URL** gives it a new address, for one that got out. Screens on the
  old one stop within the hour.
- **Remove** deletes it. A screen using it stops within the hour.

Each link shows whether its screen is open and on the latest version.
Screens update themselves after a new release.

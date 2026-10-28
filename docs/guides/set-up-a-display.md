# Set up a screen or stream

Each screen gets its own display link: the warm room TV, a score bug in a
stream, or a bonspiel screen. A link's URL never changes; you change what it
shows from the portal, and the screen follows within seconds.
[How it works](../architecture/displays.md).

## Make a link

1. Open **Displays**. Under **Display Links**, type a name such as "Warm room
   TV" and press **Create Link**.
2. In the dialog, choose what it **Shows** and its options (below), then
   **Save**.
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

Under **Shows**, choose **Score bug for** the sheet. Then pick its **Size**,
the **Caption under the bug** (the sheet name, the league name, both, or
none), and
which side the **End** box is on.

1. In OBS, add a **Browser** source and paste the URL. Leave the size at your
   canvas's, such as 1920 × 1080.
2. The page is transparent with the bug in its top left corner. Move or crop
   the source to place it.
3. Between games the bug hides itself. To place it then, press **Preview** in
   the portal to see it outlined, or add `?preview` just before the `#` in
   OBS's URL while you set up, and take it out after.

## A bonspiel screen

Under **Shows**, choose **Bonspiel:** and the bonspiel. Its **View** is the
draw on now and the next, every draw, the brackets, or all of them in turn.

## Change or retire a link

- **Edit** changes its name or what it shows, even mid-stream.
- **New URL** gives it a new address, for one that got out. Screens on the
  old one stop within the hour.
- **Remove** deletes it. A screen using it stops within the hour.

Each link shows whether its screen is open and on the latest version.
Screens update themselves after a new release.

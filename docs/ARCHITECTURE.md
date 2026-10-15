# Architecture

<!-- cspell:ignore credentialless Embedder -->

How the scoreboard app, the admin portal and the Cloud Functions fit together
on Firebase. For setup and day to day commands, see the [README](../README.md);
for how to make and ship a change, see [CONTRIBUTING](../CONTRIBUTING.md).

## Overview

| Piece        | Runs on                                                       | Talks to                                                                                            |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `app/`       | Flutter web (Firebase Hosting, `app` target), Android, others | Firestore directly; the `pairSheet`, `unpairSheet` functions                                         |
| `admin/`     | React SPA (Firebase Hosting, `admin` target)                  | Firestore directly; the `provisionClub`, `addClubAdmin`, `removeClubAdmin`, `deleteSheet`, `createDisplayLink`, `revokeDisplayLink` functions |
| `functions/` | Cloud Functions (2nd gen, `us-central1`)                      | Firestore and Auth with admin access; also serves the display pages                                  |

There are two Firebase projects, `curling-scoreboard-dev` and
`curling-scoreboard-prod`, with the same layout. Access control lives in
`firestore.rules`; anything a client cannot be trusted to do runs in a Cloud
Function instead.

The scoreboard works fully offline and unpaired. Pairing with a club only adds
syncing: nothing in scoring depends on Firebase.

## Data model

```
appConfig/scoreboard
  buildId: string            // commit SHA of the deployed web build
  deployedAt: timestamp

clubs/{clubId}
  name: string

clubs/{clubId}/private/apiKey
  key: string                // 32 hex characters

clubs/{clubId}/private/scoreboardPin   // asked for to disconnect a scoreboard
  pin: string                // 4 to 8 digits

clubs/{clubId}/private/webhook       // absent means no webhook
  url: string                // https, where completed games are posted
  games: 'all' | 'league'    // every game, or only ones with a league team
  template?: string          // the club's message, up to 1000 characters; absent for the default
  timeZone?: string          // IANA zone for dates in the message; absent means UTC

clubs/{clubId}/private/webhookStatus // the last post, written by the functions
  at: timestamp
  kind: 'game' | 'test'
  ok: bool
  status?: int               // the receiver's HTTP status, if it answered
  error?: string

clubs/{clubId}/private/displayState  // what the display pages show, written by the functions
  sheets: {
    [sheetId]: {
      name: string
      live: {                // the live game, or null; see liveGame below
        updatedAt: timestamp | null
        currentEnd: int
        numberOfEnds: int | null           // null from scoreboard builds before it was sent
        league: { name: string } | null
        team1: { name: string, color: { name, hex } | null, score: int,
                 hasHammer: bool | null, hadLastStoneFirstEnd: bool | null }
        team2: { ...the same }
        ends: [{ endNumber: int, scoringTeamSlot: 'team1' | 'team2' | null, score: int }] | null
      } | null
      lastGame?: {           // the sheet's latest completed game
        gameId: string
        startedAt: timestamp | null
        finishedAt: timestamp
        numberOfEnds: int | null
        league: { name: string } | null
        team1: { ...as in live, with hasHammer null }
        team2: { ...the same }
        ends: [...as in live]
      }
    }
  }

clubs/{clubId}/private/displayBranding // the warm room screen's title bar; absent for the default
  title?: string             // up to 60 characters, in place of "Live Scores"
  logo?: string              // a PNG, JPEG or WebP data URL, up to 250,000 characters

clubs/{clubId}/displayLinks/{linkId} // what a display screen signs in with
  label: string              // up to 60 characters, e.g. "Warm room TV"
  secretHash: string         // SHA-256 of the token's secret, in hex, which sign-in checks
  token?: string             // the token itself, for the portal to show; absent on links made before it was kept
  settings: {                // what the link's screens show
    page: 'bug' | 'warm-room'
    sheetId?: string         // the score bug's sheet
    view?: 'totals' | 'full' | 'cycle'   // the warm room's; totals when absent
    every?: int              // seconds on each view when cycling, 5 to 300; 20 when absent
    scale?: number           // the score bug's size, 0.5 to 4; 1 when absent
    label?: 'sheet' | 'league' | 'none'  // the score bug's bottom line; sheet when absent
  }
  createdAt: timestamp
  lastUsedAt?: timestamp     // when a display last started with it, at most hourly

clubs/{clubId}/config/scoreboard     // club settings the scoreboards read
  rockColors?: {             // absent means red and yellow
    team1: { name: string, hex: string }   // hex is '#RRGGBB'
    team2: { name: string, hex: string }
  }

clubs/{clubId}/leagues/{leagueId}
  name: string
  active: bool               // inactive leagues are not offered on scoreboards
  seasonStart?: string       // 'YYYY-MM-DD', inclusive
  seasonEnd?: string
  draws: [{                  // when it plays each week, in the club's local time
    day: int                 // 1 (Monday) to 7 (Sunday)
    start: string            // 'HH:mm', 24 hour
    end: string
  }]
  teams: [{
    id: string               // stable across renames and imports
    name: string
    externalId?: string      // the team's ID in the club's own league software
  }]

clubs/{clubId}/admins/{uid}
  email: string
  displayName: string | null

clubs/{clubId}/sheets/{sheetId}
  name: string
  pairingCode?: string       // set by an admin, removed once used
  scoreboardUid?: string     // the paired scoreboard's anonymous Auth uid
  pairedAt?: timestamp       // when that scoreboard paired
  liveGame?: {               // the game in progress, removed when it ends
    updatedAt: timestamp     // server time of the scoreboard's last write
    currentEnd: int
    numberOfEnds?: int       // absent from builds before it was sent
    league?: { id: string, name: string }   // league games only
    team1: { name: string, color: { name, hex }, score: int, hasHammer: bool,
             hadLastStoneFirstEnd: bool,
             teamId?: string, externalId?: string }   // the last two in league games
    team2: { ...the same }
    ends?: [...as in games below]   // the ends so far; absent from builds before it was sent
  }
  device?: {                 // what the scoreboard last said about itself
    appVersion: string
    buildId?: string         // commit SHA; absent on local builds
    lastSeenAt: timestamp    // server time of the report
    sessionStartedAt: timestamp
    clientTime: timestamp    // the device's own clock
    platform: string         // 'web', 'android', ...
    renderer?: string        // web only: 'wasm' or 'js'
    userAgent?: string
    screen?: { width: int, height: int, pixelRatio: number }
    timezone: string
    utcOffsetMinutes: int
    updateTargetBuildId?: string
    lastReloadAttemptAt?: timestamp
    lastSyncError?: { operation: string, message: string, at: timestamp }
  }

clubs/{clubId}/sheets/{sheetId}/games/{gameId}
  startedAt: timestamp
  finishedAt: timestamp
  numberOfEnds: int
  league?: { id: string, name: string }     // league games only
  team1: { name: string, color: { name, hex }, totalScore: int, hadLastStoneFirstEnd: bool,
           teamId?: string, externalId?: string }     // the last two in league games
  team2: { ...the same }
  ends: [{
    endNumber: int
    scoringTeam: string | null       // team name; null for a blank end
    scoringTeamSlot?: 'team1' | 'team2' | null
    score: int
    gameTimeInSeconds: int           // -1 on ends recorded before the game clock
  }]
  webhook?: {                        // set once the game is posted to the club's webhook
    attemptedAt: timestamp
    ok?: bool                        // absent if the post never finished
    status?: int                     // the receiver's HTTP status, if it answered
    error?: string
  }
```

Club IDs are readable slugs (`windy-city-curling`) when the super admin picks
one, otherwise Firestore auto IDs. `scoringTeamSlot` was added because two
teams can share a name; older games only have `scoringTeam`. A team's `name`
is the name of its rock color in an open game and the league team's name in a
league game; `color` is absent on games from before it was recorded.

## Roles

Roles are Firebase Auth custom claims, set only by Cloud Functions or the
admin scripts.

| Role                 | Claims                                  | Signs in with           | Can                                                                                   |
| -------------------- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| Super admin          | `role: 'superadmin'`                    | Email and password      | Everything: create clubs and club admins, rotate API keys, read and write all data   |
| Club admin           | `role: 'clubadmin'`, `clubId`           | Email and password      | Their club: read it and its API key, generate and clear pairing codes, set the rock colors, the completed game webhook and the scoreboard admin PIN, manage leagues and teams, read game history |
| Paired scoreboard    | `role: 'scoreboard'`, `clubId`, `sheetId` | Anonymous             | Its own sheet: read it, write `liveGame` and `device`, add completed games. Its club: read `config` and `leagues` |
| Display              | `role: 'display'`, `clubId`, `linkId`   | Custom token from `startDisplaySession` | Its club: read `private/displayState` and `private/displayBranding`; read its own link |
| Anyone               | —                                       | —                       | Read `appConfig/scoreboard`                                                           |

A scoreboard's claims only tell the rules which sheet to look at. Access to
its sheet has always been decided by the sheet's `scoreboardUid`, and reading
the club's `config` and `leagues` needs both: the claims and a sheet that still names that
scoreboard. So a scoreboard that is disconnected or replaced loses access
straight away, whatever its claims say.

The first super admin of a project is created with
`scripts/set-super-admin.js`; after that, `setSuperAdminClaim` promotes
others. Club admins are created from the admin portal through
`provisionClub` (a new club with its first admin and scoreboard PIN) and `addClubAdmin`, and
taken off again with `removeClubAdmin`, which deletes the account. A token
issued before then keeps its club admin claim until it expires, at most an
hour later.

Sheets are renamed and unpaired by writing the sheet directly. Deleting one
goes through `deleteSheet` (super admins only), which also deletes its
`games`, since a client delete would leave them behind.

## Pairing a scoreboard

1. A club admin generates a six character code for a sheet in the admin
   portal. It is stored as `pairingCode` on the sheet.
2. On the scoreboard's game setup screen, Connection opens the dialog the
   code is entered in.
3. The app signs in anonymously and calls the `pairSheet` callable function.
4. `pairSheet` finds the sheet holding the code with a collection group query
   and sets the caller's scoreboard claims. Then in a transaction it sets
   `scoreboardUid` to the caller's uid, records `pairedAt`, and removes the
   code along with any `device` status left by the previous scoreboard. It
   clears the previous scoreboard's claims and returns the club and sheet IDs
   and names.
5. The app refreshes its ID token so the claims take effect, and saves those
   four values in shared preferences. From then on it is paired.

`pairSheet` refuses callers who already have an admin role, because setting
the scoreboard claims would replace it.

Clients cannot query or read pairing codes or club documents themselves. The
rules used to allow that, which let any signed in client list every unpaired
sheet's code and read every club's API key; moving the lookup into
`pairSheet` closed it.

## Disconnecting a scoreboard

Disconnecting is kept out of the way, because scoreboards sit where anyone can
tap at them. A connected scoreboard's setup screen only says "Connected as
club – sheet". Pressing and holding that for four seconds, with a ring filling
in meanwhile, opens a dialog showing the connection with a Disconnect button,
and that asks for the club's admin PIN. Settings has nothing about the
connection.

Each club has one PIN. A super admin sets it when creating the club, and the
club's admins can change it in the admin portal. It is kept in `clubs/{clubId}/private/scoreboardPin`, which scoreboards cannot read.
The app sends what was typed to the `unpairSheet` callable function, which
checks it, removes `scoreboardUid` from the sheet and clears the scoreboard's
claims. The rules do not let a scoreboard remove its own `scoreboardUid`, so
the PIN cannot be skipped. A club with no PIN set, which only clubs created
before PINs can be, cannot disconnect its scoreboards until an admin sets one
or `scripts/backfill-scoreboard-pins.js` gives it one.

`unpairSheet` asks for no PIN when the sheet is not the caller's, which is
the case for a scoreboard whose pairing was lost: there is nothing left to
protect, and it lets that scoreboard be cleared and paired again. Nothing
changes on the sheet.

Once the function succeeds the app signs out and clears the saved values.
Scoring carries on locally either way.

A sheet can be taken away from a scoreboard without it being told: pairing
another device replaces `scoreboardUid`, and the first one still has its saved
values. It finds out when the rules refuse one of its writes, usually the
status report it sends on startup. `SyncService` then sets
`RegistrationService.pairingLost`, and the setup screen says scores are not
syncing, and the connection dialog prompts to disconnect and pair again. A later write that succeeds clears
it.

## Syncing scores

`SyncService` in the app does nothing unless the scoreboard is paired.
Writes are fire and forget, so a failed write never interrupts scoring, and
Firestore's offline cache sends them once the connection is back.

`GameController`, which holds the game on the scoreboard, makes the calls at
these points:

| Event in the app         | Firestore write                                           |
| ------------------------ | --------------------------------------------------------- |
| The app starts           | Remove `liveGame`                                         |
| A game is started        | Overwrite `liveGame` on the sheet                         |
| A score is entered or edited | Overwrite `liveGame` on the sheet                     |
| The teams are changed    | Overwrite `liveGame` on the sheet                         |
| Finish Game              | Add a `games` document and remove `liveGame`, in one batch |

A game is live from the moment it starts, so the first end shows at 0-0.

A game that is never finished would otherwise stay live forever. The app
does not persist game state, so it removes `liveGame` on startup. For a
scoreboard that is switched off or offline, readers ignore a `liveGame`
whose `updatedAt` is more than 120 minutes old: the REST API reports it as
null and the admin portal shows the sheet as idle. The stored field is left
alone until that scoreboard next starts up or starts a game.

## Display summary

The score bug for live streams and the warm room screen show a club's sheets
as they change. Reading the sheets themselves would cost a read per sheet
each time a display looked, so each club has one summary document,
`private/displayState`, that a display listens to instead: one read when it
starts and one per change after that, however long it stays open.

Two functions in `functions/src/display/triggers.ts` keep it up to date:

- `syncDisplaySheet` fires on every write to a sheet and copies its name and
  live game. A scoreboard's status report every half hour changes neither, so
  it ends there without a read or a write. Otherwise it rebuilds the entry
  from the sheet as it is now, in a transaction, rather than from the event:
  events can arrive late, out of order or twice, and this way a late one
  writes the current state again instead of an older one. A deleted sheet is
  removed.
- `syncDisplayLastGame` fires on each completed game and keeps it as the
  sheet's `lastGame`, unless the one already there finished later, which
  happens when a scoreboard that was offline delivers an old game.

Each writes only its own fields of the entry, so neither undoes the other.
The entries carry only what a display shows: league and team names, colors
and scores, not the IDs integrations match on.

What a display shows for a sheet is decided by `sheetView` in
`functions/src/display/state.ts`. A live game comes first, so the next draw
replaces the final score as soon as its game starts. A live game that has
gone two hours without a write is ignored, as in the REST API. Otherwise the
last game is shown as the final score for ten minutes after it finished, and
after that the sheet is idle. That is worked out by the display from the
times in the summary, so nothing has to be written when the ten minutes are
up.

Sheets that existed before the functions were deployed are added by
`scripts/backfill-display-state.js` (see the README), or by their next
change.

## Display links

A display, a warm room screen or an OBS browser source, has nobody to sign
in, so it signs in with a link instead. A club admin makes one per screen on
the portal's Displays tab, through
`createDisplayLink`. Its token is `<linkId>.<secret>`, the secret being 128
random bits in hex. The portal shows it built into the link's own URL,
whenever a club admin opens the link:

```
https://curlingscoreboard.app/display/{clubId}#k=<token>
```

That URL never has to change, because a link also says what its screens
show, in `settings`: the warm room with its view, or a sheet's score bug
with its size and bottom line. A new link shows the warm room's totals.
Club admins change the settings, and the link's name, in the portal, which
writes them directly; the rules hold them to what the pages understand.
The page at the link's URL reads its own link (the rules let a display read
that one link and no other) and moves on to the page the settings name,
with `link=1` added after the `#`. A page opened that way keeps listening
to the link and moves again when the settings change, so a screen can be
pointed at another sheet or view from the portal, mid-stream if need be.
A page opened at its own URL, without `link=1`, stays where it is.

The token is kept on the link as `token`, so the URL can be copied again at
any time, the way club admins can see the API key. Only the club's admins,
super admins and the screen holding it can read it, and only the functions
write it. Signing in still checks a SHA-256 hash of the secret, which is
all that links made before the token was kept have; the portal shows those
without a URL until they are given a new one.

`resetDisplayLink` gives a link a new secret, and so a new URL, for one that
got out or was lost before it was copied. The settings stay, and screens on
the old URL stop within the hour, as for a removed link.

One link works for every page at its club. The token goes after the `#`,
which browsers never send to a server, so it stays out of request logs and
`Referer` headers. The page reads it and calls `startDisplaySession`, which
checks it in constant time and returns a custom token for the user
`display:{clubId}:{linkId}` with the display claims. Those let the page read
its club's display summary and nothing else. The club API key is never used:
it would expose the whole API, and replacing it would break the club's other
integrations.

`revokeDisplayLink` deletes the link and its Auth user. No new session can
start from it, and a screen already signed in stops within the hour, when
its ID token expires and cannot be renewed. The rules do not look the link
up on each read, which would cost a read every time a display listens.

`lastUsedAt` is written at most once an hour, so a screen that reloads often
does not write each time. A club can have 20 links.

Minting custom tokens needs the functions' service account to be able to
sign as itself; see "Display links" in the README.

## Display pages

The `display` function serves the display pages on the scoreboard's hosting
site, under `/display/**` through a Hosting rewrite, like the API:

- `/display/{clubId}/sheets/{sheetId}/bug`: the score bug
- `/display/{clubId}/warm-room`: every sheet, for a screen in the club
- `/display/{clubId}`: a display link's own URL, which opens the page its
  settings name
- `/display/assets/*`: the pages' scripts and styles, from
  `functions/src/display/assets`, which `npm run build` copies next to the
  compiled function

A page is the same for everyone and never reads Firestore on the server: the
link's token is after the `#`, which the function never sees. The HTML only
holds a JSON block saying which club and sheet to show, the Firebase web
config, and the server's time. The script, `assets/display.js`, then:

1. Signs in. A display already signed in as this link, from an earlier
   load, carries on; otherwise it calls `startDisplaySession` with the token
   and signs in with the custom token it returns. The sign-in is kept in the
   browser's IndexedDB, so a reload does not start a new session.
2. Listens to the club's `private/displayState` and redraws on each change.
3. Redraws every 15 seconds as well, because a final score comes down ten
   minutes after the game with no write to say so. `sheetView` there mirrors
   the one in `functions/src/display/state.ts`, with the same limits passed
   in through the page. Times are compared on the server's clock, worked out
   from the time in the page, so a screen with its clock off still takes
   the final score down on time.

A display is left running for weeks, so everything is retried, backing off
to five minutes: a failed sign-in, a listener the server ended, a sign-in
that could not be renewed. A link the server refuses, or a URL with no
token, is said on the page so it can be fixed while setting up; the page is
otherwise silent about trouble and keeps showing the last scores.

The Firebase SDK is loaded as ES modules from `www.gstatic.com`, pinned to
the version the admin portal uses. Nothing is inline, so the
`Content-Security-Policy` allows scripts only from the function and gstatic,
connections only to the Firebase services the page uses, and no framing.
Responses carry `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer`; pages are `no-store`, since they carry the
server's time, and assets `no-cache`.

The score bug is transparent, so an OBS browser source shows only the bug.
It shows the two teams with their rock colors and scores, the hammer in a
live game, and the end or Final, and hides itself while the sheet is idle.
`?scale=` (0.5 to 4) sizes it, and `?label=league` or `?label=none` changes
the sheet name under the scores. `?preview` is for setting it up: while the
sheet has no game it shows a faded, outlined stand-in at the bug's real
size instead of nothing, so it can be placed in OBS between draws. A link's
own URL carries `?preview` on to the page it opens, and the portal's
Preview button opens a link that way.

The warm room screen shows every sheet in the summary, in name order with
numbers in order ("Sheet 2" before "Sheet 10"), on a dark background meant
for a TV. Each card has the sheet's name, the end or Final, the league, and
both teams with their rock colors, scores and the hammer; an idle sheet is
dimmed and says "No game". The page tries each number of columns and keeps
the one that makes the cards largest, then sizes everything in a card from
its width, so any number of sheets fills the screen without scrolling, on a
1080p or 4K TV or one turned on its side. A clock in the corner, on the
server's time, shows the screen is still running.

A club can give the screen its own title in place of "Live Scores", and a
logo beside it, on the portal's Displays tab. Both are kept in `private/displayBranding`, which the page listens to
alongside the summary: one more read when it starts, and one when the club
changes them. The portal shrinks the logo in the browser to fit 800 by 200
pixels and keeps it as a PNG, or WebP when a PNG would be too large, in a
data URL. Keeping it in Firestore rather than Cloud Storage means the page
needs nothing but Firestore, and the CSP already allows `data:` images. Any
image the browser can show, SVG included, is redrawn as a plain image, and
the rules accept only PNG, JPEG and WebP data URLs, so nothing that can
carry a script is stored.

`?view=full` shows each game end by end instead, like the scoreboard's own
baseball layout: a column per end, the scoring team's points on its rock
color and 0 for the other team, the end being played picked out, and the
totals. It has as many columns as the game's `numberOfEnds`, or more once
extra ends are played. Its cards are wider and shorter, so the layout asks
for that shape. A live game from a scoreboard that does not send its ends
yet is shown by its totals among them. `?view=cycle` shows the two in turn,
`?every=` seconds each (20 by default).

Both pages say Final, not the end, once a live game has played its ends
and is not tied, as the scoreboard does before anyone taps Finish Game, and
"Extra end" once a tied game goes past them.

The rewrite needs the `display` function to exist, so in a new project deploy
the functions before the scoreboard's hosting.

## Rock colors

The scoreboard is red and yellow out of the box: those two colors are built
into the app (`RockColors.defaults`), so an unpaired or offline scoreboard
needs nothing from Firebase to show them.

A club that plays with other colors picks them in the admin portal from a
fixed list, which writes `rockColors` to `clubs/{clubId}/config/scoreboard`.
`RockColorsService` on a paired scoreboard listens to that document and keeps
the last colors it saw in shared preferences, so they are still right when it
starts up offline. Disconnecting clears them. Choosing red and yellow removes
the setting, leaving the app's defaults as the only definition of them.

Colors are read when a game starts and copied onto its teams, so a change
never lands in the middle of a game. They are written with `liveGame` and the
completed game as each team's `color`, and the team `name` is the color's
name ("Blue", "Green"), which is what the REST API returns.

## Leagues and teams

A league is one document holding its weekly schedule and its teams. Teams are
embedded, not a subcollection, so a scoreboard gets everything it needs to
offer teams in one read per league, and an import replaces a league's teams
in a single write.

Club admins manage leagues in the admin portal: by hand on a league's page,
or by importing a CSV file with one row per team.

```
league,day,start,end,team,external_id
Monday Night,Mon,18:30,20:30,Team Smith,1042
```

Only `league` and `team` are required. The file is parsed in the browser
(`admin/src/lib/leagueCsv.ts`) and the portal shows what would be added,
renamed and removed before writing anything, all in one batch. Leagues match
by name. Teams match by `external_id` when both sides have one, otherwise by
name, and keep their `id`, so a re-import or a rename does not orphan games
recorded against a team. Teams the file does not mention are kept or removed,
whichever the admin chooses. Times and days are plain values with no time
zone: scoreboards compare them with their own clock.

Dates and times are stored as strings for the same reason. A Firestore
timestamp is an instant, and "Mondays at 18:30" is not one.

### League games on the scoreboard

`LeagueService` on a paired scoreboard listens to its club's active leagues
and, like the rock colors, keeps the last ones it saw for an offline start.
The game setup screen fills the display, and each of its settings is a row
of equal-width segments spanning the same width, so the controls line up down
both edges and grow with the screen.

While there are any leagues, the setup screen gains one bar above its settings.
Leaving the bar alone starts an open game exactly as before.

The left of the bar is the league. It follows the scoreboard's local clock:
if exactly one league is in a draw (from half an hour before it starts until
it ends, within the league's season) the bar names it and marks it as playing
now, and a club's only league is always named. Tapping it opens a modal of
the club's leagues, the ones playing now first, to choose another; that
clears any teams already picked. The modal puts leagues two across once there
are more than three and shares its height between the rows, so a club's ten
or so leagues are all on screen without scrolling. The bar re-reads the clock every minute, because the setup
screen is left open between games, sometimes overnight.

The right of the bar opens a full screen team picker for that league. With no
league to go on, it asks for the league first and carries straight on.

The picker is only teams: no title and no league control, so the buttons get
the room. Every team in the league is one large button on a fixed four by
four grid, which holds the thirteen teams of the largest league expected. A
smaller league leaves cells empty instead of growing its buttons, so the
screen looks the same from one league to the next; only a league of more than
sixteen changes the grid. All buttons share one text size, capped so that
most leagues match, and smaller only when a team name is unusually long. The first team tapped throws the first rock color and the
second the other. Two slots at the top show who is picked; tapping a slot or
a picked team clears it, a third tap replaces the second team, and a swap
button exchanges the colors. Cancel and Done are bottom right. Back on the
setup screen the bar shows the matchup and the hammer choice names the two
teams.

Done sits in the same corner as Start Game, so the setup screen ignores taps
for a moment after the picker closes. Otherwise a double tap on Done would
start the game.

### Changing the teams during a game

Teams forget to pick their names, or pick the wrong ones. While a club has
leagues, a Teams button on the scoreboard and a tap on the team names under
the scores both open the same team picker, at any point until the game
finishes.
A league game picks from its own league, starting from the teams it has; an
open game asks for the league first and becomes a league game. The rock
colors stay as they are, so the swap button is how a matchup put on the wrong
colors is fixed.

Once a team has a name of its own, the scoreboard shows both names on their
rock colors under the total scores, so the players can check them. An open
game has none, as its names would only spell out the colors.

The game carries the league and each team's `teamId` and `externalId`, which
are written with `liveGame` and the completed game. The name and IDs are
copied when the teams are picked, so the record stands by itself whatever
happens to the league afterwards, and it is what a later score reporter needs
to match a result to a team.

## Scoreboard status

So the admin portal can show what each sheet is running, a paired scoreboard
reports on itself. `DeviceStatusService` builds the report and `SyncService`
overwrites the sheet's `device` field with it:

- when the app starts
- right after pairing
- when the app returns to the foreground
- when it learns a new build has been deployed
- every 30 minutes in between (`Constants.deviceStatusHeartbeat`)

`lastSeenAt` is the server's time, so the portal can trust it; everything else
is whatever the app says, and is only ever displayed. The portal calls a
scoreboard offline once it has missed two heartbeats (65 minutes), and shows
"Update pending" while its `buildId` differs from `appConfig/scoreboard`.
`lastSyncError` is the most recent failed write since the app started, which
is otherwise invisible because writes are fire and forget.

The public REST API builds its sheet responses field by field, so none of
this is exposed there.

## Admin portal

Routes depend on the signed in role:

- Super admin: `/` lists every club and creates new ones; `/clubs/:clubId`
  shows a club; `/clubs/:clubId/sheets/:sheetId/games` its game history;
  `/clubs/:clubId/leagues/:leagueId` a league.
- Club admin: `/` is their club; `/sheets/:sheetId/games` a sheet's history;
  `/leagues/:leagueId` a league.

The club page has four tabs, the one open kept in the URL (`?tab=`):

- **Sheets & Games**: sheets with their live games, scoreboard status and
  pairing codes, beside the games from the last seven days.
- **Leagues**: the club's leagues.
- **Displays**: the display links, and the warm room screen's title and logo.
- **Settings**, one group at a time, also kept in the URL (`?section=`), with
  a list of groups beside it, or a dropdown on a narrow window:
  - Scoreboards: the rock colors and the scoreboard admin PIN.
  - Integrations: the API key and the completed game webhook, which once
    saved is shown in short until it is edited.
  - Club Admins: super admins only.

Every tab and group stays mounted while hidden, so a half-made change
survives moving between them. Only super admins can add sheets, rotate the
key or add club admins, and the portal tags what only they see. (The rules
would let a club admin write their club's sheets; the portal just doesn't
offer it.)

## Public REST API

The `api` function is an Express app, served on the scoreboard's hosting site
under `/api/**` through a Hosting rewrite. It is read only:

- `GET /api/v1/clubs/{clubId}`
- `GET /api/v1/clubs/{clubId}/sheets/{sheetId}`
- `GET /api/v1/clubs/{clubId}/sheets/{sheetId}/games?limit=`
- `GET /api/v1/clubs/{clubId}/leagues`
- `GET /api/v1/clubs/{clubId}/leagues/{leagueId}`

Live and completed games carry `league` (null for an open game) and, in a
league game, each team's `teamId` and `externalId`, which match the teams the
league endpoints return. A live game also carries `numberOfEnds` and the
`ends` played so far, in the same form as a completed game's; both are null
for a game from a scoreboard build that predates them.

Every request needs the club's key in the `X-API-Key` header, compared in
constant time against `clubs/{clubId}/private/apiKey`. The full description is
`app/web/openapi.yaml`, rendered at `/api-docs/` on the same site.

Club websites and display pages are expected to call the API from the
browser, so it allows any origin (`Access-Control-Allow-Origin: *`) for `GET`
with the `X-API-Key` header, never with credentials, and lets browsers cache
the preflight for a day. A key used in browser code is visible to anyone who
views the page; an integration that needs to keep its key private should call
the API from a server.

## Completed game webhook

A club can have each finished game posted to a URL, usually a Slack or
Discord incoming webhook. A club admin or super admin sets it under Settings,
Integrations in the admin portal, along with whether to post every game or only league
games. A league game here is one where either team has a `teamId`.

`sendCompletedGameWebhook` is a Firestore trigger on new `games` documents, so
it fires on the Finish Game write and nothing in the scoreboard app knows
about it. A game nobody finishes is never posted, and a scoreboard that was
offline posts its games when it reconnects.

The body is JSON: `text` and `content` both hold the message, because Slack
reads the first and Discord the second, followed by `event`, `club`, `sheet` and the
`game` exactly as the REST API returns it. It is described under Webhooks in
`app/web/openapi.yaml`.

- **Quiet on Discord.** Every post carries `flags: 4096`, Discord's
  `SUPPRESS_NOTIFICATIONS`, so results land in the channel without buzzing
  anyone's phone, and `allowed_mentions: { parse: [] }`, so an `@everyone`
  or role mention typed into a club's template pings nobody. Slack ignores
  both.
- **Message.** The club can write its own message in the portal, with
  variables in braces such as `{team1}`, `{league}` or `{date}`, filled in by
  `functions/src/webhookMessage.ts`. Without one it is the result on one line
  ("Monday Night, Sheet 2: Team Smith 7, Team Jones 4"). Dates and times are
  written in the time zone saved with the template, which the portal
  defaults to the admin's own. `{date}`, `{shortDate}` and `{weekday}` are
  the day the game started, so a late draw that runs past midnight keeps
  the night it was played; `{finishDate}` is the day it ended. A name in braces that is not a variable is
  posted as written, and the portal warns about it. The portal lists the
  variables with sample values for its preview in
  `admin/src/lib/webhookMessage.ts`, so a new variable goes in both.
- **Once per game.** Triggers can be delivered more than once, so the function
  sets `webhook.attemptedAt` on the game in a transaction before posting and
  skips a game that already has it. A post that fails is not sent again later.
- **Retries.** No answer within 8 seconds, a 5xx or a 429 is tried twice more
  within the same run. Other answers are final.
- **Where it may post.** The URL comes from a club admin and the request is
  made from inside Google Cloud, so it must be `https`, must resolve to a
  public address, and redirects are not followed. The functions emulator
  skips these checks so the tests can post to a local server.
- **Status.** The outcome of each post (`ok`, the HTTP `status`, any `error`)
  is written to the game's `webhook` field, which the portal shows when a
  game is expanded, and marks on the game's row when it failed. The last
  post, game or test, is also written to `private/webhookStatus` for the
  portal's settings. That is a separate document so the rule on `private/webhook`
  can allow club admins exactly the settings they choose. The REST API leaves the
  game's `webhook` field out.

The portal's Send Test button calls `sendTestWebhook`, which posts a sample
message to the saved URL, with the club's template filled in for a made up
game, and returns how it went. The URL is treated like a
password: it lives under `private`, which scoreboards cannot read, and the
portal shows it masked once saved.

## Reloading scoreboards after a web deploy

Scoreboards are left open for weeks, so the web app reloads itself onto new
builds, but only between games.

1. Each web deploy builds with `--dart-define=BUILD_ID=<commit SHA>`, writes
   `build.json` with the same ID next to the app, and then writes it to
   `appConfig/scoreboard`.
2. `UpdateService` listens to `appConfig/scoreboard`. As a fallback it also
   fetches `build.json` at startup, whenever the app returns to the
   foreground, and daily at 1 AM local time.
3. When the deployed ID differs from the running one, the scoreboard waits
   until the game start dialog is showing (no game in progress), then for two
   minutes without a touch, then shows a 15 second countdown banner and
   reloads. Any touch restarts the wait.
4. If a reload does not pick up the new build (a stale cache, say), it tries
   that build again only after ten minutes, so it never reload loops.

Native builds and local builds without a `BUILD_ID` skip all of this.

## Hosting headers

The scoreboard is built with WebAssembly and served cross-origin isolated
(`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: credentialless`), with `Cache-Control:
no-cache` so a reload always fetches the newest build. See `firebase.json`.

## Environments

The app picks its Firebase project at build time with
`--dart-define=FIREBASE_ENV=dev|prod` (dev by default), choosing between
`lib/firebase_options_dev.dart` and `lib/firebase_options_prod.dart`. The admin
portal does the same with `VITE_ENV=prod`. Firebase web config values are not
secrets and are committed.

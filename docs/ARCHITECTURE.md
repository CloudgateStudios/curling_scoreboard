# Architecture

<!-- cspell:ignore credentialless Embedder -->

How the scoreboard app, the admin portal and the Cloud Functions fit together
on Firebase. For setup and day to day commands, see the [README](../README.md);
for how to make and ship a change, see [CONTRIBUTING](../CONTRIBUTING.md).

## Overview

| Piece        | Runs on                                                       | Talks to                                                                                            |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `app/`       | Flutter web (Firebase Hosting, `app` target), Android, others | Firestore directly; the `pairSheet` function                                                        |
| `admin/`     | React SPA (Firebase Hosting, `admin` target)                  | Firestore directly; the `provisionClub`, `addClubAdmin`, `removeClubAdmin`, `deleteSheet` functions |
| `functions/` | Cloud Functions (2nd gen, `us-central1`)                      | Firestore and Auth with admin access                                                                |

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
    league?: { id: string, name: string }   // league games only
    team1: { name: string, color: { name, hex }, score: int, hasHammer: bool,
             hadLastStoneFirstEnd: bool,
             teamId?: string, externalId?: string }   // the last two in league games
    team2: { ...the same }
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
| Club admin           | `role: 'clubadmin'`, `clubId`           | Email and password      | Their club: read it and its API key, generate and clear pairing codes, set the rock colors, manage leagues and teams, read game history |
| Paired scoreboard    | `role: 'scoreboard'`, `clubId`, `sheetId` | Anonymous             | Its own sheet: read it, write `liveGame` and `device`, add completed games, disconnect itself. Its club: read `config` and `leagues` |
| Anyone               | —                                       | —                       | Read `appConfig/scoreboard`                                                           |

A scoreboard's claims only tell the rules which sheet to look at. Access to
its sheet has always been decided by the sheet's `scoreboardUid`, and reading
the club's `config` and `leagues` needs both: the claims and a sheet that still names that
scoreboard. So a scoreboard that is disconnected or replaced loses access
straight away, whatever its claims say.

The first super admin of a project is created with
`scripts/set-super-admin.js`; after that, `setSuperAdminClaim` promotes
others. Club admins are created from the admin portal through
`provisionClub` (a new club with its first admin) and `addClubAdmin`, and
taken off again with `removeClubAdmin`, which deletes the account. A token
issued before then keeps its club admin claim until it expires, at most an
hour later.

Sheets are renamed and unpaired by writing the sheet directly. Deleting one
goes through `deleteSheet` (super admins only), which also deletes its
`games`, since a client delete would leave them behind.

## Pairing a scoreboard

1. A club admin generates a six character code for a sheet in the admin
   portal. It is stored as `pairingCode` on the sheet.
2. On the scoreboard, Settings → Connect to Club, the code is entered.
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

Disconnecting removes `scoreboardUid` from the sheet (best effort), signs out
and clears the saved values. Scoring carries on locally either way.

A sheet can be taken away from a scoreboard without it being told: pairing
another device replaces `scoreboardUid`, and the first one still has its saved
values. It finds out when the rules refuse one of its writes, usually the
status report it sends on startup. `SyncService` then sets
`RegistrationService.pairingLost`, and Settings shows the scoreboard as
disconnected with a prompt to pair again. A later write that succeeds clears
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
| Finish Game              | Add a `games` document and remove `liveGame`, in one batch |

A game is live from the moment it starts, so the first end shows at 0-0.

A game that is never finished would otherwise stay live forever. The app
does not persist game state, so it removes `liveGame` on startup. For a
scoreboard that is switched off or offline, readers ignore a `liveGame`
whose `updatedAt` is more than 120 minutes old: the REST API reports it as
null and the admin portal shows the sheet as idle. The stored field is left
alone until that scoreboard next starts up or starts a game.

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

The game carries the league and each team's `teamId` and `externalId`, which
are written with `liveGame` and the completed game. The name and IDs are
copied at the start of the game, so the record stands by itself whatever
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

The club page shows sheets with their live games, scoreboard status, pairing codes, games from the
last seven days, leagues, the rock colors and the API key. Only super admins can add sheets, rotate the
key or add club admins. (The rules would let a club admin write their club's
sheets; the portal just doesn't offer it.)

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
league endpoints return.

Every request needs the club's key in the `X-API-Key` header, compared in
constant time against `clubs/{clubId}/private/apiKey`. The full description is
`app/web/openapi.yaml`, rendered at `/api-docs/` on the same site.

Club websites and display pages are expected to call the API from the
browser, so it allows any origin (`Access-Control-Allow-Origin: *`) for `GET`
with the `X-API-Key` header, never with credentials, and lets browsers cache
the preflight for a day. A key used in browser code is visible to anyone who
views the page; an integration that needs to keep its key private should call
the API from a server.

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

# Architecture

<!-- cspell:ignore credentialless Embedder -->

How the scoreboard app, the admin portal and the Cloud Functions fit together
on Firebase. For setup and day to day commands, see the [README](../README.md);
for how to make and ship a change, see [CONTRIBUTING](../CONTRIBUTING.md).

## Overview

| Piece        | Runs on                                                       | Talks to                                                    |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `app/`       | Flutter web (Firebase Hosting, `app` target), Android, others | Firestore directly; the `pairSheet` function                |
| `admin/`     | React SPA (Firebase Hosting, `admin` target)                  | Firestore directly; the `provisionClub`, `addClubAdmin` functions |
| `functions/` | Cloud Functions (2nd gen, `us-central1`)                      | Firestore and Auth with admin access                        |

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

clubs/{clubId}/admins/{uid}
  email: string
  displayName: string | null

clubs/{clubId}/sheets/{sheetId}
  name: string
  pairingCode?: string       // set by an admin, removed once used
  scoreboardUid?: string     // the paired scoreboard's anonymous Auth uid
  liveGame?: {               // the game in progress, removed when it ends
    currentEnd: int
    team1: { name: string, score: int, hasHammer: bool }
    team2: { name: string, score: int, hasHammer: bool }
  }

clubs/{clubId}/sheets/{sheetId}/games/{gameId}
  startedAt: timestamp
  finishedAt: timestamp
  numberOfEnds: int
  team1: { name: string, totalScore: int, hadLastStoneFirstEnd: bool }
  team2: { name: string, totalScore: int, hadLastStoneFirstEnd: bool }
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
teams can share a name; older games only have `scoringTeam`.

## Roles

Roles are Firebase Auth custom claims, set only by Cloud Functions or the
admin scripts.

| Role                 | Claims                                  | Signs in with           | Can                                                                                   |
| -------------------- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| Super admin          | `role: 'superadmin'`                    | Email and password      | Everything: create clubs and club admins, rotate API keys, read and write all data   |
| Club admin           | `role: 'clubadmin'`, `clubId`           | Email and password      | Their club: read it and its API key, generate and clear pairing codes, read game history |
| Paired scoreboard    | none (matched by `scoreboardUid`)       | Anonymous               | Its own sheet: read it, write `liveGame`, add completed games, disconnect itself       |
| Anyone               | —                                       | —                       | Read `appConfig/scoreboard`                                                           |

The first super admin of a project is created with
`scripts/set-super-admin.js`; after that, `setSuperAdminClaim` promotes
others. Club admins are created from the admin portal through
`provisionClub` (a new club with its first admin) and `addClubAdmin`.

## Pairing a scoreboard

1. A club admin generates a six character code for a sheet in the admin
   portal. It is stored as `pairingCode` on the sheet.
2. On the scoreboard, Settings → Connect to Club, the code is entered.
3. The app signs in anonymously and calls the `pairSheet` callable function.
4. `pairSheet` finds the sheet holding the code with a collection group query,
   then in a transaction sets `scoreboardUid` to the caller's uid and removes
   the code. It returns the club and sheet IDs and names.
5. The app saves those four values in shared preferences. From then on it is
   paired.

Clients cannot query or read pairing codes or club documents themselves. The
rules used to allow that, which let any signed in client list every unpaired
sheet's code and read every club's API key; moving the lookup into
`pairSheet` closed it.

Disconnecting removes `scoreboardUid` from the sheet (best effort), signs out
and clears the saved values. Scoring carries on locally either way.

## Syncing scores

`SyncService` in the app does nothing unless the scoreboard is paired.
Writes are fire and forget, so a failed write never interrupts scoring, and
Firestore's offline cache sends them once the connection is back.

| Event in the app         | Firestore write                                           |
| ------------------------ | --------------------------------------------------------- |
| A score is entered or edited | Overwrite `liveGame` on the sheet                     |
| Finish Game              | Add a `games` document, then remove `liveGame`            |

## Admin portal

Routes depend on the signed in role:

- Super admin: `/` lists every club and creates new ones; `/clubs/:clubId`
  shows a club; `/clubs/:clubId/sheets/:sheetId/games` its game history.
- Club admin: `/` is their club; `/sheets/:sheetId/games` a sheet's history.

The club page shows sheets with their live games, pairing codes, games from the
last seven days and the API key. Only super admins can add sheets, rotate the
key or add club admins. (The rules would let a club admin write their club's
sheets; the portal just doesn't offer it.)

## Public REST API

The `api` function is an Express app, served on the scoreboard's hosting site
under `/api/**` through a Hosting rewrite. It is read only:

- `GET /api/v1/clubs/{clubId}`
- `GET /api/v1/clubs/{clubId}/sheets/{sheetId}`
- `GET /api/v1/clubs/{clubId}/sheets/{sheetId}/games?limit=`

Every request needs the club's key in the `X-API-Key` header, compared in
constant time against `clubs/{clubId}/private/apiKey`. The full description is
`app/web/openapi.yaml`, rendered at `/api-docs/` on the same site.

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

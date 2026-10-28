# Scripts

Node scripts run by hand, from a developer's machine, against a Firebase
project with admin access: seeding dev, creating the first super admin, and
one-off migrations and backfills that went with a deploy.

## Running them

```bash
gcloud auth application-default login   # or set GOOGLE_APPLICATION_CREDENTIALS
cd scripts
npm install
node <script>.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node <script>.js  # prod
```

They target `curling-scoreboard-dev` unless `FIREBASE_PROJECT_ID` says
otherwise. CI only checks their syntax.

| Script                          | What it does                                                          | When                                                  | Safe to re-run          |
| ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| `seed-dev.js`                   | Clubs, sheets, leagues and game history for dev                       | A new dev project, or to get test data                | Adds more games each run |
| `set-super-admin.js <email>`    | Makes an existing user a super admin                                  | The first super admin of a project                    | Yes                     |
| `migrate-api-keys.js`           | Moves API keys to `private/apiKey`, giving every club a new key       | Once a project, after the deploy that moved the keys  | Gives new keys again    |
| `backfill-scoreboard-claims.js` | Gives scoreboards paired before claims existed their claims           | Once a project, after the deploy that added claims    | Yes                     |
| `backfill-scoreboard-pins.js`   | Gives every club without a scoreboard PIN a random one, and prints it | Once a project, after the deploy that added PINs      | Yes                     |
| `backfill-display-state.js`     | Rewrites every club's display summary from its sheets and games       | Once a project, after the display functions were first deployed; again to repair a summary | Yes |

The last four went with past deploys. Each section below says why, for a new
project or for anyone wondering what they did.

## Seeding dev data

A seed script populates the dev Firestore with realistic clubs, sheets,
leagues and game history.

```bash
node seed-dev.js
```

The script is **idempotent for clubs, sheets and leagues**: re-running it
won't create duplicates there. Each run does add a new set of game documents,
so run it once unless you want additional game history.

## Creating the first super admin

See "Admin accounts" in the [README](../README.md#admin-accounts).

## Migrating API keys

Club API keys live at `clubs/{clubId}/private/apiKey`, readable only by that club's admins. Older clubs kept the key on the club document itself, which any signed in client could read. After deploying the rules and functions that use the new location, run the one-off migration once per project. It gives every club a new key and deletes the old field:

```bash
cd scripts
npm install
node migrate-api-keys.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node migrate-api-keys.js  # prod
```

## Backfilling scoreboard claims

Pairing gives a scoreboard custom claims that let it read its club's settings. Scoreboards paired before that was added have none. After deploying the functions and rules that use the claims, run the one-off backfill once per project, so nobody has to pair again:

```bash
cd scripts
npm install
node backfill-scoreboard-claims.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-scoreboard-claims.js  # prod
```

Each scoreboard picks its claims up within the hour, the next time its sign in token refreshes.

## Backfilling scoreboard PINs

A scoreboard asks for its club's admin PIN before it disconnects, and a club without one cannot disconnect its scoreboards at all. New clubs are given a PIN when they are created. After deploying the functions and rules that use the PIN, run the one-off backfill once per project to give every older club a random four digit PIN:

```bash
cd scripts
npm install
node backfill-scoreboard-pins.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-scoreboard-pins.js  # prod
```

It prints each new PIN. Clubs that already have one keep it, so it is safe to re-run. Club admins can see and change their PIN in the admin portal.

## Backfilling display summaries

The score bug and warm room displays read one summary document per club, which the `syncDisplaySheet` and `syncDisplayResults` functions keep up to date. They only see sheets that change after they are deployed, so after deploying them run the one-off backfill once per project. It reuses the functions' compiled code, so build them first:

```bash
(cd functions && npm install && npm run build)
cd scripts
npm install
node backfill-display-state.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-display-state.js  # prod
```

It writes every sheet as it is now, and the games finished in the last day for the warm room's earlier results, so it is safe to re-run.

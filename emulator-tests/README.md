# Emulator tests

Tests that run against the Firebase emulators:

- `rules.test.mjs` checks `firestore.rules`, both that the app's real access
  patterns still work and that the paths we intend to block stay blocked.
- `functions.test.mjs` calls the Cloud Functions in `functions/` the way the
  scoreboard, the admin portal and API clients do.

Both run in the `Validate Firestore Rules and Functions` CI job whenever the
rules, the functions or these tests change. The emulators start from the repo
root's `firebase.json` and use `demo-` project IDs, so nothing reaches a real
Firebase project.

## Running

```sh
npm install
(cd ../functions && npm install)
npm test                # both suites
npm run test:rules      # rules only
npm run test:functions  # builds functions/, then tests them
```

The emulators need a Java runtime (21 or later). macOS ships a stub `java`
that only prints an installation prompt, so if you see

```
Error: Process `java -version` has exited with code 1.
```

point `JAVA_HOME` at a real JDK. Android Studio bundles one:

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

## Checking a different rules file

Pass a path to compare against, which is useful for confirming a change
actually closes something. Run it from the repo root:

```sh
emulator-tests/node_modules/.bin/firebase emulators:exec --only firestore \
  --project demo-rules "node emulator-tests/rules.test.mjs /path/to/other.rules"
```

## What is covered

### Rules

Access the app depends on:

- a paired scoreboard pushing `liveGame` and writing a completed game
- a paired scoreboard reporting its device status
- a paired scoreboard clearing its own uid on disconnect
- a club admin reading their own club and its API key
- a paired scoreboard and a club admin reading the club's `config`
- anyone reading `appConfig/scoreboard` to pick up new builds

Access that must stay denied:

- any client `collectionGroup` query over sheets, filtered or not (pairing
  runs in the `pairSheet` Cloud Function instead)
- claiming a sheet directly, for yourself or another uid
- reading another club's paired sheet directly
- reassigning a paired sheet to another device
- a scoreboard changing anything else on its sheet, writing a device status
  that is not a map or is oversized, or reporting for a sheet it is not
  paired with
- reading or listing club documents without being that club's admin
- reading any club's API key without being its admin, or a club admin
  changing their own key
- reading a club's `config` as a scoreboard from another club, one without
  claims, or one whose claims name a sheet it is no longer paired with
- a scoreboard writing its club's `config`, or reading its club document or
  API key
- writing `appConfig`

### Functions

- `pairSheet` turns away callers who are not signed in, missing and unknown
  codes; pairs the caller with the sheet (matching codes after trimming and
  upper-casing), recording when and dropping the previous scoreboard's device
  status; and does not accept a code twice. It gives the scoreboard claims
  naming its sheet, takes them away from the scoreboard it replaces, and
  refuses admin accounts.
- The REST API requires a key, rejects a wrong one, accepts the club's key,
  returns 404 for an unknown club, ignores a key left on the club
  document from before the API key migration, and leaves the scoreboard's
  device status out of sheet responses.
- `provisionClub` is limited to super admins, and creates the club without a
  key on its document, a 32 character key under `private/apiKey`, and a club
  admin with the right claims.

# Cloud Functions

The backend: callable functions the scoreboard and portal use for what the
rules cannot allow, Firestore triggers that keep summaries and bonspiel state
up to date and post the webhook, and two Express apps served on the
scoreboard's site through Hosting rewrites: the REST API at `/api/**` and the
display pages at `/display/**`. They run as 2nd gen functions in
`us-central1`, on Node 22.

The full list of functions, what fires each and who may call it, is in
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#cloud-functions).

## Building and checking

```bash
npm install
npm run build   # tsc, then copies src/display/assets next to the compiled code
npm run lint
```

There are no unit tests here. The functions are tested end to end against
the emulators in [`emulator-tests/`](../emulator-tests/):

```bash
cd ../emulator-tests && npm test
```

The app and portal always talk to the deployed dev functions; to try a change
there, deploy it:

```bash
firebase deploy --only functions --project curling-scoreboard-dev
```

## Layout

| Path                         | What is in it                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`               | Exports every function, and builds the `api` Express app with its CORS policy                                  |
| `src/admin.ts`               | Super admin callables: clubs, club and bonspiel admins, deleting sheets                                         |
| `src/pairing.ts`             | `pairSheet` and `unpairSheet`                                                                                   |
| `src/webhook.ts`             | The completed game webhook trigger, the test post, and the checks on where it may post                          |
| `src/webhookMessage.ts`      | Filling in a club's webhook message; matches `admin/src/lib/webhookMessage.ts`                                  |
| `src/liveGame.ts`            | How long a live game counts as live without a write                                                             |
| `src/apiKeys.ts`, `src/scoreboardPin.ts` | Where the API key and the scoreboard PIN are kept                                                   |
| `src/middleware/apiKey.ts`   | Checks `X-API-Key` for the REST API                                                                             |
| `src/routes/`                | The REST API's routes: a club, its sheets and their games, leagues, bonspiels                                   |
| `src/bonspiels/state.ts`     | `resolveBonspiel`: who plays in each game, results, standings and event winners                                 |
| `src/bonspiels/triggers.ts`  | `syncBonspielPlan` and `syncBonspielResult`                                                                     |
| `src/display/triggers.ts`    | `syncDisplaySheet` and `syncDisplayResults`, which keep `private/displayState`                                  |
| `src/display/state.ts`       | The display summary's shape, and `sheetView` and `lastGameOf`, which decide what a sheet shows                  |
| `src/display/links.ts`       | Display link callables, and `startDisplaySession`                                                               |
| `src/display/pages.ts`       | The `display` Express app: the pages, their assets, and the public scores JSON                                  |
| `src/display/scores.ts`      | Builds the public scores page's `live.json` and `results.json`                                                  |
| `src/display/firebaseConfig.ts` | The Firebase web config the pages are given                                                                  |
| `src/display/assets/`        | The display pages' browser code and styles (below)                                                              |

### Display page assets

Served as they are from `/display/assets/`. The `*-model.js` files have no
Firebase and no page in them, so the emulator tests import and test them
directly.

| File                                 | Page                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `display.js`                         | Shared by the signed in pages: sign-in, listeners, retries, `sheetView`, status reports, reloading |
| `game-view.js`                       | What every page, the public one included, shows about a game: the end, Final, text colors |
| `update-model.js`                    | When a page should reload onto a new build                                               |
| `link.js`, `link.css`                | A display link's own URL, which moves on to the page its settings name                   |
| `bug.js`, `bug.css`                  | The score bug                                                                            |
| `warm-room.js`, `warm-room.css`      | The warm room screen                                                                     |
| `results-model.js`                   | Grouping the day's results by draw, for the warm room and the public page                |
| `bonspiel.js`, `bonspiel.css`, `bonspiel-model.js` | The bonspiel screen, and the draw on now and brackets it works out         |
| `scores.js`, `scores.css`, `scores-model.js` | The public scores page, and when it polls                                        |

`state.ts` and `display.js` each have a `sheetView` and `lastGameOf`; change
both together.

## Deploying

Merges to `main` deploy the functions and `firestore.rules` to dev; prod is
deployed by hand from a release tag. Each deploy writes `build.json` into the
assets and the commit to `appConfig/displays`, which is how open display
pages know to reload. See
[Deploys and updates](../docs/architecture/deploys-and-updates.md).

A new callable function has to be public to be called at all. Read "Adding a
new callable Cloud Function" in the [README](../README.md) before adding one.

# Upgrade smoke test

A runbook for checking dev after an upgrade lands there, before it goes to
prod: a new Node version (`.nvmrc`, `engines.node` in `functions/`, the
workflows and the dev container), a new `firebase-tools` in the deploys, or
a major `firebase-functions` or `firebase-admin`. The unit and emulator
tests prove the code; this proves the deployed system still works on the
new runtime, one function at a time. Work through the parts in order and
fill in the report at the end. It takes about half an hour.

How the system fits together is in [ARCHITECTURE.md](ARCHITECTURE.md); how a
merge reaches dev is in [Deploys and updates](architecture/deploys-and-updates.md).

## What you need

- A clone of the repo on `main`, with the upgrade merged.
- The Node version in `.nvmrc`, and Java 21 or later for the emulators.
- `gh` signed in to GitHub.
- `gcloud` signed in with access to `curling-scoreboard-dev`, twice over:
  `gcloud auth login` for the commands below, and
  `gcloud auth application-default login` for the script's `firebase-admin`
  checks. They are separate credentials, and either can expire on its own.

From a club admin, before Part 4:

- `CLUB_ID` and `SHEET_ID` of a test sheet with no real scoreboard paired to
  it. Part 4 pairs a script with the sheet, which takes it away from any
  scoreboard already there.
- A fresh pairing code for that sheet (portal: Sheets & Games, Generate
  Pairing Code) and the club's admin PIN (Settings, Scoreboards).
- The club's API key (Settings, Integrations), for the REST checks.
- Whether the club's public scores page is on (Displays tab).
- Whether the club has a completed game webhook, and if so that it is fine
  for a test game to post to that channel.

Set these once in the shell, from the repo root:

```bash
export SITE=https://curling-scoreboard-dev.web.app
export FUNCTIONS=https://us-central1-curling-scoreboard-dev.cloudfunctions.net
export RUNTIME=nodejs$(cat .nvmrc)
export CLUB_ID=...      # from the club admin
export SHEET_ID=...     # from the club admin
export CLUB_API_KEY=... # from the club admin, optional
```

## Part 1: the deploy landed on the new runtime

Find the commit dev is running: `git rev-parse origin/main`. Call it
`MERGE_SHA`. If more pull requests merged after the upgrade, this is the
latest one; deploys are queued, and a newer one cancels those still waiting,
so dev may never have run the upgrade's own commit alone.

The three dev deploys ran for it and succeeded:

```bash
gh run list --branch main --limit 15 --json workflowName,headSha,status,conclusion \
  --jq '.[] | select(.headSha == "'"$MERGE_SHA"'") | [.workflowName, .status, .conclusion] | @tsv'
```

Expect `Deploy Functions - Dev`, `Deploy App - Web - Dev` and
`Deploy Admin Portal - Dev`, each `completed` and `success`.

The functions deploy names the runtime. In its log
(`gh run view <run id> --log`), `firebase-tools` prints a line per function
such as `updating Node.js 24 (2nd Gen) function pairSheet(us-central1)`.
Every function should name the new version, and none the old one.

Google agrees:

```bash
gcloud functions list --project=curling-scoreboard-dev --regions=us-central1 \
  --format="table(name,state,buildConfig.runtime)"
```

Every row `ACTIVE` and `$RUNTIME`, and as many rows as functions in the
deploy log. If the runtime column comes back empty, check one function
directly with `gcloud functions describe pairSheet --region=us-central1
--project=curling-scoreboard-dev --format="value(buildConfig.runtime)"`.

The new code is what is served:

```bash
curl -s $SITE/display/assets/build.json   # {"buildId":"MERGE_SHA","version":...}
curl -s $SITE/build.json                  # {"buildId":"MERGE_SHA"}, the web app's deploy
```

## Part 2: read-only checks

These write nothing. Each reaches a different function on the new runtime.
Anything other than the expected result is a finding.

| Check | Command | Expect |
| --- | --- | --- |
| REST API, no key | `curl -s -w ' %{http_code}\n' $SITE/api/v1/clubs/$CLUB_ID` | `{"error":"API key required"} 401` |
| REST API, wrong key | add `-H "X-API-Key: 00000000000000000000000000000000"` | `{"error":"Invalid API key"} 403` |
| REST API, unknown club | `.../clubs/no-such-club` with any key | `{"error":"Club not found"} 404` |
| REST API, the club's key | `-H "X-API-Key: $CLUB_API_KEY"` | 200, the club's name and sheets |
| CORS preflight | `curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://example.com" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: X-API-Key" $SITE/api/v1/clubs/$CLUB_ID` | a 2xx, with `access-control-allow-origin: *` |
| Warm room page | `curl -sI $SITE/display/$CLUB_ID/warm-room` | 200, with `content-security-policy`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `cache-control: no-store` |
| Score bug page | `curl -s -o /dev/null -w '%{http_code}\n' $SITE/display/$CLUB_ID/sheets/$SHEET_ID/bug` | 200 |
| Unknown display path | `.../display/$CLUB_ID/no-such-page` | 404 |
| Public scores | `curl -si $SITE/display/$CLUB_ID/scores/live.json` | 200 with an `etag` if the page is on; 404 if it is off |
| Public scores, unchanged | repeat with `-H 'If-None-Match: <that etag>'` | 304 |
| Callable, signed out | `curl -s -w ' %{http_code}\n' -X POST $FUNCTIONS/pairSheet -H 'Content-Type: application/json' -d '{"data":{"pairingCode":"ZZZZZZ"}}'` | 401, status `UNAUTHENTICATED` |
| Callable, bad link | `curl -s -w ' %{http_code}\n' -X POST $FUNCTIONS/startDisplaySession -H 'Content-Type: application/json' -d '{"data":{"clubId":"'$CLUB_ID'","token":"bogus"}}'` | 403, status `PERMISSION_DENIED`, "This display link is not valid…" |

Then open the admin portal, <https://curling-scoreboard-admin-dev.web.app>,
sign in, and check the club page loads: Sheets & Games lists the sheets, and
the Displays tab lists its links. This is the portal built on the new
toolchain.

## Part 3: the script on the emulators

Part 4 runs [`scripts/smoke-test.mjs`](../scripts/smoke-test.mjs), which
plays a game as a scoreboard. CI already runs it against the emulators on
every pull request that touches the functions, but run it locally on the new
runtime too, so a problem in the script never lands on dev:

```bash
(cd functions && npm ci)
(cd scripts && npm ci)
cd emulator-tests && npm ci && npm run test:smoke
```

[`scripts/smoke-test-emulators.mjs`](../scripts/smoke-test-emulators.mjs)
seeds a test club, catches the webhook locally and runs the script with
every check on. Expect every line `PASS`, nothing `SKIP`, `0 failed`, and
`Webhook posts received: 1` with the message. If a check fails here, the bug
is in the script or the code, not in dev: fix it before going on.

## Part 4: play a game on dev

This writes to dev. It pairs the script with the test sheet, sends a status
report, plays a 2 end game (Red 2, Yellow 1), finishes it, checks it
everywhere, then disconnects with the PIN. It leaves one finished game in
that sheet's history, and posts it to the club's webhook if there is one.

```bash
cd scripts
PAIRING_CODE=<code> ADMIN_PIN=<pin> CLUB_API_KEY=$CLUB_API_KEY \
PUBLIC_SCORES=<1 if the page is on, else 0> ADMIN=1 \
node smoke-test.mjs
```

`ADMIN=1` reads the display summary and the webhook result with
`firebase-admin` and your application default credentials; leave it out if
those are not set up. The script prints `PASS`, `FAIL` or `SKIP` per check
and the test game's path, and exits 1 if anything failed. If it stops before
disconnecting, the sheet stays paired to the script: generate a new pairing
code and run it again, which takes the sheet back and disconnects properly.

| Check | Proves |
| --- | --- |
| Signs in, `pairSheet` (unknown code, then the real one), claims | Pairing works; the callable runs on the new runtime |
| Status report, three live game pushes | The rules let a paired scoreboard write; `syncDisplaySheet` runs (it fires on each) |
| REST API live game, then the finished game, then idle | The `api` function reads what the scoreboard wrote |
| Public scores live, then final, then `results.json` | `syncDisplaySheet` and `syncDisplayResults` keep the display summary, and the `display` function serves it |
| Display summary has the game (`ADMIN`) | `syncDisplayResults` directly |
| Webhook tried and delivered (`ADMIN`, webhook on for all games) | `sendCompletedGameWebhook` posts on the new runtime |
| `unpairSheet` with a wrong PIN, then the right one, then a refused write | Disconnecting works and access ends at once |

Then check by eye:

- Portal, Sheets & Games: the sheet showed `smoke-test` as its scoreboard
  version while paired, the game is in the last seven days with Red 2,
  Yellow 1, and, with a webhook, no failure marked on it.
- The webhook's channel got the message, if there is one.
- A warm room screen for the club, if one is open, showed the game and then
  its final score.

## Part 5: errors in the logs

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --project=curling-scoreboard-dev --freshness=2h --limit=50 \
  --format="table(timestamp,resource.labels.service_name,textPayload)"
```

Expect nothing since the deploy. The requests Parts 2 and 4 refused on
purpose (the bad pairing code, display link and PIN) log as `WARNING`, not
`ERROR`. Anything at `ERROR`, from any function, is a finding: note the
service and message.

## Part 6: clean up (optional)

The test game stays in the sheet's history and in the warm room's earlier
results for the day, which is harmless in a test club. To remove it, delete
it with `firebase-admin` (path from the script's last line) and, if it
should also leave today's results at once, re-run
`backfill-display-state.js` as the [scripts README](../scripts/README.md#backfilling-display-summaries)
describes. If the test sheet normally has a scoreboard, pair it again with a
new code.

## Report

| Part | Result | Notes |
| --- | --- | --- |
| 1. Deploys succeeded for `MERGE_SHA` | | |
| 1. Every function `ACTIVE` on `$RUNTIME` | | |
| 1. `build.json` serves `MERGE_SHA` | | |
| 2. Read-only checks (12) | n/12 | |
| 2. Admin portal loads | | |
| 3. Emulator run | n passed, n failed | |
| 4. Dev game (script) | n passed, n failed, n skipped | test game path |
| 4. Portal, channel, warm room by eye | | |
| 5. New errors in logs | | |

For any failure, give the command, what came back, and what was expected.
Don't fix code on dev or redeploy; report it and fix it in a pull request.

## On prod

The same script can check prod after a release, with
`FIREBASE_PROJECT_ID=curling-scoreboard-prod`, the prod URLs in Parts 1, 2
and 5, and a test club and sheet on prod. It writes a real game there, so
agree it with the club first.

# Rate limiting proposal

<!-- cspell:ignore setpolicy -->

Draft for discussion · November 6, 2026

## The problem

Nothing on the server limits how often it can be called. That matters for
two reasons:

1. **Cost and quotas.** Every request that reaches a function costs an
   invocation and usually some Firestore reads. A broken integration, a
   script in a loop or a deliberate flood runs up the bill with nothing to
   stop it.
2. **Locking down.** If a key or a link gets out, or something starts abusing an
   endpoint, there is no quick way to shut that part off without a deploy.

The scoreboard itself is not at risk: scoring works offline and every write
is fire and forget. The aim is to protect the bill and the shared services,
and to give us switches to pull.

## Decisions so far

- **Stay inside the free tier.** The budget for each project is $2 a
  month, as an early warning rather than a cap.
- **The API can be switched off per club**, as well as for everyone.
- **No usage figures in the portal** for now.
- **Traffic is light.** Prod's API served 3 to 163 requests a day from
  October 7 to November 6, 2026, about 1,000 in the month. The limits below
  leave plenty of room above that, and the free allowances are far off, so
  the work is about a ceiling for the bad day rather than about today.

## Staying in the free tier

The free allowances that matter to us, from Google's pricing pages (check
them again before relying on the numbers, since they change):

| Service | Free allowance | Counted per |
| --- | --- | --- |
| Firestore reads | 50,000 a day | Project, default database only |
| Firestore writes | 20,000 a day | Project |
| Firestore deletes | 20,000 a day | Project |
| Firestore storage | 1 GiB | Project |
| Functions (Cloud Run) requests | 2 million a month | Billing account, so dev and prod share it |
| Functions CPU and memory | 180,000 vCPU seconds and 360,000 GiB seconds a month | Billing account |
| Hosting transfer | 360 MB a day | Project |
| Artifact Registry storage | 0.5 GB | Billing account |

A normal day is well inside these. A club with 6 sheets and 5 displays
running 4 draws is roughly 1,000 summary changes, so about 5,000 reads by
the displays listening to them, and a few thousand writes from the
scoreboards. Heartbeats from scoreboards and displays are every 30 minutes
and barely register.

What could push us over:

- **Firestore reads** reset daily, and are the easiest to burn. The REST API
  reads without any cache, so a script calling `GET /clubs/{clubId}` in a
  loop on a 6 sheet club uses 8 reads a call and the whole day's
  allowance in about 6,000 calls.
- **Function requests.** A request turned away with a 429 by our own code
  still counts as a request. Only `maxInstances` turning it away before our
  code runs, or a switched off ingress, avoids the CPU time; nothing in the
  function avoids the request count. Past the free tier this is $0.40 a
  million, so it is the CPU time and reads that cost money, not the count.
- **Dev and prod share one billing account**, so they share the allowances
  counted per billing account. Dev's traffic and deploys use up prod's room.
- **Artifact Registry.** Every functions deploy stores a container image,
  and nothing deletes old ones. Merges to `main` deploy to dev, so dev
  grows with every merge and will pass 0.5 GB on its own. This is the one
  cost we are likely to hit with no traffic at all. The fix is a cleanup
  policy: `firebase functions:artifacts:setpolicy`, once per project.

Going over by a little costs cents (about $0.06 per 100,000 reads), so the
$2 budget is an alarm with plenty of room, not a sign of real harm.

## What we have today

### Already in our favour

- **The REST API is read only and keyed per club** (`X-API-Key`, 128 bits,
  compared in constant time). Admins can rotate a key in the portal.
- **Display links** carry a 128 bit secret, stored hashed, and can be reset
  or revoked from the portal. Revoking ends a screen's session within the
  hour.
- **The public scores page is behind Hosting's CDN.** `live.json` is cached
  for 30 seconds, `results.json` for 5 minutes, so a full room of phones
  costs one function call per cache period, not one per phone.
- **Admin callables** all check the caller's role before doing anything.
- **Firebase Auth** limits how many anonymous accounts one IP address can
  create in an hour, which slows mass sign-ups for `pairSheet`.
- **`createDisplayLink`** caps each club's links.

### The gaps

| Surface | Who can call it | Cost of one call | Gap |
| --- | --- | --- | --- |
| `api` (`/api/v1/clubs/...`) | Anyone with the URL | 1 invocation, 2 reads to check the key, then 1 to many reads for the answer | No limit at all. A wrong key or unknown club still costs the 2 reads. A leaked key reads without limit until rotated. |
| `display` scores JSON | Anyone | 1 invocation, 2 to 3 reads on a cache miss | **Any query string skips the CDN cache.** `live.json?x=1`, `?x=2` ... each go to the function and Firestore. |
| `display` pages (HTML) | Anyone | 1 invocation, no reads | Not cached (`no-store`), so each load is an invocation. Cheap, but unbounded. |
| `startDisplaySession` | Anyone, not signed in | 1 invocation, 1 read, a custom token | No limit. Guessing a secret is hopeless, but the calls still cost. |
| `pairSheet` | Any signed in user, including anonymous | 1 invocation, a collection group query | No limit per user. Codes are 6 characters from 32 (about a billion), so guessing is impractical, but each guess costs a query. |
| `unpairSheet` | Only the scoreboard paired with the sheet | 2 reads | **No limit on wrong PINs**, and a 4 digit PIN has only 10,000 values. Low risk, since the caller must already be the paired device, but the PIN is the club's admin PIN. |
| Scoreboard writes to its sheet | The paired scoreboard | 1 write, and a `syncDisplaySheet` run when the display changes | No limit on how often `liveGame` changes. A buggy or tampered device could write in a loop and each write runs a transaction. |
| Every function | n/a | n/a | **No `maxInstances`.** Second generation functions default to 100 instances each, so the worst case spend has no ceiling. |
| Billing | n/a | n/a | Budgets exist: $10 a month on prod and $5 on dev, alerting the billing account's admins at 50%, 90% and 100%. Prod also has four $1 spend caps, one per service, made in the Firebase console. Dev has none. There are no usage alerts. |

There is no App Check on any callable, and no global switch to turn a
feature off.

## The plan

Four layers, cheapest and most valuable first. Each one is useful on its
own.

### 1. Put a ceiling on spend

These cap the worst case even if everything else fails.

- **`maxInstances` on every function.** Set a default with
  `setGlobalOptions` in `functions/src/index.ts` and override where needed.
  When a function is at its ceiling, extra requests are turned away with a
  429 before any of our code runs. Suggested starting points, to tune from
  real traffic:

  | Function | maxInstances |
  | --- | --- |
  | `api` | 5 |
  | `display` | 10 |
  | `startDisplaySession`, `pairSheet`, `unpairSheet` | 3 |
  | Admin callables | 2 |
  | Triggers (`syncDisplaySheet` and the rest) | 10 |

  With the default concurrency of 80, 5 instances of `api` still serve
  hundreds of requests at once, far beyond what a club needs.

- **Lower the budgets to $2 on each project**, from $10 on prod and $5 on
  dev, and add an alert on the forecast passing 100%. This is console setup,
  not code, so it goes in the runbook (see layer 4). Billing data lags by a
  day or so, which is why the usage alerts below matter too.

- **An Artifact Registry cleanup policy** on both projects, keeping the
  last few images, so deploys stop adding storage.

- **Usage alerts** in Cloud Monitoring, so we hear about a spike the same
  day rather than at the end of the month: Firestore reads passing 25,000
  in a day (half the free allowance) and function requests passing 20,000
  in a day (a third of the month's allowance spread over 30 days).

We would not wire a budget to switch billing off for the whole project.
That deletes nothing, but it stops every Firebase service at once,
including the displays and the admin portal, and the kill switches in
layer 3 do the job more precisely.

Prod already has the Firebase console's spend caps, $1 a month on each of
four services (Cloud Run and Cloud Functions among them). We need to find
out what a cap does when it is reached. If it stops that service, a $1 cap
on Cloud Run takes the API, the display pages and the scores page down
together for the rest of the month, while scoring on the sheets carries
on. That may be the right last line for staying free, but it should be a
choice we make knowingly, written in the runbook, and the same on dev
(which has no caps) so we see it happen there first.

### 2. Make the expensive paths cheap

Most of the cost of a flood is Firestore reads. These remove them.

- **Close the query string hole on the scores JSON.** In
  `functions/src/display/pages.ts`, answer `live.json` and `results.json`
  with a 404 (cached by the CDN) when the request has any query string, and
  serve `logo` only for its own `v`. Then every request for a club shares
  one cached response, whatever is added to the URL.

- **Cache what the API key check reads**, in memory in each instance, for
  60 seconds: whether the club exists and its key. A burst of
  requests then costs 2 reads per instance per minute instead of 2 per
  request. Unknown clubs and wrong keys are cached too, so guessing costs
  nothing after the first try. A rotated key takes effect within the
  minute, which we should say in the portal next to the button.

- **Cache the scores page's switch and branding** the same way, for 30
  seconds, so cache misses on the CDN read only the summary.

- **Cache API answers** in memory for 15 seconds, per club and path. Live
  games change slowly enough that an integration loses nothing, and the
  reads a club's API can cause then have a ceiling, however fast it is
  called: about 4 answers a minute per path per instance. This does more to
  keep us inside the daily read allowance than any rate limit, since it
  holds even for a caller inside its limit.

### 3. Limit each caller, and add switches

#### Rate limits

A small token bucket middleware in `functions/src/middleware/rateLimit.ts`,
held in memory in each instance. With `maxInstances` capped, the real limit
is at most the per instance limit times the instance count, which is close
enough for our purposes and costs nothing to run.

We considered keeping counters in Firestore (a write per request, which
costs more than the requests it protects against), a hosted Redis (a server we
pay for around the clock) and Cloud Armor (needs a load balancer in front
of Hosting). None is worth it at our size. If we outgrow memory buckets,
Firestore counters for the low volume callables are the next step.

Starting limits, to tune from logs:

| Where | Keyed by | Limit | Notes |
| --- | --- | --- | --- |
| `api`, before the key check | IP address | 60 a minute | A whole club behind one router shares an IP. |
| `api`, failed key checks | IP address | 10 a minute | Wrong keys and unknown clubs. |
| `api`, after the key check | Club | 60 a minute, 5,000 a day | One leaked key cannot use a meaningful share of the month's requests. A stream tool polling each of 6 sheets every 30 seconds through a 4 hour draw is under 3,000. |
| `startDisplaySession` | IP address | 30 a minute | Generous, since every screen in a club shares an IP and they all start at once after a power cut. |
| `pairSheet` | Signed in user | 10 an hour | A real scoreboard pairs once. |
| `pairSheet` | IP address | 30 an hour | |
| `unpairSheet` wrong PIN | Sheet | 5, then locked for 15 minutes | Kept in Firestore under `private/`, since it must hold across instances. |

A limited request gets a 429 with a `Retry-After` header, or
`resource-exhausted` from a callable, and one structured log line naming
the limit and the key, so it shows in Logs Explorer and can drive an alert.

The IP address comes from `X-Forwarded-For`. On dev, a request straight to
the function had the caller as the entry Cloud Run adds last, and one
through Hosting a Google edge server there, with the caller just before
it. A request counts against both of the last two entries, so one is
always the caller, and a made up entry further left buys nothing.

Scoreboard writes stay unlimited in the rules, since the scoreboard must
never be blocked from scoring. `maxInstances` on `syncDisplaySheet` and the
usage alerts cover a device that misbehaves, and the existing unpair and
the portal's sheet controls are the way to cut it off.

#### Kill switches

One document, `adminConfig/switches`, which only super admins can read and
write, and which functions read through the same 30 second memory cache.
(Not under `appConfig`, which anyone can read.)

```json
{
  "api": true,
  "scoresPage": true,
  "displaySessions": true,
  "pairing": true,
  "blockedIps": [],
  "limits": { "apiPerClubPerMinute": 60, "apiPerClubPerDay": 5000 }
}
```

- Turning a feature off makes its function answer straight away, before
  any read: 503 for the API and the scores JSON, `unavailable` for the
  callables. Scoring on the sheets carries on, as it always does offline.
- `limits` overrides the defaults above without a deploy. It comes with
  the rate limits in step 4.
- `blockedIps` is for a single caller we can see in the logs. It comes with
  step 4 too, which works out how to read a caller's IP address reliably
  behind Hosting.
- A super admin page in the portal shows the switches.

Per club, we already have most of what we need: rotate the API key, turn
off the scores page, reset or revoke a display link. We add an **API off**
switch for each club, as `enabled: false` on `clubs/{clubId}/private/apiKey`
beside the key, which the key check already reads (and caches). It is for a
club whose integration has gone wrong but whose key is fine: turning it
off answers 503 without changing the key, so the integration works again
as soon as it is fixed and switched back on. Club admins and super admins
see it next to the key in the portal.

#### App Check, later

App Check makes callables reject requests that do not come from our own
apps. It fits `pairSheet`, `unpairSheet`, `startDisplaySession` and the
admin callables, but not the REST API, which club websites and other tools
call. It needs reCAPTCHA Enterprise for the web builds, and the display
pages run in OBS browser sources and on old smart TVs, where reCAPTCHA may
not behave. So: turn it on in monitoring mode first, look at how many real
requests would fail, and enforce only where the numbers are clean.

### 4. Make it visible and written down

- A runbook in `docs/guides/` for when something goes wrong: where the
  alerts come from, how to find the caller in the logs, which switch to
  pull, and, for the worst case, how to take a function off the internet
  with `gcloud run services update <service> --ingress=internal`.
- Updates to `docs/architecture/api-and-webhook.md`, `displays.md` and
  `auth-and-roles.md` with the limits, and to the API docs for clubs so
  integrators know to expect 429s and `Retry-After`.
- Emulator tests in `functions.test.mjs` for each limit, each switch, the
  PIN lockout and the scores query string, and in `rules.test.mjs` for
  `adminConfig/switches`.

## Suggested order

Each step is its own PR.

1. **`maxInstances` everywhere and the scores query string fix.** Done. Small,
   and caps the worst case straight away. At the same time, by hand: the $2
   budgets, the usage alerts and the Artifact Registry cleanup policy.
2. **Memory caches** for the API key check, API answers and the scores
   page. Done, in `functions/src/kept.ts`.
3. **Kill switches**: `adminConfig/switches` and the per club API switch,
   with their portal controls and the runbook. Done, in
   `functions/src/switches.ts`; `limits` and `blockedIps` moved to step 4.
4. **Rate limit middleware** for the API and the callables, with the
   `limits` overrides and `blockedIps`. Done, in `functions/src/rateLimit.ts`.
5. **The unpair PIN lockout.**
6. **App Check** in monitoring mode, then enforced where it is safe.

## Open questions

- What does a Firebase spend cap do when it is reached, and which four
  services are capped on prod?
- Is Authentication on Identity Platform? If so, anonymous scoreboards and
  display sessions count as monthly active users, with a free allowance
  far above what we need, but worth knowing.

# Monitoring and alerts

<!-- cspell:ignore setpolicy startdisplaysession -->

How we see what the system costs and hear when something goes wrong, and
what to do then. The aim is to stay inside Google's free allowances, so the
alerts are set well below them and fire long before a bill.

## What is in place

| What | Where | Set up by |
| --- | --- | --- |
| A budget on each project, emailing billing admins at 50%, 90% and 100% | Cloud Billing, Budgets & alerts | Hand, in the console |
| The usage dashboard | Cloud Monitoring, Dashboards, "Curling scoreboard usage" | `scripts/setup-monitoring.mjs` |
| Five alerts, emailed | Cloud Monitoring, Alerting, each named "Curling scoreboard: ..." | `scripts/setup-monitoring.mjs` |
| A ceiling on each function's instances, so a flood is turned away | `functions/src/limits.ts` | The functions deploy |
| Service switches, to turn the API, the scores pages, display sign-ins or pairing off for every club | The portal's list of clubs, for super admins; kept in `adminConfig/switches` | A super admin, when needed |
| A switch for each club's API | The club's Settings, Integrations, beside the key | The club's admins, when needed |
| Rate limits on the API, display sign-ins and pairing, answering 429 or `resource-exhausted` | `RATE_LIMITS` in `functions/src/limits.ts`; changed without a deploy under `limits` in `adminConfig/switches` | The functions deploy; a super admin, when needed |
| Blocked addresses | The portal's list of clubs, for super admins; kept as `blockedIps` in `adminConfig/switches` | A super admin, when needed |

The dashboard goes on both projects. The alerts go on prod only, since each
alert condition costs about $0.10 a month. Dev can have them with
`--alerts`.

What the dashboard and alerts watch is defined in `scripts/monitoring.mjs`.
To change one, edit it and run the script again; it finds each by name and
updates it in place. See [the scripts README](../../scripts/README.md#monitoring).

## The dashboard

Five charts, each by the hour:

- Firestore reads.
- Firestore writes and deletes.
- Function requests, by function.
- Requests turned away with a 429 or failing with a 5xx, by function.
- The most instances running at once, by function. One near its ceiling is
  the first sign of a flood.

A normal day of games is a few thousand reads, mostly the displays, and
fewer writes. Heartbeats from scoreboards and displays come every half
hour and barely show.

## The alerts

| Alert | Fires when | Free allowance it guards |
| --- | --- | --- |
| Firestore reads | More than 25,000 reads in the last 24 hours | 50,000 a day |
| Firestore writes | More than 10,000 writes in the last 24 hours | 20,000 a day |
| Function requests | More than 20,000 requests in the last 24 hours | 2 million a month, shared by dev and prod |
| Requests turned away or failing | More than 20 requests answered 429 or 5xx in an hour | None: a sign of a flood or a fault |
| Errors in the function logs | Any function logs an error | None: at most one email an hour |

Each closes by itself a day after it stops being true. Metrics reach
Cloud Monitoring a few minutes late, and billing data a day or so late,
which is why the alerts watch usage rather than spend.

## When an alert fires

1. **Find what is busy.** Open the dashboard and see which function or
   which kind of Firestore use stands out, and since when.
2. **Find the caller.** In Logs Explorer, filter on the function, for
   example `resource.labels.service_name="api"`. The request logs show the
   path, so the club ID, and the address that connected. Through the
   scoreboard site, that is a Google edge server rather than the caller.
   Requests turned away by a rate limit each log one line, found with
   `jsonPayload.message="Rate limited"`, naming the limit (`limit`), the
   addresses or club counted (`keys`) and the whole `forwardedFor` header.
   The caller is the last address in `forwardedFor` for a request straight to
   a function, or the one before it for a request through the scoreboard
   site, where the last is Google's. Anything further left the caller sent
   itself.
3. **Pull the switch that fits.**

   | What is wrong | What to do |
   | --- | --- |
   | A club's integration loops, but its key is safe | Clear "Turn on the API" for the club, under Settings, Integrations. The key stays the same, so the integration works again once it is fixed and the box is ticked |
   | A club's API key is being misused | A super admin generates a new key in the portal, under Settings, Integrations. The old key stops working within a minute |
   | The scores page is being hammered | Turn it off in the portal, under Displays |
   | A display link got out | Reset or remove it in the portal, under Displays |
   | A scoreboard is writing in a loop | Disconnect it with the club's PIN, or a super admin deletes the sheet in the portal |
   | A function is failing | Read the error in the logs; a bad deploy is undone by deploying the previous release tag |
   | One address making too many requests, or guessing at keys | A super admin adds it under Blocked addresses, below the list of clubs. It is turned away within half a minute |
   | A limit is too tight for a real club, or too loose | A super admin sets `limits.<name>` in `adminConfig/switches`, in the Firestore console, to a whole number; the names are in `RATE_LIMITS` in `functions/src/limits.ts`. Removing it puts the default back. It takes effect within half a minute |
   | Many clubs at once, or no single caller to blame | A super admin turns off the part being flooded under Service Switches, below the list of clubs: the REST API, the public scores pages, display sign-ins or scoreboard pairing. Each takes effect within half a minute, and answers before reading anything |

4. **If nothing else works**, or the switches cannot be reached, take a
   function off the internet. This stops it answering anyone, the displays
   and the portal included, until it is turned back on. Scoring on the sheets carries on, as it does offline.

   ```bash
   gcloud run services update api --ingress=internal --region=us-central1 --project=curling-scoreboard-prod
   ```

   Undo it with `--ingress=all`. The service names are the function names
   in lower case (`api`, `display`, `startdisplaysession` and so on).

A rate limit or a ceiling on instances means a flood is turned away with
429s rather than billed, so the usual case is an email, a look at the
dashboard, and a key or link reset, or a blocked address.

## Done by hand

These are console or `gcloud` settings, not in the repo. Do them once per
project.

- **Budgets.** $2 a month on each project, in Cloud Billing, Budgets &
  alerts, with an alert on the forecast passing 100% as well as on spend.
- **Old function images.** Each functions deploy stores a container image
  in Artifact Registry, which is free only up to 0.5 GB across the billing
  account. Keep the last few with
  `firebase functions:artifacts:setpolicy --project <project>`.

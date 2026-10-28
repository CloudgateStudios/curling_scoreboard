# Member scores page: proposal

Members have asked to follow the club's games from their phones. This is a
design for a public, phone-sized scores page whose running cost stays flat
however many people watch it.

Status: built on `feat/member-scores-page`, not yet deployed. See "Before
release" below for what still has to be checked on the dev project.

## Why not reuse the display links

The club's screens sign in with a display link and listen to
`clubs/{clubId}/private/displayState`. That costs a read per viewer each time
the summary changes, and it sends the whole summary every time. That includes
up to 48 results with their ends, and the logo is a separate document of up to
250 KB. For 150–200 members this still fits Firestore's free allowance, but
the cost grows with the audience. A shared link also stays out there once
it has been passed around.

Instead, the phone page fetches small JSON files that Firebase Hosting's CDN
caches, so the audience only ever reaches the cache.

## Architecture

All Firebase, reusing the `display` function and the Hosting rewrite of
`/display/**` that already exist.

```
Phone ──GET──▶ Hosting CDN ──cache miss only──▶ display function ──▶ Firestore
               (s-maxage)                       (Express routes)     displayState,
                                                                    displayBranding
```

No Firebase SDK, sign-in or listener on the phone: just `fetch`.

### Routes (new, in functions/src/display/pages.ts)

| Route | What it returns | Cache-Control |
|---|---|---|
| `/display/{clubId}/scores` | The phone page (HTML) | as the other display pages |
| `/display/{clubId}/scores/live.json` | Sheets in play, plus versions of the other two | `public, max-age=15, s-maxage=30` |
| `/display/{clubId}/scores/results.json` | The day's finished games | `public, max-age=60, s-maxage=300` |
| `/display/{clubId}/scores/logo?v={hash}` | The logo as an image, decoded from the data URL | `public, max-age=31536000, immutable` |

Every JSON response carries an `ETag` (a hash of the body), so a poll whose
data has not changed gets a `304` with no body.

When the club has not turned the page on, or the club does not exist, each
route returns 404 with `s-maxage=60`, so a switched-off club costs nothing to
poll either.

### live.json, about 1 KB

Built with `sheetView()` from `state.ts`, so the phone shows what the screens
show (a live game, a final score for ten minutes, or nothing), worked out on
the server:

```json
{
  "title": "Example Curling Club",
  "logo": "logo?v=3f9a1c0b7d2e",
  "resultsVersion": "9b1e04c2aa7f",
  "sheets": [
    {
      "id": "a",
      "name": "Sheet A",
      "kind": "live",
      "game": {
        "event": "Sunday Brunch",
        "currentEnd": 5,
        "numberOfEnds": 8,
        "team1": { "name": "Galas", "color": "#c62828", "score": 3, "hasHammer": true },
        "team2": { "name": "Kirchhoff", "color": "#f9a825", "score": 2, "hasHammer": false },
        "ends": [{ "endNumber": 1, "scoringTeamSlot": "team1", "score": 2 }]
      }
    },
    { "id": "d", "name": "Sheet D", "kind": "idle" }
  ]
}
```

Every live game is shown, whatever kind it is: league, bonspiel or neither.
`event` is the bonspiel's name for a bonspiel game, otherwise the league's,
and is left out for a game with neither. Brackets and bonspiel schedules stay
on the bonspiel display.

It leaves out the league draw times, results, team IDs and the logo itself. `resultsVersion` is a hash of `results.json`, and the
page fetches `results.json` only when it changes. That happens once per game,
not on every poll. `logo` carries a hash of the logo, so a new logo gets a new
URL and the old one can be cached forever.

### results.json, a few KB

The day's results for the phone, bonspiel games included: sheet, event (as
in live.json), teams, final score and ends played. Grouping results under their draw uses `results-model.js`, as the warm
room does, so the server sends the draw times alongside the results.

### Function side

- A cache miss reads `private/displayState` and `private/displayBranding`,
  2 reads. The branding document (the logo, up to 250 KB) changes rarely, so
  the function keeps it in memory for five minutes and only the logo route
  needs it in full.
- Responses get `Content-Type: application/json; charset=utf-8`, so Hosting
  compresses them.

## The phone page

New `functions/src/display/assets/scores.js` and `scores.css`, laid out for
phones first, reusing the shared rendering helpers (`results-model.js`,
`textColorOn`) the warm room already uses.

### How often it polls

| Situation | live.json every |
|---|---|
| A sheet is live or showing a final score | 30 s |
| Every sheet idle | 5 min |
| Tab hidden | stop; fetch once when it is shown again |
| No tap or scroll for 30 min | stop, and show "Tap to keep following" |

`results.json` is fetched on load and whenever `resultsVersion` changes, and
the logo once, then the browser keeps it.

Each fetch sends `If-None-Match` with the last `ETag`, so an unchanged answer
is a few hundred bytes of headers.

Speeding up just before a draw was dropped: a game that starts shows within
five minutes, and its first end takes far longer than that.

## Admin portal

A "Public Scores Page" section on the Displays tab
(`PublicScoresSection.tsx`), with a checkbox to turn it on, and its address
with Copy and Open. It is off by default and stored in
`clubs/{clubId}/private/publicScores` (`{ enabled: bool }`), which only club
admins can write and the JSON routes check on a cache miss. Turning it off
takes up to a minute to reach phones that have it open. A printable QR code
is left for later, as it needs a new dependency in the portal.

## Cost, worst case

200 phones open for 4 hours on a league night, 5 sheets, 2 draws:

| | Before trimming | With this design |
|---|---|---|
| Requests to the CDN | ~144,000 (20 s polling) | ~96,000 at most; far fewer with the idle pause and the slower polling between draws |
| Transfer | ~700 MB | ~45 MB (mostly 304s, ~1 KB answers) |
| Firestore reads | ≤ 6,000/day | ≤ 6,000/day (2 per cache miss, whatever the audience) |
| Function runs | a few thousand/day | the same |

All of this is inside the free allowances: Hosting's 360 MB a day, Firestore's
50,000 reads a day and Cloud Run's 2M requests a month. A realistic night is a
few MB.

Up to about 50 s can pass between a score being entered and a phone showing
it (30 s of cache plus 30 s of polling, overlapping). Ends take about 15
minutes, so that's fine.

## Later: split displayState (helps the screens too)

The screens' listeners receive the whole summary, results included, on every
score change. Splitting it into `private/displayLive` (sheets) and
`private/displayResults` (results) would mean:

- a score change sends the screens only the sheets, not the day's results;
- results change only when a game finishes;
- this page's live route reads one small document.

That touches `triggers.ts`, `display.js` (two listeners), the warm room, score
bug and bonspiel pages, `firestore.rules`, the rules tests and
`scripts/backfill-display-state.js`. It is worth doing, but separately from
this page, which works with the summary as it is.

## Before release

Checked on the dev project once deployed:

1. **Hosting's header rule.** Hosting does apply `firebase.json` header rules
   to rewritten responses, replacing the function's own: on dev, the warm
   room page the function sends with `no-store` arrives as `no-cache`. The
   rule now skips `/display/**` (`/` and `/!(display){,/**}`), which the
   Hosting emulator honours. Check with `curl -I` that `live.json` comes back
   with `public, max-age=15, s-maxage=30`, and that the scoreboard's own
   files still get `no-cache`.
2. **The CDN caches.** Two requests a few seconds apart: the second should be
   a cache hit (`x-cache: HIT`), and the function's logs should show one
   request.
3. **304s through the CDN.** A request with the ETag in `If-None-Match` comes
   back 304.
4. **The portal section** on a real club: switching it on and off, and the
   page following within a minute.

## Decisions

- **Team names are public.** Team names are member surnames, and the club is
  fine with them being visible to anyone with the URL, so the URL carries no
  key.
- **Every live game is shown, whatever its type.** League, bonspiel and
  one-off games all appear the same way, labelled with their bonspiel or
  league name. No bracket or schedule views.

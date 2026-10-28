# Feature roadmap proposal

<!-- cspell:ignore matchups -->

Draft for discussion · October 12, 2026

## Product direction

Grow the scoreboard into a club's home for playing games, following results,
and running leagues. Keep the on-ice interaction simple while putting more
capability in the admin portal and spectator views.

Context from the owner:

- One club currently uses the app on Android devices installed as a PWA.
- The roadmap should serve players, club admins, and spectators.
- No current friction was reported. Proposed benefits need validation in use.
- The eventual goal is to manage schedules and standings here.

Sequence work by usable releases, rather than committing to dates before scope
and available development time are agreed. Effort labels are relative: small
extends an existing flow; medium adds a capability; large crosses products or
introduces a new domain model. They are not delivery estimates.

## What is already built

The Flutter scoreboard supports local scoring, two scoreboard styles, hammer
tracking, end correction/deletion, game timing, league team selection, and
club-specific rock colors. Club pairing adds live scores and completed-game
syncing. League and color settings are cached for offline use.

The React admin portal supports club/sheet administration, pairing, device
health, league/team management with CSV import, weekly league time slots,
game history and CSV exports. The backend provides a read-only club-key API
and completed-game webhooks. Firebase rules and emulator tests cover important
access boundaries; the app has model, controller, service, and widget tests.

Weekly league time slots exist, but dated team-versus-team fixtures, sheet
assignments, standings, and a spectator product are not implemented in the
reviewed code. These are extensions to the current foundation.

## Roadmap by release

| Release | Players | Club admins | Spectators | Relative effort |
| --- | --- | --- | --- | --- |
| 1. Dependable game records | Resume after refresh/restart; visible save/sync state; clock survives suspension | See outstanding saves and actionable sync failures | Clear freshness labels on live scores | Medium–large |
| 2. Follow the club | Clear completed-game summary | Club-wide searchable results; audited result corrections | Shareable live club page, game results, lounge TV view | Medium–large |
| 3. League results and standings | Results attach to the right season/team | Season management, configurable standings, review/exclude results | League table and team result pages | Large |
| 4. Scheduled matchups | One-tap start of the assigned matchup | Dated fixtures, sheet assignments, reschedules, missing-result queue | Upcoming games alongside results | Large |
| 5. Season planning | Reliable upcoming matchups | Round-robin generation, fairness checks, exceptions, publish schedule | Published season calendar | Large |

### Release 1: dependable game records

This is a foundation for using results as league records, not a claim that
players are currently experiencing failures.

- Save active-game state locally after each meaningful change. On restart,
  offer Resume or Discard rather than clearing the live game unconditionally.
  Include teams, ends, hammer inputs, game identity, and clock state.
- Give each game a stable ID at start. Preserve a completed result locally
  until its remote save is acknowledged; replay to the same ID after restart.
  Use an explicit lifecycle so finishing twice cannot create two results.
- Show a compact distinction between local save, waiting to sync, synced,
  and an actionable failure. Scoring must continue without connectivity.
- Calculate elapsed time from stored time anchors rather than assuming every
  timer callback ran. Decide how intentional pauses should work separately.
- Treat device health and score freshness as distinct signals. A device can
  be connected without any new score being entered. Keep live-game freshness
  current during play without writing every second.

Acceptance: on the club's Android PWA devices, score several ends, background
and restart the app, then resume with the same score, hammer, and elapsed time.
Finish offline, restart, reconnect, and obtain exactly one completed record.
Cover storage failures and lost pairing without silently discarding the result.
Verify cold offline launch separately; offline scoring alone does not establish
that the PWA can launch without a network connection.

### Release 2: follow the club

- Add an opt-in, mobile-friendly club page showing all sheets, matchups,
  current end, scores, hammer, last update, and recent results.
- Add a read-only lounge TV layout and shareable club/game links. Start with
  live scores and completed end-by-end results; live end-by-end history would
  require expanding the current live-game payload.
- Extend admin history to search across sheets by date, league, and team.
  Export the complete selected range, using cursor pagination rather than
  repeatedly increasing a query limit.
- Allow authorized admins to correct or void completed results with a reason
  and an audit trail. Corrected results need revisions and downstream update
  behavior; the current webhook only fires when a game is created.

Acceptance: a spectator opens a shared link without an admin login, sees a
score update and a finished result, and can distinguish stale data. An admin
finds and corrects a result; its public view agrees with the corrected record.

Technical prerequisite: create an explicit public read model or endpoint with
club-controlled publication. Do not expose private sheet documents or require
spectators to hold the club integration key. Bound refresh frequency and reads.

### Release 3: league results and standings

- Introduce seasons as explicit records. Preserve stable team identity while
  separating each season's entrants from the current embedded league team list.
  Archive one season and start another without changing historical standings.
- Add club-configurable win/loss/tie points and an agreed tie-break order.
  Establish treatment of forfeits, cancelled games, incomplete games, and
  exhibition results before publishing standings.
- Associate eligible results with a season. Provide a review queue for missing
  team IDs, duplicates, and incomplete games rather than counting everything
  automatically. Support audited manual results for games scored elsewhere.
- Build league tables and team result pages from accepted results. Recompute
  standings when a result is corrected or voided.

Acceptance: run one real league alongside its current standings process for
several draws. Reconcile every difference before making this the official table.

### Release 4: scheduled matchups

- Add dated fixtures with season, teams, sheet, start time, and status. Store
  the club's time zone explicitly; weekly local-time strings alone are not a
  dated match schedule.
- Start with manual entry and previewed CSV import. Handle bye weeks,
  cancellations, substitutions in the schedule, and reschedules.
- Offer the appropriate fixture on its paired sheet, then let players confirm
  teams/colors/hammer and start. Preserve the quick open-game path.
- Link the completed game to its fixture. Show expected games without results
  and results that need reconciliation.
- Publish upcoming fixtures and provide calendar export.

Acceptance: run a full draw with assigned matchups, then reschedule one game
and resolve one missing result without breaking history or standings.

### Release 5: season planning

- Generate round-robin schedules with configurable draw times and sheets.
- Preview and validate double bookings, unavailable dates, byes, repeat
  opponents, and sheet distribution before publishing.
- Allow manual adjustments and schedule revisions without rewriting played
  fixtures. Add playoffs or bonspiel brackets only after the league workflow
  is proven and there is demand.

Acceptance: the league organizer can prepare and publish a season, handle a
closure, and keep completed games intact. Compare planning time and correction
work with the previous process.

## Optional features to validate

| Persona | Candidate | When it earns priority |
| --- | --- | --- |
| Players | Club/league presets for ends, format, layout, and timing | Repeated setup choices are observed |
| Players | Screen wake behavior and an Android installation guide | Devices sleep during play or setup is difficult; validate device support |
| Players | Casual-game team names and rematch | Players want useful history outside league games |
| Admins | Delegated league managers and club-controlled sheet administration | More volunteers need access without broad administrator privileges |
| Admins | Webhook retry/replay and delivery history | Missed delivery matters; receiving systems need event IDs and deduplication |
| Spectators | Favorite teams and game notifications | People repeatedly follow games remotely; first establish notification demand |
| Spectators | Broadcast overlays and sponsor panels | Streaming or in-club display use creates a concrete requirement |

## Engineering implications from the review

- `app/lib/main.dart` currently clears live state on startup. Recovery changes
  startup, game lifecycle, and safe update behavior together.
- `GameController` holds state in memory and advances time one second per timer
  callback. Existing game serialization is a useful starting point for recovery.
- `SyncService.saveCompletedGame` generates a new Firestore document ID per
  call. Stable IDs and durable acknowledgements are needed before adding replay.
  Firestore's write queue is useful, but is not a replacement for an explicit
  application-level recovery design.
- `RecentGames` fetches seven days across sheets once per dependency change;
  it does not subscribe to newly completed games. The spectator results feed
  needs a deliberate refresh/subscription strategy.
- The games API returns up to 100 recent games per sheet without a cursor.
  Season history needs broader queries, indexes, and pagination.
- Club admins currently cannot update completed games under the rules.
  Result correction needs authorized backend behavior and matching rule tests.
- The webhook claims a delivery before sending it and does not replay failed
  deliveries later. Reliable result reporting needs a delivery job lifecycle;
  external exactly-once delivery must not be assumed.
- Seasons and fixtures should be separate records rather than enlarging one
  league document indefinitely. Preserve existing games and API compatibility
  with optional fields and deliberate migration/backfill plans.

No rewrite is proposed. The controller/service split, existing team IDs, backend,
and test suites can support this progression.

## How to choose the next release

Agree on this sequence, then observe one actual draw and review its records
with the league organizer. Validate recovery on the installed devices and ask
a few members to try a spectator page. Use those observations to narrow each
release to the smallest useful scope.

Track recoverable restarts, completed games that reach the backend, duplicate
or missing results, standings discrepancies, and organizer time per draw.
For spectators, track whether people return to the club page. Establish a
baseline before setting numerical targets.

Still to resolve: development capacity, actual standings rules, existing
schedule format, hardware/browser versions, and club preferences for publicly
showing team names and history. These affect scope and timing, not the overall
direction agreed above.

Review scope: source and repository documentation review; no code changes,
runtime validation, test execution, or production-data inspection. This is a
product proposal, not a security audit or a delivery commitment.

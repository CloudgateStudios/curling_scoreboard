# Firebase Integration Plan

## Overview

Add optional Firebase backend integration to allow curling clubs to track live scores across multiple scoreboard instances (sheets). The app must continue to work fully without any authentication — Firebase sync is an additive, opt-in feature.

## Core Principle: Local-First, Auth Optional

The app works exactly as it does today when unauthenticated. Firebase is unlocked by pairing a scoreboard instance to a club and sheet. No account is required to score a game.

---

## App States

### UNREGISTERED (default)
- Full scoring functionality, no backend sync
- Settings menu shows a **"Connect to Club"** option

### REGISTERED (paired sheet)
- Full scoring functionality
- All scores auto-posted to Firebase in the background
- Settings menu shows the club name, sheet name, and a **"Disconnect"** option

---

## Data Model

Multi-tenant hierarchy: each club can have many sheets, and each sheet records many games.

```
clubs/{clubId}
  - name: string

clubs/{clubId}/sheets/{sheetId}
  - name: string
  - pairingCode: string        // single-use, set by admin, cleared after pairing
  - liveGame: {                // overwritten on every score change, cleared on finish
      currentEnd: int
      team1: { name: string, score: int, hasHammer: bool }
      team2: { name: string, score: int, hasHammer: bool }
    }

clubs/{clubId}/sheets/{sheetId}/games/{gameId}   // auto-ID, written on Finish Game
  - startedAt: timestamp
  - finishedAt: timestamp
  - numberOfEnds: int
  - team1: { name: string, totalScore: int, hadLastStoneFirstEnd: bool }
  - team2: { name: string, totalScore: int, hadLastStoneFirstEnd: bool }
  - ends: [
      { endNumber: int, scoringTeam: string | null, score: int, gameTimeInSeconds: int }
    ]
```

---

## Phases

### Phase 1 — SDK & Model Serialization ✅

**Goal:** Firebase is initialized in the app and existing models can serialize to/from JSON. No user-facing changes.

Tasks:
- Add Flutter Firebase packages: `firebase_core`, `firebase_auth`, `cloud_firestore`, `shared_preferences`
- Initialize Firebase in `main.dart` on boot
- Add `toJson()` / `fromJson()` to `CurlingGame`, `CurlingTeam`, `CurlingEnd`
- Update `firebase.json` to include Firestore
- Write initial Firestore security rules (deny all by default)

---

### Phase 2 — Optional Sheet Registration & Disconnect ✅

**Goal:** Users can optionally pair their scoreboard to a club/sheet using a one-time pairing code. They can disconnect at any time.

#### Registration Flow
1. User taps **"Connect to Club"** in the settings menu
2. A dialog prompts for a pairing code (provided by the club admin externally)
3. The code is validated against Firestore via a `collectionGroup('sheets')` query
4. Firebase Anonymous Auth sign-in
5. `clubId`, `sheetId`, `clubName`, `sheetName` stored in `SharedPreferences`
6. App transitions to REGISTERED state — settings now shows club/sheet identity
7. Pairing code is deleted from Firestore (single-use)

#### Disconnect Flow
1. User taps **"Disconnect Sheet"** in the settings menu
2. Confirmation dialog: _"This will stop syncing scores to [Club Name]. Local scoring will continue."_
3. Firebase Auth sign-out, `SharedPreferences` cleared
4. App transitions back to UNREGISTERED state
5. Any in-progress game continues locally without interruption

#### Pairing Code Management
Pairing codes are created by a club admin (initially via Firebase console, later via an admin UI). Each code is:
- Stored on the target sheet document in Firestore
- Single-use (deleted after successful pairing)
- Not time-limited in Phase 2 (can add expiry later)

---

### Phase 3 — Conditional Score Posting

**Goal:** When REGISTERED, live game state and completed game records are automatically posted to Firestore.

A `SyncService` class handles all Firestore writes. It checks registration state before every write — if UNREGISTERED it is a no-op; if REGISTERED it performs a fire-and-forget write. Errors are swallowed silently so local scoring is never interrupted.

#### Live Game State
The sheet document's `liveGame` field is overwritten on every score change with the current end, both team scores, and who has hammer. This gives real-time visibility to any consumer watching the sheet document. `liveGame` is cleared when the game finishes.

#### Game Records
When "Finish Game" is tapped, the completed game is written as a new document under `games/` (auto-ID) with full end-by-end detail. Games played while UNREGISTERED are not saved to Firestore.

Trigger points (mapped to existing `main.dart` state mutations):

| App Event | Firestore Action |
|---|---|
| `enterScore()` called | Overwrite `liveGame` on sheet document |
| `editScore()` called | Overwrite `liveGame` on sheet document |
| `finishGame()` called | Write `games/{autoId}` record, clear `liveGame` |

#### Security Rules Changes
- Sheet `update`: expand `affectedKeys` to include `liveGame` alongside `pairingCode`
- `games/{gameId}`: change from `allow read, write: if false` to `allow create: if request.auth != null` (append-only, no edits or deletes from the app)

Firestore's SDK handles offline resilience automatically — writes queued without connectivity are flushed on reconnect.

The existing UI and game logic are not modified — sync is a side-effect only.

---

### Phase 4 — Admin Portal (future)

**Goal:** A way for club admins to manage clubs, sheets, and pairing codes without direct Firebase console access.

- Separate Flutter web app or additional route within this app (gated by admin auth)
- Create clubs and sheets
- Generate and revoke pairing codes
- View live scores across all sheets
- Firestore security rules updated to gate admin actions by a custom claim

This phase is independent and can be developed in parallel with or after Phase 3.

---

## Technical Notes

- **Auth method:** Firebase Anonymous Auth. No passwords or accounts needed on the scoreboard itself. The anonymous identity is bound to the sheet via a Firestore claim on successful pairing.
- **Offline behavior:** Firestore's offline cache means scoring works with no internet. Writes are queued and synced automatically on reconnect.
- **State management:** Registration state is held in `SharedPreferences` and checked at boot. A lightweight service class (`SyncService`) encapsulates all Firebase writes — the rest of the app does not need to know about Firebase.
- **No breaking changes:** All phases are strictly additive. The app at any phase is fully functional without credentials.

---

## Iteration Order

| Phase | Scope | Complexity | Depends On |
|---|---|---|---|
| 1 | SDK + model serialization | Low | — |
| 2 | Optional registration + disconnect | Medium | Phase 1 |
| 3 | Conditional score posting | Low | Phase 2 |
| 4 | Admin portal | Medium–High | Phase 1 (independent) |

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
  - createdAt: timestamp

clubs/{clubId}/sheets/{sheetId}
  - name: string
  - pairingCode: string   // single-use, set by admin, cleared after use
  - createdAt: timestamp

clubs/{clubId}/sheets/{sheetId}/games/{gameId}
  - team1: { name, color }
  - team2: { name, color }
  - numberOfEnds: int
  - numberOfPlayersPerTeam: int
  - scoreboardStyle: string
  - startTime: timestamp
  - endTime: timestamp | null
  - isComplete: bool
  - currentPlayingEnd: int
  - ends: [
      { endNumber, scoringTeamName, score, gameTimeInSeconds }
    ]
```

---

## Phases

### Phase 1 — SDK & Model Serialization

**Goal:** Firebase is initialized in the app and existing models can serialize to/from JSON. No user-facing changes.

Tasks:
- Add Flutter Firebase packages: `firebase_core`, `firebase_auth`, `cloud_firestore`, `shared_preferences`
- Initialize Firebase in `main.dart` on boot
- Add `toJson()` / `fromJson()` to `CurlingGame`, `CurlingTeam`, `CurlingEnd`
- Update `firebase.json` to include Firestore
- Write initial Firestore security rules (deny all by default)

---

### Phase 2 — Optional Sheet Registration & Disconnect

**Goal:** Users can optionally pair their scoreboard to a club/sheet using a one-time pairing code. They can disconnect at any time.

#### Registration Flow
1. User taps **"Connect to Club"** in the settings menu
2. A dialog prompts for a pairing code (provided by the club admin externally)
3. The code is validated against Firestore — if valid, returns `clubId` + `sheetId`
4. Firebase Anonymous Auth sign-in, identity bound to that sheet
5. `clubId`, `sheetId`, `clubName`, `sheetName` stored in `SharedPreferences`
6. App transitions to REGISTERED state — settings now shows club/sheet identity
7. Pairing code is marked as used in Firestore (single-use)

#### Disconnect Flow
1. User taps **"Disconnect Sheet"** in the settings menu
2. Confirmation dialog: _"This will stop syncing scores to [Club Name]. Local scoring will continue."_
3. Firebase Auth sign-out, `SharedPreferences` cleared
4. App transitions back to UNREGISTERED state
5. Any in-progress game continues locally without interruption — it simply stops syncing

#### Pairing Code Management
Pairing codes are created by a club admin (initially via Firebase console, later via an admin UI). Each code is:
- Stored on the target sheet document in Firestore
- Single-use (cleared after successful pairing)
- Not time-limited in Phase 2 (can add expiry later)

---

### Phase 3 — Conditional Score Posting

**Goal:** When REGISTERED, game events are automatically posted to Firestore as they happen.

A `SyncService` class wraps all game mutations. It checks registration state before every write — if UNREGISTERED it is a no-op; if REGISTERED it performs a fire-and-forget Firestore write.

Trigger points (mapped to existing `main.dart` state mutations):

| App Event | Firestore Action |
|---|---|
| Game started | Create game document |
| `enterScore()` called | Append end to game document |
| `editScore()` called | Update the relevant end in place |
| Game finished | Set `isComplete: true`, write `endTime` |

Firestore's SDK handles offline resilience automatically — scores written without connectivity are queued and flushed when the connection resumes.

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

# Curling Scoreboard

A platform for curling clubs to run and display live scoreboards, track game history, and manage scoring. It's built as a monorepo with three products sharing a Firebase backend:

| Product | Stack | Purpose |
|---|---|---|
| `app/` | Flutter | Scoreboard app (web, mobile, desktop) |
| `admin/` | React + Vite | Club and super-admin web portal |
| `functions/` | Node.js + Express | REST API and callable Cloud Functions |

Shared Firebase config (`firebase.json`, `firestore.rules`, `firestore.indexes.json`) lives at the repo root.

---

## Prerequisites

- [Flutter](https://docs.flutter.dev/get-started/install) 3.44.0 (stable)
- [Node.js](https://nodejs.org/) 20
- [Firebase CLI](https://firebase.google.com/docs/cli) — `npm install -g firebase-tools`
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) — for local credentials via `gcloud`

---

## First-time setup

### 1. Authenticate
```bash
firebase login
gcloud auth application-default login
```

### 2. Select the dev project
```bash
firebase use default   # targets curling-scoreboard-dev
```

### 3. Install dependencies
```bash
cd app && flutter pub get
cd admin && npm install
cd functions && npm install
cd scripts && npm install
```

---

## Running locally

### Scoreboard app

Open the repo in VS Code and use the **Launch Web** run configuration (`.vscode/launch.json`). This starts the app in Chrome pointing at the live dev Firebase project (`curling-scoreboard-dev`).

To run from the terminal:

```bash
cd app
flutter run -d chrome --dart-define=FIREBASE_ENV=dev -t lib/main.dart
```

### Admin portal

```bash
cd admin
npm run dev
```

Starts the Vite dev server. The portal uses the dev Firebase project by default.

### Functions

Functions run on Firebase Cloud Functions — there's no local emulator configured. During development, the app and admin portal connect directly to the live dev project's deployed functions. To deploy your changes to dev:

```bash
firebase deploy --only functions --project curling-scoreboard-dev
```

---

## Seeding dev data

A seed script populates the dev Firestore with realistic clubs, sheets, and game history.

```bash
cd scripts
npm install
node seed-dev.js
```

The script is **idempotent for clubs and sheets** — re-running it won't create duplicates there. Each run does add a new set of game documents, so run it once unless you want additional game history.

To target a different project:

```bash
FIREBASE_PROJECT_ID=my-other-project node seed-dev.js
```

---

## Deployments

### PR previews

Opening a PR triggers the [validate_pr](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/validate_pr.yaml) workflow, which runs formatting, analysis, type checking, tests, and spell checking per product (only for products whose files changed). Once checks pass, a preview build is deployed to a temporary Firebase Hosting channel and linked on the PR.

### Dev

Every push to `main` automatically deploys all three products to the live dev environment:

| Workflow | Deploys |
|---|---|
| [deploy_web_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_dev.yaml) | Flutter web app |
| [deploy_admin_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_admin_dev.yaml) | Admin portal |
| [deploy_functions_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_functions_dev.yaml) | Cloud Functions + Firestore rules |

### Prod

First, generate a version tag using the [version_increment](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/version_increment.yaml) workflow. It reads the commits since the last release, writes the [changelog](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/CHANGELOG.md) and [release notes](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/RELEASE_NOTES.md), and commits the tag back to `main`.

Then trigger each prod workflow manually, entering the version tag (e.g. `0.0.37`):

| Workflow | Deploys |
|---|---|
| [deploy_web_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_prod.yaml) | Flutter web app |
| [deploy_admin_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_admin_prod.yaml) | Admin portal |
| [deploy_functions_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_functions_prod.yaml) | Cloud Functions + Firestore rules |

Each workflow checks out the exact tag and deploys it to the live prod environment (`curling-scoreboard-prod`).

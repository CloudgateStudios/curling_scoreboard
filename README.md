# Curling Scoreboard

A platform for curling clubs to run and display live scoreboards, track game history, and manage scoring. It's built as a monorepo with three products sharing a Firebase backend:

| Product      | Stack             | Purpose                               |
| ------------ | ----------------- | ------------------------------------- |
| `app/`       | Flutter           | Scoreboard app (web, mobile, desktop) |
| `admin/`     | React + Vite      | Club and super-admin web portal       |
| `functions/` | Node.js + Express | REST API and callable Cloud Functions |

Shared Firebase config (`firebase.json`, `firestore.rules`, `firestore.indexes.json`) lives at the repo root.

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the data model, roles, pairing, syncing, the REST API and how scoreboards reload after a deploy
- [CONTRIBUTING.md](CONTRIBUTING.md): PR conventions, the checks to run, spelling, scoreboard text and release-managed files
- [API documentation](https://curlingscoreboard.app/api-docs/) for club integrations

---

## Prerequisites

- [Flutter](https://docs.flutter.dev/get-started/install) 3.47.6. The version is set by `environment.flutter` in `app/pubspec.yaml`, which CI reads too. With [FVM](https://fvm.app), run `fvm install` in `app/` to get it (`app/.fvmrc`).
- [Node.js](https://nodejs.org/) 22 (see `.nvmrc`)
- [Java](https://adoptium.net/) 21 or later, only for running the emulator tests
- [Firebase CLI](https://firebase.google.com/docs/cli) — `npm install -g firebase-tools`
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) — for local credentials via `gcloud`

The dev container in `.devcontainer/` comes with Flutter, Node and Java installed.

To move to a new Flutter version, update `app/pubspec.yaml`, `app/.fvmrc` and `FLUTTER_VERSION` in `.devcontainer/Dockerfile`.

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

From the repo root:

```bash
(cd app && flutter pub get)
(cd admin && npm install)
(cd functions && npm install)
(cd scripts && npm install)
(cd emulator-tests && npm install)
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

The app and admin portal always talk to the live dev project's deployed functions. To deploy your changes to dev:

```bash
firebase deploy --only functions --project curling-scoreboard-dev
```

Before that, the functions and the Firestore rules can be tested locally against the Firebase emulators (needs Java 21 or later):

```bash
cd emulator-tests
npm test
```

See [`emulator-tests/README.md`](emulator-tests/README.md) for what the tests cover.

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

### Migrating API keys

Club API keys live at `clubs/{clubId}/private/apiKey`, readable only by that club's admins. Older clubs kept the key on the club document itself, which any signed in client could read. After deploying the rules and functions that use the new location, run the one-off migration once per project. It gives every club a new key and deletes the old field:

```bash
cd scripts
npm install
node migrate-api-keys.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node migrate-api-keys.js  # prod
```

### Backfilling scoreboard claims

Pairing gives a scoreboard custom claims that let it read its club's settings. Scoreboards paired before that was added have none. After deploying the functions and rules that use the claims, run the one-off backfill once per project, so nobody has to pair again:

```bash
cd scripts
npm install
node backfill-scoreboard-claims.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-scoreboard-claims.js  # prod
```

Each scoreboard picks its claims up within the hour, the next time its sign in token refreshes.

### Backfilling scoreboard PINs

A scoreboard asks for its club's admin PIN before it disconnects, and a club without one cannot disconnect its scoreboards at all. New clubs are given a PIN when they are created. After deploying the functions and rules that use the PIN, run the one-off backfill once per project to give every older club a random four digit PIN:

```bash
cd scripts
npm install
node backfill-scoreboard-pins.js                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node backfill-scoreboard-pins.js  # prod
```

It prints each new PIN. Clubs that already have one keep it, so it is safe to re-run. Club admins can see and change their PIN in the admin portal.

---

## Admin accounts

### Creating the first super admin

Super admins manage every club in the admin portal. The `setSuperAdminClaim` function can only be called by an existing super admin, so the first one in a project is created with a script. Create the user first (Firebase console → Authentication → Add user), then:

```bash
cd scripts
node set-super-admin.js someone@example.com                                              # dev
FIREBASE_PROJECT_ID=curling-scoreboard-prod node set-super-admin.js someone@example.com  # prod
```

The user has to sign out and back in to the admin portal before the new role takes effect. Club admins are created from the admin portal by a super admin.

---

## Deployments

### PR checks

Opening a PR triggers the [validate_pr](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/validate_pr.yaml) workflow. It always checks that the PR title follows the conventional commit format and spell checks the repo. The product checks only run when that product's files changed:

| When these change                                                     | Checks                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `app/`                                                                | Formatting, analysis, web build, tests, Android release build, unused localized strings |
| `admin/`                                                              | Type checking, lint, tests, build                                                       |
| `functions/`                                                          | Build, lint                                                                             |
| `functions/`, `firestore.rules`, `firebase.json` or `emulator-tests/` | Firestore rules tests and Cloud Functions tests against the emulators                   |
| `scripts/`                                                            | Syntax check                                                                            |

Changing a workflow file runs the checks for the product it builds or deploys.

Nothing is deployed from a PR; deploys start once it merges to `main`.

### Dev

Every push to `main` automatically deploys all three products to the live dev environment:

| Workflow                                                                                                                   | Deploys                           |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [deploy_web_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_dev.yaml)             | Flutter web app                   |
| [deploy_admin_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_admin_dev.yaml)         | Admin portal                      |
| [deploy_functions_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_functions_dev.yaml) | Cloud Functions + Firestore rules |

### Prod

First, generate a version tag using the [version_increment](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/version_increment.yaml) workflow. It reads the commits since the last release, writes the [changelog](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/CHANGELOG.md) and [release notes](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/RELEASE_NOTES.md), and commits the tag back to `main`.

Then trigger each prod workflow manually, entering the version tag (e.g. `0.0.37`):

| Workflow                                                                                                                     | Deploys                           |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [deploy_web_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_prod.yaml)             | Flutter web app                   |
| [deploy_admin_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_admin_prod.yaml)         | Admin portal                      |
| [deploy_functions_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_functions_prod.yaml) | Cloud Functions + Firestore rules |

Each workflow checks out the exact tag and deploys it to the live prod environment (`curling-scoreboard-prod`).

### Adding a new callable Cloud Function

Callable functions (`onCall`) must be callable by anyone, because each one checks the caller itself. The Google Cloud organization that owns both projects blocks public access by default, through the "Domain restricted sharing" organization policy (`iam.allowedPolicyMemberDomains`). Both Firebase projects override it to allow public access. Without that override, deploying a new function fails with "Unable to set the invoker for the IAM policy", and later deploys skip the function as unchanged, leaving it unreachable.

If a new project is ever added, override the policy there before deploying functions:

```bash
cat > /tmp/allow-public.yaml <<'EOF'
name: projects/PROJECT_ID/policies/iam.allowedPolicyMemberDomains
spec:
  rules:
  - allowAll: true
EOF
gcloud org-policies set-policy /tmp/allow-public.yaml
```

To fix a function that was already deployed without public access:

```bash
gcloud functions add-invoker-policy-binding FUNCTION_NAME \
  --region=us-central1 --member=allUsers --project=PROJECT_ID
```

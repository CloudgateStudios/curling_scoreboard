# Curling Scoreboard

A simple Curling Scoreboard, written in Flutter, meant to be used in any curling club that has an electronic scoreboard. Allows for live polling of scores as well as historical games as needed.

## Project Setup

### Prerequisites

- [Flutter](https://docs.flutter.dev/get-started/install) - typically latest stable
- [Firebase CLI](https://firebase.google.com/docs/cli) - `npm install -g firebase-tools`
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) - `gcloud` for local credentials

### First-time setup

1. Clone the repo and open the root folder in VS Code.

2. Install Flutter dependencies:

   ```bash
   cd app
   flutter pub get
   ```

3. Authenticate with Firebase:

   ```bash
   firebase login
   gcloud auth application-default login
   ```

4. Select the dev project:

   ```bash
   firebase use default   # targets curling-scoreboard-dev
   ```

### Running locally

Open the project in VS Code and use the **Launch Web** run configuration (`.vscode/launch.json`). This launches the app in Chrome against the dev Firebase project.

### Seeding Dev Data

A Node.js seed script populates the dev Firestore with realistic test data:

#### Prerequisites

- Node.js 18+
- Authenticated via `gcloud auth application-default login` (see setup above)

#### Running the seed script

```bash
cd scripts
npm install
node seed-dev.js
```

The script targets `curling-scoreboard-dev` by default. To target a different project:

```bash
FIREBASE_PROJECT_ID=my-other-project node seed-dev.js
```

The script is **idempotent for clubs and sheets** — re-running it won't create duplicates there. Each run does add a new set of game documents per sheet, so run it once unless you intentionally want more game history.

---

## Deployments

### PR Previews

When a pull request is opened, the [validate_pr](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/validate_pr.yaml) workflow runs all checks (code, formatting, tests, spelling). Once all checks pass, a preview build is automatically deployed to a temporary Firebase Hosting channel named after the branch. Previews expire after 10 days and a link is posted directly on the PR.

### Dev System

Any push to `main` automatically triggers the [deploy_web_dev](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_dev.yaml) workflow, which builds and deploys the app and Firestore configuration to the live dev environment.

### Prod System

You first need to ensure you have a new tagged version. This is handled by the [version_increment](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/version_increment.yaml) workflow. This will automatically read the commits, create the [changelog](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/CHANGELOG.md) and [release notes](https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/RELEASE_NOTES.md) and commit it all back to the `main` branch.

Production deploys are manual. Go to the [deploy_web_prod](https://github.com/CloudgateStudios/curling_scoreboard/actions/workflows/deploy_web_prod.yaml) action, click "Run Workflow", and enter the version tag to deploy (e.g. `0.0.34`). The workflow checks out that exact tag and deploys it to the live prod environment.

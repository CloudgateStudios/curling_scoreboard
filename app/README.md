# Scoreboard app

The Flutter app that runs on each sheet. It scores a game end by end and,
once paired with a club's sheet, syncs it to Firestore. It is deployed as a
web app to Firebase Hosting and also builds for Android, iOS, macOS, Windows
and Linux.

How it works: [docs/architecture/scoreboard.md](../docs/architecture/scoreboard.md).
Setup for the whole repo, including the Flutter version: the
[README](../README.md).

## Running

```bash
flutter pub get
flutter run -d chrome --dart-define=FIREBASE_ENV=dev -t lib/main.dart
```

Or use the **Launch Web** configuration in `.vscode/launch.json`.

| `--dart-define` | Values                     | What it does                                                                                     |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `FIREBASE_ENV`  | `dev` (default) or `prod`  | Picks `lib/firebase_options_dev.dart` or `lib/firebase_options_prod.dart`                         |
| `BUILD_ID`      | A commit SHA               | Set by the deploy workflows. Without it the app never reloads itself onto a new build            |

## Checks

```bash
dart format --set-exit-if-changed lib test
flutter analyze
flutter test
dart run translations_cleaner list-unused-terms --abort-on-unused
```

## Layout

| Path                       | What is in it                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `lib/main.dart`            | Starts Firebase and the services, and `CurlingScoreboardScreen`, which opens each dialog and lays out the board   |
| `lib/controllers/`         | `GameController`: the game, its clock, entering and correcting scores, finishing                                   |
| `lib/models/`              | `CurlingGame`, `CurlingEnd`, `CurlingTeam`, `RockColors`, `League`, `Bonspiel`                                     |
| `lib/services/`            | Everything that talks to Firebase, the device or the browser (below)                                               |
| `lib/widgets/`             | The screens and parts of them, a folder each                                                                      |
| `lib/l10n/`                | `app_en.arb`, every string the app shows, and the generated `app_localizations*.dart`                             |
| `lib/constants.dart`       | Colors, defaults, end lengths, the update and status timings                                                      |
| `lib/src/version.dart`     | The version, written by the release workflow                                                                      |
| `test/`                    | Unit and widget tests, laid out like `lib/`                                                                        |
| `web/`                     | `index.html` and the manifest, plus `openapi.yaml` and the pages built from it (below)                            |

### Services

| Service                 | Does                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `RegistrationService`   | Pairs and unpairs through `pairSheet` and `unpairSheet`, and keeps the club and sheet in shared preferences |
| `SyncService`           | Writes `liveGame`, completed games and status reports to the paired sheet, fire and forget              |
| `DeviceStatusService`   | Builds the status report and decides when to send it                                                     |
| `RockColorsService`     | Follows the club's rock colors                                                                           |
| `LeagueService`         | Follows the club's active leagues                                                                        |
| `BonspielService`       | Follows the club's active bonspiels and their state                                                      |
| `UpdateService`         | Web only: notices a new deploy, so the app can reload between games                                      |
| `web_platform*.dart`    | Browser calls behind a conditional import, so the app still builds for other platforms                   |

### Widgets

| Folder         | What it is                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `game_start/`  | The setup screen, with the league bar, the bonspiel bar and the team picker                    |
| `app_bar/`     | Add Score, Teams, Finish Game and Settings, and the score entry dialog                         |
| `scoreboard/`  | The Baseball and Curling Club boards                                                           |
| `total_score/` | The big totals, with hammer, end and team names                                                |
| `game_info/`   | The game clock and pace                                                                        |
| `game_end/`    | The game report                                                                                |
| `connection/`  | Connecting to a club, the press and hold connection status, and disconnecting with the PIN     |
| `update/`      | The countdown banner before a reload                                                           |

## Text

Every string the app shows is in `lib/l10n/app_en.arb` with an `@key`
description, read through `context.l10n`. `flutter pub get` regenerates
`app_localizations*.dart`; commit those too. CI fails on unused strings.

## The API docs pages

`web/openapi.yaml` describes the public REST API and the completed game
webhook. It is deployed with the app, so it is served beside it:

- `/api-docs/` renders it for club integrators.
- `/api-test/` is a small page for trying requests against a club with its
  API key.

Change `openapi.yaml` in the same pull request as any change to the API's
responses or the webhook's body.

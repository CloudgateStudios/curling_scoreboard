# CLAUDE.md

Guidance for Claude Code sessions in this repo. People should read the
[README](README.md) and [CONTRIBUTING](CONTRIBUTING.md); this file points at
them rather than repeating them.

## What this is

A monorepo for curling clubs: a Flutter scoreboard on each sheet (`app/`), a
React admin portal (`admin/`), Cloud Functions that also serve the REST API,
the display pages and the public scores page (`functions/`), admin scripts
(`scripts/`) and emulator tests for the rules and functions
(`emulator-tests/`), all on one Firebase project for dev and one for prod.

Read before changing something:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the system diagram, the life
  of a game, every Cloud Function, and links to a page for each area in
  `docs/architecture/`.
- [docs/FEATURES.md](docs/FEATURES.md): what each kind of user can do.
- The README in the folder you are working in.

## Things that hold everywhere

- The scoreboard never depends on Firebase. Scoring works offline and
  unpaired, and every write from the app is fire and forget.
- A finished game is written once, by the scoreboard, as a `games` document.
  Everything else that shows a result is rebuilt from it by a function.
- Triggers rebuild from the documents as they are now, in a transaction,
  never from the event, so a late or repeated delivery is harmless.
- Anything a client cannot be trusted to do goes in a Cloud Function, not in
  `firestore.rules`. Secrets live under `clubs/{clubId}/private/`.
- Display screens and the public page are left open for weeks: they retry
  everything, reload themselves after a deploy, and must stay cheap per
  viewer.

## Checks to run

Run the checks for every product you touch before pushing. CI runs the same.

| Folder            | Commands                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app/`            | `dart format --set-exit-if-changed lib test`, `flutter analyze`, `flutter test`, `dart run translations_cleaner list-unused-terms --abort-on-unused` |
| `admin/`          | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`                                                                   |
| `functions/`      | `npm run build`, `npm run lint`                                                                                                   |
| `emulator-tests/` | `npm test` (needs Java 21+; builds `functions/` first)                                                                            |
| `scripts/`        | `node --check` on each changed file                                                                                               |
| Everything        | `npx cspell -c .github/cspell.json "**/*.{md,dart,ts,tsx,yaml,yml,html,css}"`                                                     |

Every change to `firestore.rules` or to a function's behavior needs a case in
`emulator-tests/rules.test.mjs` or `functions.test.mjs`.

## Conventions

- **PRs** are squash merged, so the title is the commit on `main`. It must be
  a Conventional Commit (`feat`, `fix`, `docs`, `refactor`, `test`, `ci`,
  `chore`, `revert`); `feat`, `fix` and `test` reach the changelog, so write
  those titles for the people reading release notes. Fill in every section
  of the PR template.
- **Writing.** Docs, comments and commit messages here are plain English in
  short sentences, saying what happens and why, without jargon or filler:
  "Writes are fire and forget, so a failed write never interrupts scoring."
  Match that. Commit bodies explain the problem and the fix in prose.
- **Scoreboard text** goes in `app/lib/l10n/app_en.arb` with an `@key`
  description, read through `context.l10n`; commit the regenerated
  `app_localizations*.dart` too.
- **Spelling.** Add real words to `.github/.cspell/curling_dictionary.txt` or
  `dev_dictionary.txt`, kept sorted; use `// cspell:ignore` for one-off
  strings.
- **Mirrored code.** Some logic exists twice and changes together:
  `sheetView` and `lastGameOf` in `functions/src/display/state.ts` and
  `assets/display.js`; webhook message variables in
  `functions/src/webhookMessage.ts` and `admin/src/lib/webhookMessage.ts`;
  the live game timeout in `functions/src/liveGame.ts` and
  `admin/src/lib/liveGame.ts`; when a page reloads onto a new build, in
  `assets/update-model.js` and the app's `UpdateService`; and the draw on
  now and where each side comes from, in `assets/bonspiel-model.js`,
  `admin/src/lib/bonspiels.ts` and `app/lib/models/bonspiel.dart`.

## Keep the docs current

Update the docs in the same PR as the change. CONTRIBUTING's
[Keeping the docs current](CONTRIBUTING.md#keeping-the-docs-current) table
says which doc covers what. Diagrams are Mermaid blocks; quote labels, use
`<br/>` for line breaks, and avoid `*` and `_` in pairs.

## Don't

- Edit generated or release-managed files: `app/lib/src/version.dart`, the
  version in `app/pubspec.yaml`, `docs/CHANGELOG.md`,
  `docs/RELEASE_NOTES.md`, `app/lib/l10n/app_localizations*.dart`,
  `app/lib/firebase_options_*.dart`.
- Deploy, or run a script against a Firebase project, unless asked. Merges
  to `main` deploy to dev; prod is deployed by hand from a release tag.
- Add a Firestore index in the console; put it in `firestore.indexes.json`.
- Change the Flutter version in one place; it is in `app/pubspec.yaml`,
  `app/.fvmrc` and `.devcontainer/Dockerfile`.
- Add a callable function without reading "Adding a new callable Cloud
  Function" in the README; it has to be public to be called at all.

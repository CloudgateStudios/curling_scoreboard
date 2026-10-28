# Contributing

How to make a change and get it shipped. Setup lives in the
[README](README.md), how the pieces fit together in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and what the system does in
[docs/FEATURES.md](docs/FEATURES.md).

## Pull requests

- Branch from `main` and open a PR back into it. PRs are squash merged, so the
  PR title becomes the commit message on `main`.
- The title must follow [Conventional Commits](https://www.conventionalcommits.org):
  `<type>: <description>`, with type one of `feat`, `fix`, `docs`, `refactor`,
  `test`, `ci`, `chore` or `revert`. CI rejects anything else.
- The type decides whether the change shows up in the
  [changelog](docs/CHANGELOG.md): `feat`, `fix` and `test` do; the rest don't.
- Fill in the PR template's Summary, Test Plan and Docs.

## Checks to run before pushing

CI runs these for whatever your PR touches (see the table in the README). They
are quick to run locally first.

**Scoreboard app** (`app/`)

```bash
dart format --set-exit-if-changed lib test
flutter analyze
flutter test
dart run translations_cleaner list-unused-terms --abort-on-unused
```

**Admin portal** (`admin/`)

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

**Cloud Functions** (`functions/`)

```bash
npm run build
npm run lint
```

**Firestore rules and functions** (`emulator-tests/`, needs Java 21 or later)

```bash
npm test
```

**Docs** (`docs-check/`, for any Markdown change)

```bash
npm run check
```

Changing `firestore.rules` or a function? Add a case to `rules.test.mjs` or
`functions.test.mjs` for the access you mean to allow or deny.

## Spelling

CI spell checks Markdown, Dart, TypeScript, YAML, HTML and CSS with
[cspell](https://cspell.org). For a real word it doesn't know, add it to the
right dictionary, keeping it sorted:

- `.github/.cspell/curling_dictionary.txt` for curling terms
- `.github/.cspell/dev_dictionary.txt` for code and tooling terms

For one-off strings such as keys or IDs, use a `// cspell:ignore word` comment
in that file instead. To check locally:

```bash
npx cspell -c .github/cspell.json "**/*.{md,dart,ts,tsx,yaml,yml,html,css}"
```

## Scoreboard text

User-facing text in the app goes in `app/lib/l10n/app_en.arb`, with an
`@key` description. `flutter pub get` (or `flutter gen-l10n`) regenerates
`app_localizations*.dart` next to it; commit those too. Read strings through
`context.l10n`. CI fails on strings in the `.arb` file that nothing uses, so
remove a string when you remove its last use.

## Firebase changes

- **Rules**: `firestore.rules` deploys with the functions. Every rule change
  needs a matching test in `emulator-tests/rules.test.mjs`.
- **New callable function**: it must be public to be called at all, which the
  Google Cloud organization blocks by default. Both projects allow it; read
  "Adding a new callable Cloud Function" in the README before adding one to a
  new project.
- **Indexes**: add them to `firestore.indexes.json`, not in the console, so
  they deploy everywhere.

## Keeping the docs current

Update the docs in the same PR as the change they describe. Where to look:

| When you change                                       | Update                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A Firestore document or field                         | The tree and diagram in `docs/architecture/data-model.md`                                    |
| `firestore.rules` or a role                           | The tables in `docs/architecture/auth-and-roles.md`                                          |
| A Cloud Function, added, removed or newly called      | The functions table in `docs/ARCHITECTURE.md`, and the table of pieces if a client calls it   |
| How a feature works                                   | Its page in `docs/architecture/`                                                             |
| What users can do                                     | `docs/FEATURES.md`                                                                           |
| The REST API's responses or the webhook's body        | `app/web/openapi.yaml`, and `docs/architecture/api-and-webhook.md`                          |
| A product's folders, scripts or build flags           | That folder's README                                                                         |
| A script in `scripts/`                                | The table in `scripts/README.md`                                                             |
| A workflow                                            | The Deployments tables in the README, and `docs/architecture/deploys-and-updates.md`         |

Diagrams are [Mermaid](https://mermaid.js.org) blocks in the Markdown, which
GitHub draws; check them in the PR's rich diff. In a label, quote the text
(`A["..."]`), use `<br/>` for a line break, and avoid `*` and `_` in pairs,
which Mermaid takes as Markdown emphasis. Text in diagrams is spell checked
like the rest. `docs-check/` renders every diagram and follows every
relative link; run it before pushing a docs change.

## Generated and release-managed files

Don't edit these by hand:

- `app/lib/src/version.dart` and the `version` in `app/pubspec.yaml`, set by
  the release workflow
- `docs/CHANGELOG.md` and `docs/RELEASE_NOTES.md`, written from commit
  messages at release time
- `app/lib/l10n/app_localizations*.dart`, generated from the `.arb` file
- `app/lib/firebase_options_*.dart`, generated by the FlutterFire CLI

## Releasing

Merges to `main` deploy to dev automatically. Releasing to prod is described
under Deployments in the README: run Version Increment, then the three prod
deploy workflows with the new tag.

## Dependencies

Dependabot opens weekly grouped updates for every package and for the GitHub
Actions, which are pinned to commit SHAs. It does not update two pins in the
workflows: firebase-tools in the deploy workflows, which should match
`emulator-tests/package.json`, and the Node versions, which every workflow
reads from the `.nvmrc` of the product it builds. The Flutter version is set in
`app/pubspec.yaml`, `app/.fvmrc` and the dev container; change all three
together.

# Admin portal

The React and Vite web app where super admins, club admins and bonspiel
admins manage clubs. It reads and writes Firestore directly, within
`firestore.rules`, and calls Cloud Functions for anything the rules cannot
allow. It is deployed to the `admin` Firebase Hosting target.

How it works: [docs/architecture/admin-portal.md](../docs/architecture/admin-portal.md).

## Running

```bash
npm install
npm run dev
```

The portal uses the dev Firebase project. `VITE_ENV=prod` switches it to prod
(see `.env.example`); the prod deploy sets it. The Firebase web config for
both is in `src/lib/firebase.ts`, and is not secret.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Tests are Node's built in test runner over `src/lib/*.test.mjs`, so they
cover the logic in `src/lib/`, not the components. `guides.ts` uses Vite's
`import.meta.glob`, so it has no test; the help tests read the guides
themselves and check every link between them.

## Layout

| Path                          | What is in it                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                 | Sign-in and the routes for each role                                                                           |
| `src/pages/`                  | One file a route: the super admin's club list, a club, a sheet's game history, a league, a bonspiel, sign-in, help |
| `src/components/club/`        | The club page's tabs and settings groups, one component a section                                             |
| `src/components/bonspiel/`    | The bonspiel page: draw board, game and template dialogs, bracket view                                         |
| `src/lib/`                    | Logic with no React in it, with its tests beside it                                                            |
| `src/hooks/useAuth.ts`        | The signed in user and their role claims                                                                       |
| `src/types/index.ts`          | Firestore document types                                                                                       |
| `src/styles/common.module.css`| Shared styles; each component has its own CSS module                                                           |

### What is in `src/lib/`

| File                    | Does                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `firebase.ts`           | Firebase setup for dev and prod, and the scoreboard site's address                                 |
| `leagues.ts`            | League checks, draw times and overlaps                                                             |
| `leagueCsv.ts`          | Parsing a league CSV and working out what an import changes                                        |
| `bonspiels.ts`          | Bonspiel plans: checking them before they save, draws, sides, brackets and duplicating            |
| `bonspielTemplates.ts`  | The knockout and pools templates                                                                   |
| `gamesCsv.ts`           | Exporting games as CSV                                                                             |
| `gameEnds.ts`, `liveGame.ts` | Reading ends and live games, including older records                                          |
| `rockColors.ts`         | The rock colors a club can pick                                                                    |
| `displayLinks.ts`       | Display link settings and URLs                                                                     |
| `displayBranding.ts`    | Shrinking a logo to fit and encoding it                                                            |
| `deviceHealth.ts`       | Whether a scoreboard or screen is online and up to date                                            |
| `webhookMessage.ts`     | The webhook message variables and the preview; matches `functions/src/webhookMessage.ts`           |
| `gameWebhook.ts`        | How a game's webhook post went                                                                     |
| `credentials.ts`        | Generating API keys and pairing codes                                                              |
| `unsavedChanges.ts`     | Warning before leaving with unsaved edits                                                          |
| `guides.ts`             | The guides in `docs/guides/`, read in when the portal is built, for the help pages                 |
| `helpMarkdown.ts`       | A guide as HTML, with its links and heading ids as GitHub gives them                               |
| `format.ts`             | Durations, times ago and error messages for display                                                |

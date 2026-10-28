# Docs check

Checks the repo's Markdown the way GitHub shows it:

- every ` ```mermaid ` diagram renders, with the version of Mermaid pinned in
  `package.json`, in headless Chromium
- every relative link reaches a file, and the heading it names after `#`, if
  any, is there

GitHub shows a diagram that does not render as an error box, and a link to a
heading that was renamed goes nowhere, so neither is noticed in review. The
`Validate Docs` CI job runs this whenever Markdown or this folder changes.
`docs/CHANGELOG.md` and `docs/RELEASE_NOTES.md` are skipped: the release
workflow writes them.

## Running

```bash
npm install
npx playwright install chromium   # once, for the browser
npm run check                     # every Markdown file in the repo
npm run check -- docs/FEATURES.md # just these, relative to the repo root
```

It prints each problem with its file and line, and exits non-zero if there
are any.

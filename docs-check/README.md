# Docs check

Checks the repo's Markdown the way GitHub shows it:

- every ` ```mermaid ` diagram parses, with the version of Mermaid pinned in
  `package.json`
- every relative link reaches a file, and the heading it names after `#`, if
  any, is there

GitHub shows a diagram that does not render as an error box, and a link to a
heading that was renamed goes nowhere, so neither is noticed in review. The
`Validate Docs` CI job runs this whenever Markdown or this folder changes.
`docs/CHANGELOG.md` and `docs/RELEASE_NOTES.md` are skipped: the release
workflow writes them.

Diagrams are parsed, not drawn. Parsing catches the mistakes that break a
diagram, such as a missing bracket or quote. A rare error that only shows up
while drawing would get through, but the check needs no browser, so it runs
in seconds. Mermaid only needs a window for its HTML sanitizer, which jsdom
provides.

## Running

```bash
npm install
npm run check                     # every Markdown file in the repo
npm run check -- docs/FEATURES.md # just these, relative to the repo root
```

It prints each problem with its file and line, and exits non-zero if there
are any.

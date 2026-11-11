// Checks the repo's Markdown the way GitHub shows it: every Mermaid diagram
// parses, and every relative link reaches a file, and a heading when it
// names one. GitHub only shows a broken diagram as an error box, and a link
// to a heading that was renamed goes nowhere, so neither is noticed otherwise.
//
//   npm run check                 every Markdown file in the repo
//   npm run check -- a.md b.md    just these, relative to the repo root

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The changelog and release notes are written by the release workflow, and
// link only to GitHub.
const skipped = new Set(['docs/CHANGELOG.md', 'docs/RELEASE_NOTES.md']);

function markdownFiles() {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;
  return execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !skipped.has(f));
}

// Text outside fenced code blocks, with fences blanked so line numbers hold.
function prose(text) {
  return text.replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, ''));
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// GitHub's heading anchors: lower case, punctuation dropped, spaces to
// hyphens, and -1, -2 and so on after a repeat.
function anchorsOf(file) {
  const seen = new Map();
  const anchors = new Set();
  for (const [, heading] of prose(readFileSync(file, 'utf8')).matchAll(/^#{1,6} (.*)$/gm)) {
    const slug = heading
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\- _]/gu, '')
      .replace(/ /g, '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}

function checkLinks(files) {
  const problems = [];
  const anchorCache = new Map();
  for (const file of files) {
    const text = prose(readFileSync(path.join(root, file), 'utf8'));
    for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue; // https:, mailto: and so on
      const [target, anchor] = link.split('#');
      const resolved = target ? path.resolve(path.dirname(path.join(root, file)), decodeURI(target)) : path.join(root, file);
      const where = `${file}:${lineOf(text, match.index)}`;
      if (!existsSync(resolved)) {
        problems.push(`${where}: ${link} does not exist`);
        continue;
      }
      if (anchor === undefined || anchor === '') continue;
      if (statSync(resolved).isDirectory()) {
        problems.push(`${where}: ${link} names a heading in a folder`);
        continue;
      }
      if (!anchorCache.has(resolved)) anchorCache.set(resolved, anchorsOf(resolved));
      if (!anchorCache.get(resolved).has(anchor)) {
        problems.push(`${where}: ${link} names a heading that is not there`);
      }
    }
  }
  return problems;
}

async function checkDiagrams(files) {
  const diagrams = [];
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/^```mermaid\n([\s\S]*?)^```/gm)) {
      diagrams.push({ where: `${file}:${lineOf(text, match.index)}`, code: match[1] });
    }
  }
  if (diagrams.length === 0) return { count: 0, problems: [] };

  // Mermaid's parser runs in Node; only its HTML sanitizer wants a window,
  // which jsdom gives it. Parsing finds the mistakes people make (a missing
  // bracket or quote, a label GitHub can't read) without drawing anything,
  // so no browser is needed.
  const { window } = new JSDOM('');
  globalThis.window = window;
  globalThis.document = window.document;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

  const problems = [];
  for (const { where, code } of diagrams) {
    try {
      await mermaid.parse(code);
    } catch (e) {
      const error = String(e?.message ?? e).split('\n').slice(0, 4).join('\n    ');
      problems.push(`${where}: diagram does not parse\n    ${error}`);
    }
  }
  return { count: diagrams.length, problems };
}

const files = markdownFiles();
const linkProblems = checkLinks(files);
const { count, problems: diagramProblems } = await checkDiagrams(files);
const problems = [...linkProblems, ...diagramProblems];

for (const problem of problems) console.log(problem);
console.log(`${files.length} files, ${count} diagrams: ${problems.length === 0 ? 'all good' : `${problems.length} problems`}`);
process.exitCode = problems.length === 0 ? 0 : 1;

// Run with `npm test`. Node strips the types from the .ts imports itself.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { guideHref, guidePath, guideTitle, headingId, renderGuide } from './helpMarkdown.ts';

const GUIDES = new URL('../../../docs/guides/', import.meta.url);

describe('guidePath', () => {
  test('a guide opens under /help, and the list of guides at /help', () => {
    assert.equal(guidePath('run-a-bonspiel.md'), '/help/run-a-bonspiel');
    assert.equal(guidePath('README.md'), '/help');
  });
});

describe('guideHref', () => {
  test('another guide opens in the portal, keeping its heading', () => {
    assert.equal(guideHref('set-up-a-display.md'), '/help/set-up-a-display');
    assert.equal(guideHref('set-up-a-display.md#a-bonspiel-screen'), '/help/set-up-a-display#a-bonspiel-screen');
    assert.equal(guideHref('README.md'), '/help');
  });

  test('the rest of the repo opens on GitHub', () => {
    assert.equal(
      guideHref('../architecture/displays.md#public-scores-page'),
      'https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/architecture/displays.md#public-scores-page',
    );
    assert.equal(
      guideHref('../FEATURES.md'),
      'https://github.com/CloudgateStudios/curling_scoreboard/blob/main/docs/FEATURES.md',
    );
  });

  test('web addresses and headings on the same page are left alone', () => {
    assert.equal(guideHref('https://obsproject.com'), 'https://obsproject.com');
    assert.equal(guideHref('mailto:club@example.com'), 'mailto:club@example.com');
    assert.equal(guideHref('#make-a-link'), '#make-a-link');
  });
});

describe('headingId', () => {
  test('matches the ids GitHub gives headings', () => {
    assert.equal(headingId('A score bug in OBS'), 'a-score-bug-in-obs');
    assert.equal(headingId('Change or retire a link'), 'change-or-retire-a-link');
    assert.equal(headingId("What's on: draws & times"), 'whats-on-draws--times');
  });
});

describe('guideTitle', () => {
  test('is the first top level heading', () => {
    assert.equal(guideTitle('# Set up leagues\n\n## Add a league\n'), 'Set up leagues');
    assert.equal(guideTitle('No heading'), '');
  });
});

describe('renderGuide', () => {
  test('gives headings their GitHub ids, numbering repeats', () => {
    const html = renderGuide('# Title\n\n## Steps\n\n## Steps\n\n## The `?preview` link\n');
    assert.match(html, /<h1 id="title">Title<\/h1>/);
    assert.match(html, /<h2 id="steps">Steps<\/h2>/);
    assert.match(html, /<h2 id="steps-1">Steps<\/h2>/);
    assert.match(html, /<h2 id="the-preview-link">/);
  });

  test('opens links to other guides in the portal and the rest on GitHub in a new tab', () => {
    const html = renderGuide('[Screens](set-up-a-display.md) and [how](../architecture/displays.md).');
    assert.match(html, /<a href="\/help\/set-up-a-display">Screens<\/a>/);
    assert.match(
      html,
      /<a href="https:\/\/github\.com\/CloudgateStudios\/curling_scoreboard\/blob\/main\/docs\/architecture\/displays\.md" target="_blank" rel="noopener noreferrer">how<\/a>/,
    );
  });

  test('every link between the guides reaches a guide and a heading in it', () => {
    const files = readdirSync(GUIDES).filter((f) => f.endsWith('.md'));
    const ids = new Map(files.map((f) => {
      const html = renderGuide(readFileSync(new URL(f, GUIDES), 'utf8'));
      return [guidePath(f), new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))];
    }));
    for (const file of files) {
      const html = renderGuide(readFileSync(new URL(file, GUIDES), 'utf8'));
      for (const [, href] of html.matchAll(/href="(\/help[^"]*)"/g)) {
        const [path, hash] = href.split('#');
        assert.ok(ids.has(path), `${file} links to ${href}, which is not a guide`);
        if (hash) assert.ok(ids.get(path).has(hash), `${file} links to ${href}, which is not a heading there`);
      }
    }
  });
});

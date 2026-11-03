import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STREAM_TEMPLATES, cleanTitle, previewStream, renderStreamTemplate, streamTemplatesFrom,
  streamTemplatesToSave, unknownStreamVariables,
} from './streamMessage.ts';

describe('renderStreamTemplate', () => {
  const variables = { league: 'Monday Night', sheet: 'Sheet 2', matchup: '' };

  test('leaves out a part whose variable is empty', () => {
    assert.equal(renderStreamTemplate('{league} · {sheet}[ · {matchup}]', variables), 'Monday Night · Sheet 2');
    assert.equal(
      renderStreamTemplate('{league}[ · {matchup}]', { ...variables, matchup: 'Smith v Jones' }),
      'Monday Night · Smith v Jones',
    );
  });

  test('keeps brackets around no variable, and doubled brackets as one', () => {
    assert.equal(renderStreamTemplate('[Live] {league} [[{sheet}]]', variables), '[Live] Monday Night [Sheet 2]');
  });

  test('keeps a part whose only variable is misspelled', () => {
    assert.equal(renderStreamTemplate('{league}[ {teem}]', variables), 'Monday Night[ {teem}]');
  });
});

describe('previewStream', () => {
  test('previews each default before and after the teams are known', () => {
    const league = DEFAULT_STREAM_TEMPLATES.league;
    assert.equal(previewStream('league', league, false).title, 'Monday Night Men\'s · Sheet 2 · November 3, 2026');
    assert.equal(
      previewStream('league', league, true).title,
      'Monday Night Men\'s · Sheet 2 · November 3, 2026 · Team Smith v Team Jones',
    );
    assert.equal(
      previewStream('bonspiel', DEFAULT_STREAM_TEMPLATES.bonspiel, false).title,
      'Founders Cup · Draw 5 · A7',
    );
    assert.equal(
      previewStream('none', DEFAULT_STREAM_TEMPLATES.none, false).description,
      'Curling on Sheet 2 at Windy City Curling.\nLive scores: https://example.com/display/club/scores',
    );
  });

  test('uses the default for a blank template', () => {
    assert.equal(previewStream('none', { title: ' ', description: '' }, false).title, 'Windy City Curling · Sheet 2 · November 3, 2026');
  });
});

describe('cleanTitle', () => {
  test('keeps a title to one line of 100 characters, cut at a word', () => {
    const title = cleanTitle(`${'word '.repeat(30)}<b>`);
    assert.ok(title.length <= 100);
    assert.ok(title.endsWith('word…'));
    assert.equal(cleanTitle('A\nB  <C>'), 'A B C');
  });
});

describe('stored templates', () => {
  test('stores only what differs from the defaults', () => {
    const templates = streamTemplatesFrom(undefined);
    assert.equal(streamTemplatesToSave(templates), null);
    templates.none.title = '{club} live';
    assert.deepEqual(streamTemplatesToSave(templates), { none: { title: '{club} live' } });
    assert.equal(streamTemplatesFrom({ none: { title: '{club} live' } }).none.title, '{club} live');
    assert.equal(streamTemplatesFrom({ none: { title: '{club} live' } }).league.title, DEFAULT_STREAM_TEMPLATES.league.title);
  });

  test('finds misspelled variables', () => {
    assert.deepEqual(unknownStreamVariables('{league} {leage} {matchup}'), ['leage']);
  });
});

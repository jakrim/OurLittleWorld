import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTonightCollectionSuggestions,
  selectedTonightCollectionKeys,
  toggleTonightCollectionKey,
} from '../../src/automaticCollectionModel.js';

test('automatic collections contain only canonical factual suggestions', () => {
  const suggestions = buildTonightCollectionSuggestions({
    item: { mediaType: 'image', localDay: '2025-08-14' },
    babyBirthday: '2025-07-23',
  });
  assert.deepEqual(suggestions.map(({ key, sourceCode }) => ({ key, sourceCode })), [
    { key: 'media:photos', sourceCode: 'media_type' },
    { key: 'month:2025-08', sourceCode: 'date_month' },
    { key: 'year:2025', sourceCode: 'date_year' },
    { key: 'life:first-year', sourceCode: 'life_stage' },
  ]);
  assert.equal(JSON.stringify(suggestions).match(/activity|emotion|preference|intent/), null);
});

test('collection choices are bounded to available facts and remain reversible', () => {
  const suggestions = buildTonightCollectionSuggestions({ item: { mediaType: 'video' } });
  assert.deepEqual(selectedTonightCollectionKeys({
    suggestions,
    draftKeys: ['media:videos', 'invented:scene'],
  }), ['media:videos']);
  assert.deepEqual(toggleTonightCollectionKey({ selectedKeys: ['media:videos'], key: 'media:videos' }), []);
});

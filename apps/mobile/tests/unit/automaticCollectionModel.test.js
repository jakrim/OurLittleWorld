import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FACTUAL_COLLECTION_MODEL_VERSION,
  TONIGHT_COLLECTION_SUGGESTION_LIMIT,
  buildTonightCollectionSuggestions,
  selectedTonightCollectionKeys,
  toggleTonightCollectionKey,
} from '../../src/automaticCollectionModel.js';

test('Tonight suggests only deterministic factual collections and selects them by default', () => {
  const suggestions = buildTonightCollectionSuggestions({
    item: { mediaType: 'image', localDay: '2025-08-14' },
    babyBirthday: '2025-07-23',
  });

  assert.equal(FACTUAL_COLLECTION_MODEL_VERSION, 'factual-collections-v1');
  assert.equal(suggestions.length, TONIGHT_COLLECTION_SUGGESTION_LIMIT);
  assert.deepEqual(suggestions.map(({ key, title, sourceCode }) => ({ key, title, sourceCode })), [
    { key: 'media:photos', title: 'Photos', sourceCode: 'media_type' },
    { key: 'month:2025-08', title: 'August 2025', sourceCode: 'date_month' },
    { key: 'year:2025', title: '2025', sourceCode: 'date_year' },
    { key: 'life:first-year', title: 'First year', sourceCode: 'life_stage' },
  ]);
  assert.deepEqual(selectedTonightCollectionKeys({ suggestions }), suggestions.map((entry) => entry.key));
});

test('video and date suggestions remain honest when birthday or capture day is missing', () => {
  assert.deepEqual(buildTonightCollectionSuggestions({ item: { mediaType: 'video' } }), [{
    key: 'media:videos',
    title: 'Videos',
    sourceCode: 'media_type',
    sourceRef: 'video',
    selectedByDefault: true,
  }]);
  const afterFirstYear = buildTonightCollectionSuggestions({
    item: { mediaType: 'video', localDay: '2026-07-23' },
    babyBirthday: '2025-07-23',
  });
  assert.ok(!afterFirstYear.some((entry) => entry.key === 'life:first-year'));
});

test('draft selection is restricted to available keys and corrections are reversible', () => {
  const suggestions = buildTonightCollectionSuggestions({
    item: { mediaType: 'image', localDay: '2025-08-14' },
  });
  assert.deepEqual(
    selectedTonightCollectionKeys({ suggestions, draftKeys: ['media:photos', 'invented:label', 'media:photos'] }),
    ['media:photos'],
  );
  const removed = toggleTonightCollectionKey({ selectedKeys: ['media:photos', 'month:2025-08'], key: 'media:photos' });
  assert.deepEqual(removed, ['month:2025-08']);
  assert.deepEqual(toggleTonightCollectionKey({ selectedKeys: removed, key: 'media:photos' }), ['month:2025-08', 'media:photos']);
});

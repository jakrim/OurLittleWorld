import assert from 'node:assert/strict';
import { test } from 'node:test';

import { areLookalikes, buildBestPhotoCandidateSet } from '../../src/bestPhotoCandidateModel.js';

test('a 14-shot lookalike burst surfaces only its best-quality frame', () => {
  const burst = Array.from({ length: 14 }, (_, index) => photo(index, {
    captureQuality: index === 6 ? 0.97 : 0.4 + index * 0.01,
    featureVector: [1, 0],
    visualFingerprint: [1, index * 0.001],
    creationTime: START + index * 800,
  }));

  const result = buildBestPhotoCandidateSet(burst);

  assert.deepEqual(result.photos.map((item) => item.assetId), ['photo-6']);
  assert.equal(result.suppressedCount, 13);
});

test('distinct photos from the same session survive lookalike suppression', () => {
  const result = buildBestPhotoCandidateSet([
    photo(1, { visualFingerprint: [1, 0], captureQuality: 0.8 }),
    photo(2, { visualFingerprint: [0, 1], captureQuality: 0.7, creationTime: START + 1000 }),
  ]);

  assert.deepEqual(result.photos.map((item) => item.assetId), ['photo-1', 'photo-2']);
});

test('old native clients use only a tight burst gap instead of grouping thirty minutes', () => {
  const first = photo(1, { visualFingerprint: null, creationTime: START });
  const burstSibling = photo(2, { visualFingerprint: null, creationTime: START + 1000 });
  const later = photo(3, { visualFingerprint: null, creationTime: START + 5 * 60 * 1000 });

  assert.equal(areLookalikes(first, burstSibling), true);
  assert.equal(areLookalikes(first, later), false);
  assert.deepEqual(
    buildBestPhotoCandidateSet([first, burstSibling, later]).photos.map((item) => item.assetId),
    ['photo-3', 'photo-2'],
  );
});

test('low-confidence identity matches and videos are not suggested as baby photos', () => {
  const result = buildBestPhotoCandidateSet([
    photo(1, { score: 0.3 }),
    photo(2, { mediaType: 'video' }),
    photo(3, { score: 0.91 }),
  ]);

  assert.deepEqual(result.photos.map((item) => item.assetId), ['photo-3']);
});

const START = Date.UTC(2026, 6, 15, 12);

function photo(index, patch = {}) {
  return {
    assetId: `photo-${index}`,
    mediaType: 'image',
    score: 0.9,
    captureQuality: 0.6,
    creationTime: START + index * 1000,
    featureVector: [1, 0],
    visualFingerprint: [1, 0],
    uri: `file:///photo-${index}.jpg`,
    ...patch,
  };
}

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeReferenceAutoSeedAttempt,
  referenceAutoSeedAttemptKey,
} from '../../src/referenceAutoSeedAttemptStore.js';

test('auto-seed attempt keys are family-and-user scoped', () => {
  assert.equal(
    referenceAutoSeedAttemptKey({ familyId: 'family-a', userId: 'parent-a' }),
    'olw:reference-auto-seed-attempt:v1:family-a:parent-a',
  );
  assert.equal(referenceAutoSeedAttemptKey({ familyId: 'family-a' }), null);
});

test('local fallback attempts stay bounded and preserve explicit selection', () => {
  const suggestions = Array.from({ length: 5 }, (_, index) => ({
    assetId: `asset-${index}`,
    localUri: `ph://asset-${index}`,
    embedding: [index, 1],
    location: { latitude: 1, longitude: 2 },
    exif: { private: true },
  }));
  const attempt = normalizeReferenceAutoSeedAttempt({
    version: 1,
    birthdayISO: '2026-07-01',
    completedAt: 123,
    status: 'suggestions',
    suggestions,
    selectedAssetId: 'asset-1',
  });
  assert.equal(attempt.status, 'suggestions');
  assert.equal(attempt.suggestions.length, 3);
  assert.equal(attempt.selectedAssetId, 'asset-1');
  assert.equal('location' in attempt.suggestions[0], false);
  assert.equal('exif' in attempt.suggestions[0], false);
});

test('invalid or empty suggestions restore as a manual state', () => {
  const attempt = normalizeReferenceAutoSeedAttempt({
    version: 1,
    birthdayISO: '2026-07-01',
    completedAt: 123,
    status: 'suggestions',
    suggestions: [{ assetId: 'missing-private-evidence' }],
  });
  assert.equal(attempt.status, 'manual');
  assert.deepEqual(attempt.suggestions, []);
});

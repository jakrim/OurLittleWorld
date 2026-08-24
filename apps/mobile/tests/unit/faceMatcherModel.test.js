import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRST_VALUE_NATIVE_MATCH_BATCH_TIMEOUT_MS,
  MAX_NATIVE_MATCH_BATCH_TIMEOUT_MS,
  MIN_NATIVE_MATCH_BATCH_TIMEOUT_MS,
  mergeMultiReferenceMatches,
  nativeReferenceInputs,
  resolveNativeMatchBatchTimeout,
  selectMatchReferences,
} from '../../src/faceMatcherModel.js';

const references = [
  {
    id: 'confirmed',
    embedding: [1, 0],
    parentConfirmed: true,
    source: 'seed',
    capturedAt: 1,
  },
  {
    id: 'age-diverse',
    embedding: [1, 0],
    source: 'auto-seed',
    capturedAt: 2,
  },
];

test('one-pass native results preserve conservative multi-reference consensus', () => {
  const candidates = [{ assetId: 'candidate-1', creationTime: Date.UTC(2026, 0, 1) }];
  const results = references.map((reference) => ({
    assetId: 'candidate-1',
    referenceId: reference.id,
    score: 0.91,
    faceCount: 1,
    captureQuality: 0.8,
    faceSizeRatio: 0.2,
    sharpness: 0.7,
    yaw: 0,
    roll: 0,
    brightness: 0.6,
    featureVector: [1, 0],
    visualFingerprint: [1, -1],
  }));
  const merged = mergeMultiReferenceMatches({
    profile: { references, representativeReferenceId: 'confirmed' },
    birthdayISO: '2025-07-23',
    candidates,
    references,
    results,
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].identityConsensusPassed, true);
  assert.equal(merged[0].identitySupportCount, 2);
  assert.equal(merged[0].assetId, 'candidate-1');
});

test('missing or timed-out native rows fail closed instead of surfacing a candidate', () => {
  const candidates = [
    { assetId: 'processed', creationTime: Date.UTC(2026, 0, 1) },
    { assetId: 'timed-out', creationTime: Date.UTC(2026, 0, 2) },
  ];
  const results = references.map((reference) => ({
    assetId: 'processed',
    referenceId: reference.id,
    score: 0.9,
    faceCount: 1,
  }));
  const merged = mergeMultiReferenceMatches({
    profile: { references, representativeReferenceId: 'confirmed' },
    candidates,
    references,
    results,
  });

  const missing = merged.find((item) => item.assetId === 'timed-out');
  assert.equal(missing.score, 0);
  assert.equal(missing.identityConsensusPassed, false);
  assert.equal(missing.faceCount, 0);
});

test('native reference inputs carry opaque reference ids but no candidate identity', () => {
  assert.deepEqual(nativeReferenceInputs(references), [
    { referenceId: 'confirmed', embedding: [1, 0] },
    { referenceId: 'age-diverse', embedding: [1, 0] },
  ]);
});

test('reference selection gives a fallback reference a stable local-only id', () => {
  const selected = selectMatchReferences({
    profile: { references: [] },
    candidates: [{ assetId: 'candidate' }],
    fallbackReference: { embedding: [1, 0] },
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'fallback-1');
});

test('native timeout is bounded and First Look stays below the whole ritual budget', () => {
  assert.equal(resolveNativeMatchBatchTimeout(1), MIN_NATIVE_MATCH_BATCH_TIMEOUT_MS);
  assert.equal(resolveNativeMatchBatchTimeout(999_999), MAX_NATIVE_MATCH_BATCH_TIMEOUT_MS);
  assert.equal(
    resolveNativeMatchBatchTimeout(FIRST_VALUE_NATIVE_MATCH_BATCH_TIMEOUT_MS),
    8_000,
  );
});

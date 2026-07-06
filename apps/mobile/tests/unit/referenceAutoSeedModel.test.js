import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTO_SEED_CLUSTER_SIMILARITY,
  AUTO_SEED_MIN_BUCKET_COVERAGE,
  AUTO_SEED_MONTH_SAMPLE_LIMIT,
  buildAutoSeedWindows,
  clusterAutoSeedFaces,
  cosineSimilarity,
  selectAutoSeedCluster,
  selectAutoSeedReferences,
} from '../../src/referenceAutoSeedModel.js';

test('auto-seed tunables are named constants', () => {
  assert.equal(AUTO_SEED_MONTH_SAMPLE_LIMIT, 30);
  assert.equal(AUTO_SEED_CLUSTER_SIMILARITY, 0.55);
  assert.equal(AUTO_SEED_MIN_BUCKET_COVERAGE, 0.6);
});

test('sampling windows include the birth window plus calendar months of life', () => {
  const windows = buildAutoSeedWindows('2026-05-20', new Date(2026, 7, 3, 12));
  assert.deepEqual(windows.map((window) => window.key), [
    'birth-window',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
  ]);
  assert.equal(windows[0].kind, 'birth');
  assert.equal(windows[1].kind, 'month');
  assert.ok(windows[0].endMs > windows[0].startMs);
});

test('greedy clusters use cosine similarity', () => {
  assert.ok(cosineSimilarity([1, 0], [0.98, 0.08]) >= AUTO_SEED_CLUSTER_SIMILARITY);
  assert.ok(cosineSimilarity([1, 0], [0, 1]) < AUTO_SEED_CLUSTER_SIMILARITY);
  const clusters = clusterAutoSeedFaces([
    face('a1', '2026-05', [1, 0]),
    face('a2', '2026-06', [0.98, 0.08]),
    face('b1', '2026-06', [0, 1]),
  ]);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0].monthBucketKeys, ['2026-05', '2026-06']);
});

test('winning cluster must cover at least 60 percent of non-empty month buckets', () => {
  const result = selectAutoSeedCluster({
    faces: [
      face('baby-1', '2026-05', [1, 0]),
      face('baby-2', '2026-06', [0.98, 0.08]),
      face('baby-3', '2026-07', [0.99, 0.02]),
      face('adult-1', '2026-05', [0, 1]),
    ],
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.nonEmptyMonthBucketCount, 3);
  assert.equal(result.coverage, 1);
});

test('confidence gate falls back for too few buckets or low coverage', () => {
  assert.equal(
    selectAutoSeedCluster({
      faces: [
        face('baby-1', '2026-05', [1, 0]),
        face('baby-2', '2026-06', [0.98, 0.08]),
      ],
    }).reason,
    'not-enough-month-buckets',
  );

  const lowCoverage = selectAutoSeedCluster({
    faces: [
      face('a1', '2026-05', [1, 0]),
      face('a2', '2026-06', [0.98, 0.08]),
      face('b1', '2026-07', [0, 1]),
      face('b2', '2026-08', [0.08, 0.98]),
      face('c1', '2026-09', [-1, 0]),
    ],
  });
  assert.equal(lowCoverage.status, 'fallback');
  assert.equal(lowCoverage.reason, 'low-cluster-coverage');
});

test('seed references choose one newest asset per age bucket and cap the spread', () => {
  const members = [
    face('old-may', '2026-05', [1, 0], 100),
    face('new-may', '2026-05', [1, 0], 200),
    face('june', '2026-06', [1, 0], 300),
  ];
  const seeds = selectAutoSeedReferences(members, 2);
  assert.deepEqual(seeds.map((seed) => seed.assetId), ['new-may', 'june']);
});

function face(assetId, bucketKey, embedding, creationTime = Date.now()) {
  return {
    assetId,
    bucketKey,
    bucketKind: 'month',
    embedding,
    creationTime,
  };
}

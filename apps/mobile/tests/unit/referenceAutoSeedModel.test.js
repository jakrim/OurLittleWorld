import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTO_SEED_ANALYSIS_CONCURRENCY,
  AUTO_SEED_CLUSTER_SIMILARITY,
  AUTO_SEED_MAX_CANDIDATES,
  AUTO_SEED_MIN_BUCKET_COVERAGE,
  AUTO_SEED_MONTH_SAMPLE_LIMIT,
  autoSeedProgressCopy,
  autoSeedProgressPercent,
  buildAutoSeedSamplingPlan,
  buildAutoSeedWindows,
  clusterAutoSeedFaces,
  compareAutoSeedCandidates,
  cosineSimilarity,
  mergeAutoSeedFaceAnalysis,
  scoreAutoSeedCandidates,
  selectAutoSeedCluster,
  selectAutoSeedReferences,
  selectAutoSeedRepresentative,
} from '../../src/referenceAutoSeedModel.js';

test('auto-seed work stays named and bounded for power-user libraries', () => {
  assert.equal(AUTO_SEED_MONTH_SAMPLE_LIMIT, 32);
  assert.equal(AUTO_SEED_MAX_CANDIDATES, 456);
  assert.equal(AUTO_SEED_CLUSTER_SIMILARITY, 0.55);
  assert.equal(AUTO_SEED_MIN_BUCKET_COVERAGE, 0.6);
  assert.equal(AUTO_SEED_ANALYSIS_CONCURRENCY, 3);

  const plan = buildAutoSeedSamplingPlan('2020-01-01', new Date(2026, 6, 11, 12));
  assert.ok(plan.reduce((sum, query) => sum + query.pageSize, 0) <= AUTO_SEED_MAX_CANDIDATES);
  assert.ok(plan.some((query) => query.sortAscending));
  assert.ok(plan.some((query) => !query.sortAscending));
  assert.ok(new Set(plan.filter((query) => query.bucketKind === 'month').map((query) => query.bucketKey)).size <= 12);
});

test('auto-seed progress describes bounded time coverage', () => {
  assert.equal(autoSeedProgressPercent({ phase: 'sampling', completed: 2, total: 4 }), 8);
  assert.equal(autoSeedProgressPercent({ phase: 'analyzing', completed: 50, total: 100 }), 55);
  assert.equal(autoSeedProgressPercent({ phase: 'saving' }), 98);
  assert.equal(autoSeedProgressPercent({ phase: 'complete' }), 100);
  assert.deepEqual(autoSeedProgressCopy({ phase: 'sampling', completed: 2, total: 4 }), {
    title: 'Checking time periods 2 of 4',
    detail: 'We check a bounded spread across time, not every photo in your library.',
  });
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
});

test('native quality measurements survive into JavaScript candidate scoring', () => {
  const analyzed = mergeAutoSeedFaceAnalysis(
    { assetId: 'asset', localUri: 'ph://asset' },
    {
      embedding: [1, 0],
      faceCount: 1,
      captureQuality: 0.91,
      sharpness: 0.82,
      faceSizeRatio: 0.2,
      primaryBox: { x: 0.2, y: 0.2, w: 0.4, h: 0.5 },
      yaw: 0.1,
      roll: 0.05,
      brightness: 0.6,
    },
  );
  assert.deepEqual(
    {
      captureQuality: analyzed.captureQuality,
      sharpness: analyzed.sharpness,
      faceSizeRatio: analyzed.faceSizeRatio,
      yaw: analyzed.yaw,
      roll: analyzed.roll,
      brightness: analyzed.brightness,
    },
    {
      captureQuality: 0.91,
      sharpness: 0.82,
      faceSizeRatio: 0.2,
      yaw: 0.1,
      roll: 0.05,
      brightness: 0.6,
    },
  );
});

test('cluster membership uses identity only, so a sharp non-child cannot quality-jump clusters', () => {
  const baby = [
    face('baby-soft-1', '2026-05', [1, 0], 100, { captureQuality: 0.2 }),
    face('baby-soft-2', '2026-06', [0.98, 0.05], 200, { captureQuality: 0.25 }),
    face('baby-soft-3', '2026-07', [0.99, 0.02], 300, { captureQuality: 0.3 }),
  ];
  const adult = face('adult-sharp', '2026-07', [0, 1], 400, {
    captureQuality: 1,
    sharpness: 1,
    faceSizeRatio: 0.2,
  });
  const result = selectAutoSeedCluster({ faces: [...baby, adult] });
  assert.equal(result.status, 'matched');
  assert.deepEqual(result.cluster.members.map((member) => member.assetId), baby.map((member) => member.assetId));
});

test('greedy clusters use cosine identity similarity', () => {
  assert.ok(cosineSimilarity([1, 0], [0.98, 0.08]) >= AUTO_SEED_CLUSTER_SIMILARITY);
  assert.ok(cosineSimilarity([1, 0], [0, 1]) < AUTO_SEED_CLUSTER_SIMILARITY);
  const clusters = clusterAutoSeedFaces([
    face('a1', '2026-05', [1, 0]),
    face('a2', '2026-06', [0.98, 0.08]),
    face('b1', '2026-06', [0, 1]),
  ]);
  assert.equal(clusters.length, 2);
});

test('confidence gate falls back for too few buckets or low coverage', () => {
  assert.equal(selectAutoSeedCluster({
    faces: [face('a', '2026-05', [1, 0]), face('b', '2026-06', [1, 0])],
  }).reason, 'not-enough-month-buckets');

  const lowCoverage = selectAutoSeedCluster({
    faces: [
      face('a1', '2026-05', [1, 0]),
      face('a2', '2026-06', [0.98, 0.08]),
      face('b1', '2026-07', [0, 1]),
      face('b2', '2026-08', [0.08, 0.98]),
      face('c1', '2026-09', [-1, 0]),
    ],
  });
  assert.equal(lowCoverage.reason, 'low-cluster-coverage');
});

test('an older sharp portrait beats a newer blurry photo', () => {
  const members = [
    face('older-sharp', '2026-07', [1, 0], 100, clearMetrics()),
    face('newer-blurry', '2026-07', [0.99, 0.01], 200, {
      ...clearMetrics(), captureQuality: 0.18, sharpness: 0.08,
    }),
  ];
  assert.equal(selectAutoSeedRepresentative(members).assetId, 'older-sharp');
});

test('a large well-lit complete face beats a distant face', () => {
  const members = [
    face('large-face', '2026-07', [1, 0], 100, clearMetrics()),
    face('distant-face', '2026-07', [0.99, 0.01], 101, {
      ...clearMetrics(), faceSizeRatio: 0.008, brightness: 0.12,
    }),
  ];
  assert.equal(selectAutoSeedRepresentative(members).assetId, 'large-face');
});

test('a single clear face beats a similarly scored crowded photo', () => {
  const members = [
    face('single', '2026-07', [1, 0], 100, { ...clearMetrics(), faceCount: 1 }),
    face('crowded', '2026-07', [0.999, 0.001], 101, { ...clearMetrics(), faceCount: 4 }),
  ];
  assert.equal(selectAutoSeedRepresentative(members).assetId, 'single');
});

test('recency breaks a close measured tie but not a substantial quality difference', () => {
  const close = scoreAutoSeedCandidates([
    face('old-close', '2026-07', [1, 0], 100, clearMetrics()),
    face('new-close', '2026-07', [1, 0], 200, clearMetrics()),
  ]).sort(compareAutoSeedCandidates);
  assert.equal(close[0].assetId, 'new-close');

  const substantial = selectAutoSeedRepresentative([
    face('old-clear', '2026-07', [1, 0], 100, clearMetrics()),
    face('new-poor', '2026-07', [1, 0], 200, {
      ...clearMetrics(), captureQuality: 0.1, sharpness: 0.05,
    }),
  ]);
  assert.equal(substantial.assetId, 'old-clear');
});

test('each age bucket selects its strongest reference and the complete set stays age-diverse', () => {
  const members = [];
  for (let month = 1; month <= 18; month += 1) {
    const bucket = `2025-${String(month).padStart(2, '0')}`;
    members.push(face(`weak-${month}`, bucket, [1, 0], month * 100, {
      ...clearMetrics(), captureQuality: 0.15,
    }));
    members.push(face(`strong-${month}`, bucket, [1, 0], month * 100 + 1, clearMetrics()));
  }
  const selected = selectAutoSeedReferences(members);
  assert.equal(selected.length, 12);
  assert.ok(selected.every((item) => item.assetId.startsWith('strong-')));
  assert.equal(selected[0].bucketKey, '2025-01');
  assert.equal(selected.at(-1).bucketKey, '2025-18');
});

test('missing visual quality falls back to identity and a stable key, not newest', () => {
  const selected = selectAutoSeedRepresentative([
    face('a-stable', '2026-07', [1, 0], 100, {}),
    face('z-newest', '2026-07', [1, 0], 999, {}),
  ]);
  assert.equal(selected.assetId, 'a-stable');
});

function face(assetId, bucketKey, embedding, creationTime = Date.now(), metrics = {}) {
  return {
    assetId,
    bucketKey,
    bucketKind: 'month',
    embedding,
    creationTime,
    localUri: `ph://${assetId}`,
    faceCount: metrics.faceCount ?? 1,
    ...metrics,
  };
}

function clearMetrics() {
  return {
    captureQuality: 0.9,
    sharpness: 0.85,
    faceSizeRatio: 0.16,
    primaryBox: { x: 0.25, y: 0.2, w: 0.4, h: 0.5 },
    yaw: 0.02,
    roll: 0.01,
    brightness: 0.55,
  };
}

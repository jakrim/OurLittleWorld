import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectAutoSeedCandidates } from '../../src/referenceAutoSeedCandidates.js';

test('stratified collection discovers candidates outside the former newest-30 slice', async () => {
  const calls = [];
  const result = await collectAutoSeedCandidates({
    plan: [
      { bucketKey: '2026-07', bucketKind: 'month', startMs: 0, endMs: 10, pageSize: 4, sortAscending: false },
      { bucketKey: '2026-07', bucketKind: 'month', startMs: 0, endMs: 10, pageSize: 4, sortAscending: true },
    ],
    fetchPhotosPageFn: async (query) => {
      calls.push(query);
      return {
        assets: query.sortAscending
          ? [{ id: 'strong-outside-newest-30', creationTime: 1 }]
          : [{ id: 'latest', creationTime: 10 }],
      };
    },
  });

  assert.deepEqual(result.candidates.map((item) => item.assetId), [
    'latest',
    'strong-outside-newest-30',
  ]);
  assert.deepEqual(calls.map((call) => call.sortAscending), [false, true]);
});

test('candidate collection enforces its global bound and deduplicates overlapping slices', async () => {
  const plan = Array.from({ length: 200 }, (_, index) => ({
    bucketKey: `month-${index}`,
    bucketKind: 'month',
    startMs: index,
    endMs: index + 1,
    pageSize: 4,
    sortAscending: false,
  }));
  const result = await collectAutoSeedCandidates({
    plan,
    maxCandidates: 25,
    fetchPhotosPageFn: async (query) => ({
      assets: Array.from({ length: 4 }, (_, item) => ({
        id: `${query.createdAfterMs}-${item}`,
      })),
    }),
  });

  assert.equal(result.candidates.length, 25);
  assert.ok(result.queryCount < plan.length);
});

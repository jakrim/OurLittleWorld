import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseSharedTonightLookback,
  SHARED_EVENT_COMPANION_LIMIT,
  SHARED_LOOKBACK_QUERY_LIMIT,
} from '../../src/sharedLookbackModel.js';
import { savedFingerprintTelemetry } from '../../src/savedMediaFingerprintModel.js';
import {
  sharedAnnotationExportRanges,
  SHARED_ANNOTATION_EXPORT_LIMIT,
  SHARED_ANNOTATION_EXPORT_PAGE_SIZE,
} from '../../src/sharedEnrichmentModel.js';

test('chooses a kept lookback deterministically without depending on query order', () => {
  const rows = [
    { id: 'c', captured_at: '2025-01-03' },
    { id: 'a', captured_at: '2025-01-01' },
    { id: 'b', captured_at: '2025-01-02' },
  ];
  const options = { localDate: new Date('2026-07-20T12:00:00Z') };
  assert.deepEqual(chooseSharedTonightLookback(rows, options), chooseSharedTonightLookback(rows.slice().reverse(), options));
});

test('does not create a lookback without an already-kept moment', () => {
  assert.equal(chooseSharedTonightLookback([], { localDate: new Date() }), null);
  assert.ok(SHARED_LOOKBACK_QUERY_LIMIT <= 200);
  assert.ok(SHARED_EVENT_COMPANION_LIMIT <= 12);
});

test('fingerprint telemetry exposes only a result boolean', () => {
  assert.deepEqual(savedFingerprintTelemetry('group-id'), { grouped_after_keep: true });
});

test('shared annotation export stays bounded and paginates a 5,000-item archive', () => {
  const ranges = sharedAnnotationExportRanges({ limit: 5000 });
  assert.equal(ranges.length, 10);
  assert.deepEqual(ranges[0], { from: 0, to: 499, take: 500 });
  assert.deepEqual(ranges.at(-1), { from: 4500, to: 4999, take: 500 });
  assert.equal(SHARED_ANNOTATION_EXPORT_LIMIT, 5000);
  assert.equal(SHARED_ANNOTATION_EXPORT_PAGE_SIZE, 500);

  assert.deepEqual(sharedAnnotationExportRanges({ limit: 501 }).at(-1), {
    from: 500,
    to: 500,
    take: 1,
  });
  assert.equal(sharedAnnotationExportRanges({ limit: 50000 }).at(-1).to, 4999);
  assert.deepEqual(sharedAnnotationExportRanges({ limit: 0 }), []);
});

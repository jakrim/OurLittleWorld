import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FOREGROUND_AUTO_SCAN_STALE_MS,
  hasReferenceProfile,
  shouldStartForegroundAutoIngest,
} from '../../src/foregroundAutoIngestModel.js';

test('foreground auto-ingest requires an embedding reference', () => {
  assert.equal(hasReferenceProfile(null), false);
  assert.equal(hasReferenceProfile({ references: [{ uri: 'file://face.jpg' }] }), false);
  assert.equal(hasReferenceProfile({ references: [{ embedding: [0.1, 0.2] }] }), true);
});

test('pending media-library changes start foreground auto-ingest immediately', () => {
  const recent = { lastScannedAt: new Date(100000).toISOString() };
  assert.equal(
    shouldStartForegroundAutoIngest({
      checkpoint: recent,
      pendingChange: { insertedCount: 1 },
      nowMs: 100001,
    }),
    true,
  );
});

test('stale or missing checkpoints start foreground auto-ingest', () => {
  const nowMs = Date.UTC(2026, 6, 5, 12);
  assert.equal(shouldStartForegroundAutoIngest({ checkpoint: null, nowMs }), true);
  assert.equal(
    shouldStartForegroundAutoIngest({
      checkpoint: { lastScannedAt: new Date(nowMs - FOREGROUND_AUTO_SCAN_STALE_MS - 1).toISOString() },
      nowMs,
    }),
    true,
  );
  assert.equal(
    shouldStartForegroundAutoIngest({
      checkpoint: { lastScannedAt: new Date(nowMs - FOREGROUND_AUTO_SCAN_STALE_MS + 1).toISOString() },
      nowMs,
    }),
    false,
  );
});

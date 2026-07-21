import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_STORED_MEDIA_CHANGE_ASSET_IDS,
  mergeMediaLibraryChanges,
  normalizeMediaLibraryChangeEvent,
} from '../../src/mediaLibraryChangeModel.js';

test('inserted, updated, and deleted assets remain bounded and targetable', () => {
  const event = normalizeMediaLibraryChangeEvent({
    hasIncrementalChanges: true,
    insertedAssets: [{ id: 'ph://new-a' }],
    updatedAssets: [{ id: 'updated-a' }, { id: 'updated-a' }],
    deletedAssets: [{ id: 'deleted-a' }],
  }, new Date('2026-07-20T12:00:00Z'));

  assert.deepEqual(event.insertedAssetIds, ['new-a']);
  assert.deepEqual(event.updatedAssetIds, ['updated-a']);
  assert.deepEqual(event.deletedAssetIds, ['deleted-a']);
  assert.equal(event.requiresFullLibraryScan, false);
});

test('overflow requests a full scan without retaining an unbounded identifier list', () => {
  const insertedAssets = Array.from({ length: MAX_STORED_MEDIA_CHANGE_ASSET_IDS + 20 }, (_, index) => ({ id: `asset-${index}` }));
  const event = normalizeMediaLibraryChangeEvent({ hasIncrementalChanges: true, insertedAssets });
  assert.equal(event.insertedAssetIds.length, MAX_STORED_MEDIA_CHANGE_ASSET_IDS);
  assert.equal(event.insertedAssetIdsTruncated, true);
  assert.equal(event.requiresFullLibraryScan, true);
});

test('overlapping change events merge idempotent identifiers and additive counts', () => {
  const first = normalizeMediaLibraryChangeEvent({
    hasIncrementalChanges: true,
    insertedAssets: [{ id: 'one' }],
    updatedAssets: [{ id: 'shared' }],
  }, new Date('2026-07-20T12:00:00Z'));
  const second = normalizeMediaLibraryChangeEvent({
    hasIncrementalChanges: true,
    updatedAssets: [{ id: 'shared' }, { id: 'two' }],
    deletedAssets: [{ id: 'gone' }],
  }, new Date('2026-07-20T13:00:00Z'));
  const merged = mergeMediaLibraryChanges(first, second);

  assert.deepEqual(merged.updatedAssetIds, ['shared', 'two']);
  assert.equal(merged.updatedCount, 3);
  assert.equal(merged.eventCount, 2);
  assert.equal(merged.requiresFullLibraryScan, false);
});

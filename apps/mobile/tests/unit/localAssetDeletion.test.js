import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_ASSET_DELETED_STATUS,
  isLocalAssetDeleted,
  markLocalAssetDeletedMetadata,
} from '../../src/localAssetDeletion.js';

test('deleted local asset metadata preserves cloud paths and records device deletion', () => {
  const metadata = markLocalAssetDeletedMetadata(
    { fullPath: 'family/full/photo.jpg', posterOnly: true },
    '2026-07-06T12:00:00.000Z',
  );

  assert.equal(metadata.fullPath, 'family/full/photo.jpg');
  assert.equal(metadata.posterOnly, true);
  assert.equal(metadata.localAssetStatus, LOCAL_ASSET_DELETED_STATUS);
  assert.equal(metadata.localAssetDeletedAt, '2026-07-06T12:00:00.000Z');
  assert.equal(isLocalAssetDeleted(metadata), true);
  assert.equal(isLocalAssetDeleted({ metadata }), true);
});

test('deleted local asset metadata keeps the first deletion timestamp', () => {
  const metadata = markLocalAssetDeletedMetadata(
    { localAssetDeletedAt: '2026-07-01T12:00:00.000Z' },
    '2026-07-06T12:00:00.000Z',
  );

  assert.equal(metadata.localAssetDeletedAt, '2026-07-01T12:00:00.000Z');
});

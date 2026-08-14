import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assetConstructorIdentifier,
  normalizeMediaLibraryAssetId,
  resolveLocalKeepMediaType,
  uriForNativeVision,
} from '../../src/photoAssetIdentifierModel.js';

test('bare iOS local identifiers receive the native ph scheme', () => {
  assert.equal(uriForNativeVision('asset-identifier/L0/001'), 'ph://asset-identifier/L0/001');
});

test('native URI shapes remain stable and normalize back to the local identifier', () => {
  assert.equal(uriForNativeVision('ph://asset-identifier/L0/001'), 'ph://asset-identifier/L0/001');
  assert.equal(normalizeMediaLibraryAssetId('ph://asset-identifier/L0/001'), 'asset-identifier/L0/001');
  assert.equal(uriForNativeVision('content://media/external/images/42'), 'content://media/external/images/42');
});

test('the Asset constructor receives the platform-specific identifier shape', () => {
  assert.equal(
    assetConstructorIdentifier('asset-identifier/L0/001', { platform: 'ios' }),
    'ph://asset-identifier/L0/001',
  );
  assert.equal(
    assetConstructorIdentifier('42', { platform: 'android', mediaType: 'image' }),
    'content://media/external/images/media/42',
  );
  assert.equal(
    assetConstructorIdentifier('43', { platform: 'android', mediaType: 'video' }),
    'content://media/external/video/media/43',
  );
});

test('already-schemed identifiers remain stable on every platform', () => {
  for (const identifier of [
    'ph://asset-identifier/L0/001',
    'content://media/external/images/media/42',
    'file:///tmp/photo.jpg',
    'assets-library://asset/asset.JPG?id=1&ext=JPG',
  ]) {
    assert.equal(assetConstructorIdentifier(identifier, { platform: 'ios' }), identifier);
    assert.equal(assetConstructorIdentifier(identifier, { platform: 'android', mediaType: 'image' }), identifier);
  }
});

test('Android bare identifiers fail closed without a trustworthy type', () => {
  assert.equal(assetConstructorIdentifier('42', { platform: 'android' }), '42');
  assert.equal(assetConstructorIdentifier('42', { platform: 'android', mediaType: 'audio' }), '42');
  assert.equal(assetConstructorIdentifier('not-a-media-store-row', {
    platform: 'android',
    mediaType: 'image',
  }), 'not-a-media-store-row');
});

test('an interrupted Android upload reuses its durable type to resolve the same local asset', () => {
  const sourceJob = {
    local_asset_id: '43',
    media_type: 'video',
  };
  const resolvedMediaType = resolveLocalKeepMediaType(null, sourceJob);

  assert.equal(resolvedMediaType, 'video');
  assert.equal(
    assetConstructorIdentifier(sourceJob.local_asset_id, {
      platform: 'android',
      mediaType: resolvedMediaType,
    }),
    'content://media/external/video/media/43',
  );
  assert.equal(sourceJob.local_asset_id, '43');
});

test('current interaction type wins while unsupported evidence stays unknown', () => {
  assert.equal(resolveLocalKeepMediaType(
    { mediaType: 'photo' },
    { media_type: 'video' },
  ), 'image');
  assert.equal(resolveLocalKeepMediaType(null, { media_type: 'audio' }), null);
});

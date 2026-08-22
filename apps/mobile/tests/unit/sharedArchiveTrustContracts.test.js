import assert from 'node:assert/strict';
import test from 'node:test';

import { autoSaveCorrectionTarget } from '../../src/autoSaveCorrectionModel.js';
import { mediaUploadMetadata } from '../../src/mediaUploadMetadataModel.js';

test('shared upload metadata uses an allowlist and excludes identity evidence', () => {
  const metadata = mediaUploadMetadata({
    source: 'scan-auto-save',
    posterPath: 'family/poster.jpg',
    caption: 'Parent words',
    pickerAssetId: 'private-picker',
    localAssetId: 'private-local',
    recognitionScore: 0.98,
    faceCount: 1,
    visualFingerprint: [1, -1],
  }, { captureQuality: 0.88, videoPresenceRatio: 1 });
  assert.deepEqual(metadata, {
    source: 'scan-auto-save',
    posterPath: 'family/poster.jpg',
    captureQuality: 0.88,
  });
});

test('final publish metadata filters poster merge through the allowlist', () => {
  const base = mediaUploadMetadata({
    source: 'scan-auto-save',
    fullPath: 'family/full.mp4',
  });
  const merged = mediaUploadMetadata({
    ...base,
    posterStatus: 'failed',
    posterErrorCode: 'timeout',
    posterError: 'ENOENT /var/private/local/path.jpg',
    recognitionFrameTimeMs: 1234,
    localAssetId: 'private-local',
  });
  assert.deepEqual(merged, {
    source: 'scan-auto-save',
    fullPath: 'family/full.mp4',
    posterStatus: 'failed',
    posterErrorCode: 'timeout',
  });
});

test('device correction normalizes identity only at the local boundary', () => {
  const target = autoSaveCorrectionTarget({
    asset_id: 'opaque-shared-key',
    asset_owner_user_id: 'parent-a',
    moment_id: 'moment-a',
    metadata: { source: 'scan-auto-save', localAssetId: 'private-local-id' },
  });
  assert.equal(target.isAutoSaved, true);
  assert.equal(target.assetId, 'opaque-shared-key');
  assert.equal(target.match.assetId, 'opaque-shared-key');
  const sharedMetadata = mediaUploadMetadata(target.match);
  assert.equal(Object.hasOwn(sharedMetadata, 'assetId'), false);
  assert.deepEqual(sharedMetadata, {});
});

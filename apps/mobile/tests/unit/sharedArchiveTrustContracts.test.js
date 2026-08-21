import assert from 'node:assert/strict';
import test from 'node:test';

import { autoSaveCorrectionTarget } from '../../src/autoSaveCorrectionModel.js';
import { mediaUploadMetadata } from '../../src/mediaUploadMetadataModel.js';

test('shared upload metadata is restricted to the explicit allowlist', () => {
  const metadata = mediaUploadMetadata({
    source: 'scan-auto-save',
    posterPath: 'family/moments/poster.jpg',
    posterErrorCode: 'timeout',
    caption: 'Parent words',
    pickerAssetId: 'private-picker',
    localAssetId: 'private-local',
    recognitionScore: 0.98,
    score: 0.98,
    recognitionFrameTimeMs: 1200,
    faceCount: 1,
    visualFingerprint: [1, -1],
  }, { captureQuality: 0.88, videoPresenceRatio: 1 });
  assert.deepEqual(metadata, {
    source: 'scan-auto-save',
    posterPath: 'family/moments/poster.jpg',
    posterErrorCode: 'timeout',
    captureQuality: 0.88,
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
  assert.deepEqual(sharedMetadata, { captureQuality: null });
});

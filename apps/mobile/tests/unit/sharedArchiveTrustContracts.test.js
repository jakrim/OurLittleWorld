import assert from 'node:assert/strict';
import test from 'node:test';

import { autoSaveCorrectionTarget } from '../../src/autoSaveCorrectionModel.js';
import { mediaUploadMetadata } from '../../src/mediaUploadMetadataModel.js';

test('shared upload metadata excludes local and recognition identity evidence', () => {
  const metadata = mediaUploadMetadata({
    caption: 'Parent words',
    pickerAssetId: 'private-picker',
    localAssetId: 'private-local',
    recognitionScore: 0.98,
    faceCount: 1,
    visualFingerprint: [1, -1],
  }, { captureQuality: 0.88, videoPresenceRatio: 1 });
  assert.deepEqual(metadata, { caption: 'Parent words', captureQuality: 0.88 });
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
  assert.deepEqual(sharedMetadata, {
    childId: null,
    mediaType: 'image',
    score: null,
    captureQuality: null,
    creationTime: null,
  });
});

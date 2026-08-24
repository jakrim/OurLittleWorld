import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBookUtilityVisibility } from '../../src/bookUtilityVisibilityModel.js';

test('failed uploads stay prominent because they require action', () => {
  const visibility = buildBookUtilityVisibility({
    uploadQueue: { total: 3, failed: 1, uploading: 1, pending: 1 },
  });

  assert.equal(visibility.showBlockingUpload, true);
  assert.equal(visibility.hasBlockingAction, true);
  assert.equal(visibility.showNonBlockingUploadDetails, false);
  assert.equal(visibility.hasSecondaryDetails, false);
});

test('upload progress without failures moves into secondary details', () => {
  const visibility = buildBookUtilityVisibility({
    uploadQueue: { total: 2, failed: 0, uploading: 1, pending: 1 },
  });

  assert.equal(visibility.showBlockingUpload, false);
  assert.equal(visibility.showNonBlockingUploadDetails, true);
  assert.equal(visibility.hasSecondaryDetails, true);
  assert.equal(visibility.secondaryDetailCount, 1);
});

test('iCloud waits remain prominent and camera-roll changes stay secondary', () => {
  const visibility = buildBookUtilityVisibility({
    iCloudRetry: { count: 2 },
    pendingChange: { changedAt: '2026-07-09T12:00:00Z' },
  });

  assert.equal(visibility.showBlockingICloud, true);
  assert.equal(visibility.hasBlockingAction, true);
  assert.equal(visibility.showCameraRollChangeDetails, true);
  assert.equal(visibility.hasSecondaryDetails, true);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  approveFirstValuePreview,
  firstValuePreviewStorageKey,
  isApprovedFirstValuePreview,
  keepFirstValuePreview,
  previewAnalyticsProperties,
  previewFromMatch,
} from '../../src/firstValuePreviewModel.js';

test('builds a device-local preview without family content or remote media', () => {
  const preview = previewFromMatch({
    assetId: 'photo-1',
    localUri: 'ph://photo-1',
    mediaType: 'image',
    creationTime: 1234,
    score: 0.92,
  }, new Date('2026-07-22T12:00:00.000Z'));

  assert.equal(preview.assetId, 'photo-1');
  assert.equal(preview.localUri, 'ph://photo-1');
  assert.equal(preview.status, 'found');
  assert.equal('score' in preview, false);
  assert.equal(JSON.stringify(preview).includes('baby'), false);
  assert.equal(previewFromMatch({ assetId: 'x', localUri: 'https://example.com/x.jpg' }), null);
});

test('approval and keep are explicit, durable transitions', () => {
  const found = previewFromMatch({ assetId: 'video-1', localUri: 'file:///video.jpg', mediaType: 'video' });
  const approved = approveFirstValuePreview(found, new Date('2026-07-22T12:01:00.000Z'));
  const kept = keepFirstValuePreview(approved, new Date('2026-07-22T12:02:00.000Z'));

  assert.equal(isApprovedFirstValuePreview(found), false);
  assert.equal(isApprovedFirstValuePreview(approved), true);
  assert.equal(kept.status, 'kept');
  assert.deepEqual(previewAnalyticsProperties(approved), { preview_state: 'approved', media_kind: 'video' });
});

test('local preview keys are scoped to the family and device user', () => {
  assert.equal(
    firstValuePreviewStorageKey({ familyId: 'family-1', userId: 'user-1' }),
    'olw:first-value-preview:family-1:user-1',
  );
  assert.equal(firstValuePreviewStorageKey({ familyId: null, userId: 'user-1' }), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  activeFirstValuePreviewRoute,
  approveFirstValuePreview,
  firstValueSubscriptionRoute,
  firstValueReferenceExclusionIds,
  isFirstValueReferenceEcho,
  firstValuePreviewStorageKey,
  isApprovedFirstValuePreview,
  keepFirstValuePreview,
  previewAnalyticsProperties,
  previewFromMatch,
  previewFromReference,
  shouldClearFirstValuePreviewForReferenceScan,
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
  assert.deepEqual(firstValueSubscriptionRoute(approved), {
    pathname: '/purchase',
    params: {
      source: 'first_value_preview',
      returnTo: '/first-value-preview',
    },
  });
  assert.equal(firstValueSubscriptionRoute(found), '/purchase');
});

test('an active creator resumes an approved First Look until it is kept', () => {
  const found = previewFromMatch({ assetId: 'photo-1', localUri: 'ph://photo-1' });
  const approved = approveFirstValuePreview(found);
  const kept = keepFirstValuePreview(approved);

  assert.equal(activeFirstValuePreviewRoute({
    preview: approved,
    entitlementActive: true,
    isCreator: true,
  }), '/first-value-preview');
  assert.equal(activeFirstValuePreviewRoute({
    preview: kept,
    entitlementActive: true,
    isCreator: true,
  }), null);
  assert.equal(activeFirstValuePreviewRoute({
    preview: found,
    entitlementActive: true,
    isCreator: true,
  }), null);
  assert.equal(activeFirstValuePreviewRoute({
    preview: approved,
    entitlementActive: false,
    isCreator: true,
  }), null);
  assert.equal(activeFirstValuePreviewRoute({
    preview: approved,
    entitlementActive: true,
    isCreator: false,
  }), null);
});

test('local preview keys are scoped to the family and device user', () => {
  assert.equal(
    firstValuePreviewStorageKey({ familyId: 'family-1', userId: 'user-1' }),
    'olw:first-value-preview:family-1:user-1',
  );
  assert.equal(firstValuePreviewStorageKey({ familyId: null, userId: 'user-1' }), null);
});

test('First Look excludes local reference assets from discovery candidates', () => {
  assert.deepEqual(
    [...firstValueReferenceExclusionIds({
      references: [
        { assetId: 'ph://reference-a' },
        { assetId: 'reference-b' },
        { assetId: null },
      ],
    })].sort(),
    ['ph://reference-a', 'reference-a', 'reference-b'],
  );
});

test('First Look does not present the supplied reference as a discovery', () => {
  assert.equal(isFirstValueReferenceEcho({ rawScore: 1 }), true);
  assert.equal(isFirstValueReferenceEcho({ rawScore: 0.9997 }), true);
  assert.equal(isFirstValueReferenceEcho({ rawScore: 0.97 }), false);
});

test('a failed short search can fall back to an authentic parent-confirmed reference', () => {
  const preview = previewFromReference({
    assetId: 'reference-photo',
    uri: 'ph://reference-photo',
    capturedAt: 1234,
    parentConfirmed: true,
  }, new Date('2026-07-29T12:00:00.000Z'));

  assert.equal(preview.assetId, 'reference-photo');
  assert.equal(preview.localUri, 'ph://reference-photo');
  assert.equal(preview.status, 'found');
  assert.equal(previewFromReference({
    assetId: 'unconfirmed-photo',
    uri: 'ph://unconfirmed-photo',
    parentConfirmed: false,
  }), null);
});

test('a confirmed replacement reference retires the approved First Look before its new scan', () => {
  assert.equal(shouldClearFirstValuePreviewForReferenceScan({
    firstValueRequested: true,
    referenceConfirmed: true,
  }), true);
  assert.equal(shouldClearFirstValuePreviewForReferenceScan({
    firstValueRequested: true,
    referenceConfirmed: false,
  }), false);
  assert.equal(shouldClearFirstValuePreviewForReferenceScan({
    firstValueRequested: false,
    referenceConfirmed: true,
  }), false);
});

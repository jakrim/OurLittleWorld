import assert from 'node:assert/strict';
import test from 'node:test';

import {
  photoFirstHomeMediaHeight,
  selectPhotoFirstHome,
} from '../../src/photoFirstHomeModel.js';

test('Today gives the private Tonight candidate visual priority over saved archive media', () => {
  const home = selectPhotoFirstHome({
    tonightSession: {
      items: [
        { state: 'skipped', localUri: 'file://skip.jpg' },
        { state: 'queued', localUri: 'file://candidate.jpg', captureTimeMs: 1_700_000_000_000, reasonCode: 'best_day' },
        { state: 'shown', localUri: 'file://later.jpg' },
      ],
    },
    sharedPhotos: [{ thumbUrl: 'https://example.test/kept.jpg', moment_id: 'kept-1' }],
  });

  assert.equal(home.kind, 'tonight');
  assert.equal(home.mediaUri, 'file://candidate.jpg');
  assert.equal(home.remaining, 2);
  assert.equal(home.reasonCode, 'best_day');
});

test('Today falls back to the newest renderable kept memory with grounded authorship', () => {
  const home = selectPhotoFirstHome({
    sharedPhotos: [
      { moment_id: 'missing-media' },
      { moment_id: 'kept-1', thumbUrl: 'https://example.test/kept.jpg', creation_time: '2026-07-01T12:00:00Z', asset_owner_user_id: 'parent-2' },
    ],
    membersById: { 'parent-2': 'Parent' },
  });

  assert.equal(home.kind, 'kept');
  assert.equal(home.momentId, 'kept-1');
  assert.equal(home.author, 'Parent');
  assert.equal(home.capturedAt.toISOString(), '2026-07-01T12:00:00.000Z');
});

test('photo-first Today occupies at least half of a small or large first viewport', () => {
  assert.equal(photoFirstHomeMediaHeight(667), 374);
  assert.equal(photoFirstHomeMediaHeight(844), 473);
  assert.equal(photoFirstHomeMediaHeight(1366), 560);
  assert.equal(photoFirstHomeMediaHeight(null), 473);
});

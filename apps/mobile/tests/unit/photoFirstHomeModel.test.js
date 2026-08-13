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

test('image-only Today uses video posters and never playable video URLs', () => {
  const tonight = selectPhotoFirstHome({
    tonightSession: {
      items: [{
        state: 'shown',
        mediaType: 'video',
        localUri: 'file://private-source.mov',
        previewUri: 'file://private-poster.jpg',
      }],
    },
  });
  assert.equal(tonight.mediaUri, 'file://private-poster.jpg');

  const kept = selectPhotoFirstHome({
    sharedPhotos: [{
      media_type: 'video',
      fullUrl: 'https://playback.test/video.m3u8',
      thumbUrl: 'https://images.test/video.jpg',
    }],
  });
  assert.equal(kept.mediaUri, 'https://images.test/video.jpg');
});

test('Today prefers a durable photo when a transient video poster leads the queue', () => {
  const home = selectPhotoFirstHome({
    tonightSession: {
      items: [
        {
          state: 'queued',
          mediaType: 'video',
          localUri: 'file://private-source.mov',
          previewUri: 'file://old-app-container/transient-poster.jpg',
        },
        {
          state: 'queued',
          mediaType: 'image',
          localUri: 'ph://durable-child-photo',
          captureTimeMs: 1_700_000_000_000,
        },
      ],
    },
  });

  assert.equal(home.kind, 'tonight');
  assert.equal(home.mediaUri, 'ph://durable-child-photo');
  assert.equal(home.mediaType, 'image');
  assert.equal(home.remaining, 2);
});

test('a previewless Tonight video yields to a truthful kept visual', () => {
  const home = selectPhotoFirstHome({
    tonightSession: {
      items: [{ state: 'unavailable', mediaType: 'video', localUri: 'file://private-source.mov' }],
    },
    sharedPhotos: [{ media_type: 'image', fullUrl: 'https://images.test/kept.jpg' }],
  });
  assert.equal(home.kind, 'kept');
  assert.equal(home.mediaUri, 'https://images.test/kept.jpg');
});

test('photo-first Today occupies at least half of a small or large first viewport', () => {
  assert.equal(photoFirstHomeMediaHeight(667), 374);
  assert.equal(photoFirstHomeMediaHeight(844), 473);
  assert.equal(photoFirstHomeMediaHeight(1366), 560);
  assert.equal(photoFirstHomeMediaHeight(null), 473);
});

test('the latest Keep wins Today without turning Keep time into capture time', () => {
  const home = selectPhotoFirstHome({
    sharedPhotos: [
      { moment_id: 'older', thumbUrl: 'https://example.test/older.jpg', tagged_at: '2026-08-12T18:00:00Z' },
      { moment_id: 'newer', thumbUrl: 'https://example.test/newer.jpg', tagged_at: '2026-08-12T20:00:00Z' },
    ],
  });
  assert.equal(home.momentId, 'newer');
  assert.equal(home.mediaUri, 'https://example.test/newer.jpg');
  assert.equal(home.capturedAt, null);
});

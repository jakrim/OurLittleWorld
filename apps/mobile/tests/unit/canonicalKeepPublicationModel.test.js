import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCanonicalKeepPublicationParams,
  canonicalKeepPublicationResult,
} from '../../src/canonicalKeepPublicationModel.js';

const base = {
  familyId: 'family-1',
  reservationId: 'reservation-1',
  momentId: 'moment-1',
  mediaId: 'media-1',
  remoteAssetKey: 'asset-1',
  capturedAt: '2026-08-12T12:00:00.000Z',
  creationTime: '2026-08-12T12:00:00.000Z',
  metadata: { source: 'first-value-preview' },
};

test('all Keep transports use one typed atomic publication contract', () => {
  const transports = [
    ['image', { fullObjectId: 'full', thumbObjectId: 'thumb', actualBytes: 12 }],
    ['video-stream', { streamUid: 'stream', actualBytes: 20, actualDurationSec: 4 }],
    ['video-direct', { fullObjectId: 'full', actualBytes: 20, actualDurationSec: 4 }],
    ['video-poster', { posterObjectId: 'poster', actualBytes: 5 }],
  ];
  for (const [transport, fields] of transports) {
    const params = buildCanonicalKeepPublicationParams({ ...base, transport, ...fields });
    assert.equal(params.p_transport, transport);
    assert.equal(params.p_reservation_id, base.reservationId);
    assert.equal(params.p_moment_id, base.momentId);
    assert.equal(params.p_media_id, base.mediaId);
    assert.equal(params.p_asset_id, base.remoteAssetKey);
    assert.equal(params.p_captured_at, base.creationTime);
    assert.equal(params.p_creation_time, base.creationTime);
  }
});

test('image, playable video, and poster publication fail closed when capture time is unknown', () => {
  for (const transport of ['image', 'video-stream', 'video-direct', 'video-poster']) {
    assert.throws(
      () => buildCanonicalKeepPublicationParams({
        ...base,
        transport,
        capturedAt: '2026-08-12T12:05:00.000Z',
        creationTime: null,
      }),
      (error) => error.code === 'capture_time_unknown',
    );
  }
});

test('publication response exposes canonical record identities but no reservation or provider capability', () => {
  const result = canonicalKeepPublicationResult({
    moment_id: 'moment-1',
    moment_media_id: 'media-1',
    photo_tag_id: 'tag-1',
    already_published: false,
    reservation_id: 'must-not-pass-through',
    provider_object_id: 'must-not-pass-through',
  }, base);
  assert.deepEqual(result, { momentId: 'moment-1', mediaId: 'media-1', alreadyPublished: false });
});

test('atomic Keep publication applies the shared metadata allowlist at the final client boundary', () => {
  const params = buildCanonicalKeepPublicationParams({
    ...base,
    transport: 'image',
    metadata: {
      source: 'scan-auto-save',
      fullPath: 'family/full/image.jpg',
      recognitionFrameTimeMs: 1200,
      localAssetId: 'private-device-id',
      posterError: '/private/path/provider-error',
    },
  });
  assert.deepEqual(params.p_metadata, {
    source: 'scan-auto-save',
    fullPath: 'family/full/image.jpg',
  });
});

test('missing scope or mismatched readback fails closed', () => {
  assert.throws(() => buildCanonicalKeepPublicationParams({ ...base, reservationId: null, transport: 'image' }));
  assert.throws(() => canonicalKeepPublicationResult({
    moment_id: 'another-moment', moment_media_id: 'media-1', photo_tag_id: 'tag-1',
  }, base), /not confirmed/);
});

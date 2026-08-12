import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalImageKeepComplete,
  canonicalImageKeepRecovery,
  canonicalPosterKeepComplete,
  canonicalVideoKeepComplete,
  confirmMediaUploadFinalized,
  legacyDirectVideoRowsMatch,
  legacyPosterVideoRowsMatch,
  legacyRemoteAssetIdentityFromRows,
  reconcileLegacyDirectVideoUpload,
  reconcileLegacyPosterVideoUpload,
  resumeCanonicalObjectUpload,
} from '../../src/mediaUploadRecoveryModel.js';

test('failure after object upload reuses the same reservation on replay', async () => {
  let persisted = null;
  let reservations = 0;
  let uploads = 0;
  let finalizations = 0;
  let failUploadedPersist = true;
  const run = () => resumeCanonicalObjectUpload({
    context: persisted,
    reserve: async () => {
      reservations += 1;
      return 'reservation-1';
    },
    persist: async (next) => {
      if (next.state === 'uploaded' && failUploadedPersist) {
        failUploadedPersist = false;
        throw new Error('local state write failed after upload');
      }
      persisted = next;
    },
    upload: async () => { uploads += 1; },
    finalize: async () => { finalizations += 1; },
    abandon: async () => {},
  });

  await assert.rejects(run, /after upload/);
  const replayed = await run();

  assert.equal(reservations, 1);
  assert.equal(uploads, 2);
  assert.equal(finalizations, 1);
  assert.equal(replayed.reservationId, 'reservation-1');
  assert.equal(replayed.state, 'finalized');
});

test('failure after quota finalize confirms the same reservation on replay', async () => {
  let persisted = { kind: 'image', reservationId: 'reservation-1', state: 'uploaded' };
  let remoteStatus = 'reserved';
  let finalizeCalls = 0;
  let failFinalizedPersist = true;
  const finalize = () => confirmMediaUploadFinalized({
    reservationId: 'reservation-1',
    finalize: async () => {
      finalizeCalls += 1;
      if (remoteStatus === 'finalized') throw new Error('reservation is no longer open');
      remoteStatus = 'finalized';
    },
    read: async () => ({ id: 'reservation-1', status: remoteStatus }),
  });
  const run = () => resumeCanonicalObjectUpload({
    context: persisted,
    reserve: async () => { throw new Error('must not reserve again'); },
    persist: async (next) => {
      if (next.state === 'finalized' && failFinalizedPersist) {
        failFinalizedPersist = false;
        throw new Error('local state write failed after finalize');
      }
      persisted = next;
    },
    upload: async () => { throw new Error('must not upload again'); },
    finalize,
  });

  await assert.rejects(run, /after finalize/);
  const replayed = await run();

  assert.equal(finalizeCalls, 2);
  assert.equal(remoteStatus, 'finalized');
  assert.equal(replayed.reservationId, 'reservation-1');
  assert.equal(replayed.state, 'finalized');
});

test('a completed canonical image Keep performs no repeated side effects', async () => {
  const complete = canonicalImageKeepComplete({
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'image',
      upload_status: 'ready',
      full_object: 'full-1',
      thumb_object: 'thumb-1',
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      upload_status: 'ready',
      storage_object: 'full-1',
      thumb_object: 'thumb-1',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
    fullObjectId: 'full-1',
    thumbObjectId: 'thumb-1',
  });
  const result = await resumeCanonicalObjectUpload({
    complete,
    reserve: async () => { throw new Error('must not reserve'); },
    persist: async () => { throw new Error('must not persist'); },
    upload: async () => { throw new Error('must not upload'); },
    finalize: async () => { throw new Error('must not finalize'); },
  });

  assert.equal(result.reused, true);
  assert.equal(result.state, 'finalized');
});

test('a ready canonical image repairs a partial tag without another upload', async () => {
  const recovery = canonicalImageKeepRecovery({
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'image',
      upload_status: 'ready',
      full_object: 'full-1',
      thumb_object: 'thumb-1',
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      upload_status: 'failed',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
    fullObjectId: 'full-1',
    thumbObjectId: 'thumb-1',
  });
  const result = await resumeCanonicalObjectUpload({
    complete: recovery.remoteReady,
    reserve: async () => { throw new Error('must not reserve'); },
    upload: async () => { throw new Error('must not upload'); },
    finalize: async () => { throw new Error('must not finalize'); },
  });

  assert.equal(recovery.complete, false);
  assert.equal(recovery.mediaReady, true);
  assert.equal(recovery.tagReady, false);
  assert.equal(result.reused, true);
});

test('a ready Stream row remains incomplete until quota finalization persists', () => {
  const input = {
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'video',
      upload_status: 'ready',
      stream_uid: 'stream-1',
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      upload_status: 'ready',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
    requireStream: true,
  };

  assert.equal(canonicalVideoKeepComplete({ ...input, providerPublished: false }), false);
  assert.equal(canonicalVideoKeepComplete({ ...input, providerPublished: true }), true);
});

for (const kind of ['video-direct', 'video-poster']) {
  test(`${kind} recovers the same canonical reservation after an unpersisted response`, async () => {
    let persisted = null;
    let createdReservation = null;
    let reserveCalls = 0;
    let failReservedPersist = true;
    const run = () => resumeCanonicalObjectUpload({
      kind,
      context: persisted,
      reserve: async () => {
        reserveCalls += 1;
        createdReservation ||= `${kind}-canonical-reservation`;
        return createdReservation;
      },
      persist: async (next) => {
        if (next.state === 'reserved' && failReservedPersist) {
          failReservedPersist = false;
          throw new Error('process ended before reservation response persisted');
        }
        persisted = next;
      },
      upload: async () => ({ posterObject: `${kind}-poster` }),
      finalize: async () => {},
      publish: async () => {},
    });

    await assert.rejects(run, /reservation response persisted/);
    const replayed = await run();

    assert.equal(reserveCalls, 2);
    assert.equal(createdReservation, `${kind}-canonical-reservation`);
    assert.equal(replayed.reservationId, createdReservation);
    assert.equal(replayed.state, 'published');
  });

  test(`${kind} replays one reservation and publishes only after confirmed finalization`, async () => {
    let persisted = null;
    let reservations = 0;
    let uploads = 0;
    let finalizations = 0;
    let publications = 0;
    let finalized = false;
    let failFinalizedPersist = true;
    const events = [];
    const run = () => resumeCanonicalObjectUpload({
      kind,
      context: persisted,
      reserve: async () => {
        reservations += 1;
        return `${kind}-reservation`;
      },
      persist: async (next) => {
        if (next.state === 'finalized' && failFinalizedPersist) {
          failFinalizedPersist = false;
          throw new Error('process ended after quota confirmation');
        }
        persisted = next;
      },
      upload: async () => {
        uploads += 1;
        return { posterObject: `${kind}-poster` };
      },
      finalize: async () => {
        finalizations += 1;
        finalized = true;
        events.push('finalized');
      },
      publish: async (current) => {
        assert.equal(finalized, true);
        assert.equal(current.reservationId, `${kind}-reservation`);
        publications += 1;
        events.push('published');
      },
      abandon: async () => {},
    });

    await assert.rejects(run, /quota confirmation/);
    assert.equal(publications, 0);
    const replayed = await run();

    assert.equal(reservations, 1);
    assert.equal(uploads, 1);
    assert.equal(finalizations, 2);
    assert.equal(publications, 1);
    assert.deepEqual(events.slice(-2), ['finalized', 'published']);
    assert.equal(replayed.state, 'published');
    assert.equal(replayed.result.posterObject, `${kind}-poster`);
  });
}

test('poster-only completion requires the same published transfer', () => {
  const input = {
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'video',
      upload_status: 'ready',
      poster_object: 'poster-1',
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      upload_status: 'ready',
      thumb_object: 'poster-1',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
  };
  assert.equal(canonicalPosterKeepComplete({ ...input, transferPublished: false }), false);
  assert.equal(canonicalPosterKeepComplete({ ...input, transferPublished: true }), true);
});

test('a legacy ready direct video adopts its finalized reservation without another charge', async () => {
  let persisted = null;
  const context = await reconcileLegacyDirectVideoUpload({
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'video',
      full_object: 'full-1',
      poster_object: 'poster-1',
      storage_provider: 'supabase',
      upload_status: 'ready',
      source_bytes: 1200,
      optimized_bytes: 1200,
      playback_seconds: 12,
      metadata: { posterPath: 'family/poster.jpg' },
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      storage_object: 'full-1',
      thumb_object: 'poster-1',
      upload_status: 'ready',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
    fullObjectId: 'full-1',
    sourceBytes: 1200,
    durationSec: 12,
    readReservation: async () => ({
      reservation_id: 'legacy-finalized-reservation',
      status: 'finalized',
      canonical_media_id: 'media-1',
      transport: 'video-direct',
      storage_present: true,
    }),
    persist: async (next) => { persisted = next; },
  });
  const resumed = await resumeCanonicalObjectUpload({
    kind: 'video-direct',
    context,
    reserve: async () => { throw new Error('must not reserve'); },
    upload: async () => { throw new Error('must not upload'); },
    finalize: async () => { throw new Error('must not finalize'); },
    persist: async () => { throw new Error('must not persist twice'); },
    publish: async () => { throw new Error('must not publish twice'); },
  });

  assert.equal(context.state, 'published');
  assert.equal(context.reservationId, 'legacy-finalized-reservation');
  assert.equal(context.result.posterObject, 'poster-1');
  assert.equal(persisted.state, 'published');
  assert.equal(resumed.state, 'published');
});

test('a legacy partial direct video resumes its exact canonical reservation', async () => {
  let persisted = null;
  let uploads = 0;
  let finalizations = 0;
  let publications = 0;
  const context = await reconcileLegacyDirectVideoUpload({
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'video',
      full_object: 'full-1',
      storage_provider: 'supabase',
      upload_status: 'failed',
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      storage_object: 'full-1',
      upload_status: 'failed',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
    fullObjectId: 'full-1',
    readReservation: async () => ({
      reservation_id: 'reservation-1',
      status: 'reserved',
      canonical_media_id: 'media-1',
      transport: 'video-direct',
      storage_present: false,
    }),
    persist: async (next) => { persisted = next; },
  });
  const resumed = await resumeCanonicalObjectUpload({
    kind: 'video-direct',
    context,
    reserve: async () => { throw new Error('must not reserve again'); },
    persist: async (next) => { persisted = next; },
    upload: async () => { uploads += 1; },
    finalize: async () => { finalizations += 1; },
    publish: async () => { publications += 1; },
  });

  assert.equal(context.reservationId, 'reservation-1');
  assert.equal(uploads, 1);
  assert.equal(finalizations, 1);
  assert.equal(publications, 1);
  assert.equal(persisted.state, 'published');
  assert.equal(resumed.state, 'published');
});

test('legacy ready rows adopt an explicit grandfather reservation without another upload', async () => {
  let persisted = null;
  const context = await reconcileLegacyDirectVideoUpload({
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'video',
      full_object: 'full-1',
      storage_provider: 'supabase',
      upload_status: 'ready',
      source_bytes: 1200,
      playback_seconds: 12,
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      storage_object: 'full-1',
      upload_status: 'ready',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
    fullObjectId: 'full-1',
    readReservation: async () => ({
      reservation_id: 'grandfather-reservation',
      status: 'finalized',
      canonical_media_id: 'media-1',
      transport: 'video-direct',
      storage_present: true,
      accounting_resolution: 'legacy_grandfathered_missing',
    }),
    persist: async (next) => { persisted = next; },
  });

  assert.equal(context.state, 'published');
  assert.equal(context.reservationId, 'grandfather-reservation');
  assert.equal(persisted.state, 'published');
});

test('legacy direct-video reconciliation requires exact canonical remote rows', () => {
  const input = {
    existingMedia: {
      id: 'media-1',
      moment_id: 'moment-1',
      media_type: 'video',
      full_object: 'full-1',
      storage_provider: 'supabase',
      stream_uid: null,
    },
    existingTag: {
      moment_id: 'moment-1',
      moment_media_id: 'media-1',
      storage_object: 'full-1',
    },
    momentId: 'moment-1',
    mediaId: 'media-1',
    fullObjectId: 'full-1',
  };

  assert.equal(legacyDirectVideoRowsMatch(input), true);
  assert.equal(legacyDirectVideoRowsMatch({
    ...input,
    existingTag: { ...input.existingTag, storage_object: 'other-object' },
  }), false);
  assert.equal(legacyDirectVideoRowsMatch({
    ...input,
    existingMedia: { ...input.existingMedia, storage_provider: 'stream' },
  }), false);
});

test('legacy ready poster-only video adopts its verified canonical object', async () => {
  let persisted = null;
  const existingMedia = {
    id: 'media-1',
    moment_id: 'moment-1',
    media_type: 'video',
    full_object: null,
    poster_object: 'poster-1',
    storage_provider: 'supabase',
    upload_status: 'ready',
    metadata: { posterOnly: true },
  };
  const existingTag = {
    moment_id: 'moment-1',
    moment_media_id: 'media-1',
    storage_object: null,
    thumb_object: 'poster-1',
    upload_status: 'ready',
  };
  assert.equal(legacyPosterVideoRowsMatch({
    existingMedia,
    existingTag,
    momentId: 'moment-1',
    mediaId: 'media-1',
    posterObjectId: 'poster-1',
  }), true);

  const context = await reconcileLegacyPosterVideoUpload({
    existingMedia,
    existingTag,
    momentId: 'moment-1',
    mediaId: 'media-1',
    posterObjectId: 'poster-1',
    readReservation: async () => ({
      reservation_id: 'grandfather-poster-reservation',
      status: 'finalized',
      canonical_media_id: 'media-1',
      transport: 'video-poster',
      storage_present: true,
      accounting_resolution: 'legacy_grandfathered_missing',
    }),
    persist: async (next) => { persisted = next; },
  });

  assert.equal(context.state, 'published');
  assert.equal(context.kind, 'video-poster');
  assert.equal(context.reservationId, 'grandfather-poster-reservation');
  assert.equal(context.result.posterObject, 'poster-1');
  assert.equal(persisted.state, 'published');
});

test('queued pre-mapping Keep adopts only one authorized ready legacy target', () => {
  const scope = {
    familyId: 'family-1',
    ownerUserId: 'parent-1',
    localAssetId: 'legacy-photos-id',
  };
  const tag = {
    family_id: 'family-1',
    asset_owner_user_id: 'parent-1',
    asset_id: 'legacy-photos-id',
    moment_id: 'moment-1',
    moment_media_id: 'media-1',
    upload_status: 'ready',
  };
  const media = {
    id: 'media-1',
    moment_id: 'moment-1',
    family_id: 'family-1',
    owner_user_id: 'parent-1',
    local_identifier: 'legacy-photos-id',
    upload_status: 'ready',
  };

  assert.deepEqual(legacyRemoteAssetIdentityFromRows({ ...scope, tags: [tag], media }), {
    remoteAssetKey: 'legacy-photos-id',
    momentId: 'moment-1',
    mediaId: 'media-1',
  });
  assert.equal(legacyRemoteAssetIdentityFromRows({ ...scope, tags: [tag, tag], media }), null);
  assert.equal(legacyRemoteAssetIdentityFromRows({
    ...scope,
    tags: [{ ...tag, asset_owner_user_id: 'another-parent' }],
    media,
  }), null);
  assert.equal(legacyRemoteAssetIdentityFromRows({
    ...scope,
    tags: [{ ...tag, upload_status: 'failed' }],
    media,
  }), null);
});

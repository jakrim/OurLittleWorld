import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalImageKeepComplete,
  canonicalImageKeepRecovery,
  canonicalVideoKeepComplete,
  confirmMediaUploadFinalized,
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

  assert.equal(canonicalVideoKeepComplete({ ...input, providerFinalized: false }), false);
  assert.equal(canonicalVideoKeepComplete({ ...input, providerFinalized: true }), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCanonicalMediaIdentity,
  canonicalMediaProviderIdentity,
  confirmCanonicalKeepPreparation,
  confirmCanonicalProviderAcceptance,
  ensureCanonicalMoment,
  finalizeCanonicalProviderUpload,
  reconcileCanonicalKeepSideEffect,
  resolveCanonicalPosterResult,
  resumeCanonicalProviderUpload,
} from '../../src/canonicalMediaKeepModel.js';

test('Stream publication requires a second exact provider acceptance reconciliation', async () => {
  const persisted = [];
  const context = {
    uid: 'stream-1', reservationId: 'reservation-1', state: 'uploaded', uploadURL: null,
  };
  const confirmed = await confirmCanonicalProviderAcceptance({
    context,
    reconcile: async () => ({
      uid: 'stream-1', reservationId: 'reservation-1', state: 'uploaded',
    }),
    persist: async (next) => persisted.push(next),
  });
  assert.equal(confirmed.state, 'uploaded');
  assert.deepEqual(persisted, [confirmed]);

  await assert.rejects(() => confirmCanonicalProviderAcceptance({
    context,
    reconcile: async () => ({
      uid: 'attacker-stream', reservationId: 'reservation-1', state: 'uploaded',
    }),
    persist: async () => {},
  }), /not confirmed/);
  await assert.rejects(() => confirmCanonicalProviderAcceptance({
    context: { ...context, state: 'uploading' },
    reconcile: async () => context,
    persist: async () => {},
  }), /not ready/);
});

test('canonical side effects are marked only after prepare confirms durability', async () => {
  let marks = 0;
  await assert.rejects(() => confirmCanonicalKeepPreparation({
    prepare: async () => { throw new Error('transient read failure'); },
    markStarted: async () => { marks += 1; },
  }), /transient read failure/);
  assert.equal(marks, 0);

  const prepared = await confirmCanonicalKeepPreparation({
    prepare: async () => ({ momentId: 'moment-1' }),
    markStarted: async () => { marks += 1; },
  });
  assert.deepEqual(prepared, { momentId: 'moment-1' });
  assert.equal(marks, 1);
});

test('legacy process death reconciles a remote moment before abandonment', async () => {
  let marks = 0;
  const found = await reconcileCanonicalKeepSideEffect({
    readMoment: async () => ({ id: 'moment-1' }),
    readMedia: async () => null,
    readTag: async () => null,
    readReservation: async () => null,
    markStarted: async () => { marks += 1; },
  });
  assert.equal(found, true);
  assert.equal(marks, 1);

  await assert.rejects(() => reconcileCanonicalKeepSideEffect({
    readMoment: async () => { throw new Error('remote state unavailable'); },
    readMedia: async () => null,
    readTag: async () => null,
    readReservation: async () => null,
    markStarted: async () => { marks += 1; },
  }), /remote state unavailable/);
  assert.equal(marks, 1);
});

test('a partial moment write resumes the same canonical row', async () => {
  const rows = new Map();
  let inserts = 0;
  const expected = {
    id: 'moment-1',
    family_id: 'family-a',
    author_user_id: 'parent-a',
  };
  const dependencies = {
    expected,
    read: async (id) => rows.get(id) || null,
    insert: async (moment) => {
      inserts += 1;
      if (rows.has(moment.id)) throw new Error('duplicate key');
      rows.set(moment.id, moment);
    },
  };

  await ensureCanonicalMoment(dependencies);
  await ensureCanonicalMoment(dependencies);

  assert.equal(rows.size, 1);
  assert.equal(inserts, 1);
});

test('canonical provider objects remain stable for image, video, and poster-only retries', () => {
  const mediaId = '11111111-1111-4111-8111-111111111111';
  const first = canonicalMediaProviderIdentity({ mediaId });
  const retried = canonicalMediaProviderIdentity({
    mediaId,
    existingMedia: {
      full_object: first.fullObjectId,
      thumb_object: first.thumbObjectId,
      poster_object: first.posterObjectId,
    },
  });

  assert.deepEqual(retried, first);
  assert.equal(first.fullObjectId, mediaId);
  assert.equal(first.thumbObjectId, mediaId);
  assert.equal(first.posterObjectId, mediaId);
});

test('provider upload resumes one persisted identity after a later write fails', async () => {
  let persisted = null;
  let providerObjects = 0;
  let uploaded = 0;
  const run = () => resumeCanonicalProviderUpload({
    context: persisted,
    prepare: async (current) => {
      if (!current?.uid) providerObjects += 1;
      return current?.uid
        ? { ...current, state: current.state === 'uploaded' ? 'uploaded' : 'prepared' }
        : { uid: 'stream-1', uploadURL: 'https://upload.test/stream-1', reservationId: 'reservation-1', state: 'prepared' };
    },
    persist: async (next) => { persisted = next; },
    upload: async () => { uploaded += 1; },
  });

  await assert.rejects(async () => {
    await run();
    throw new Error('tag write failed');
  }, /tag write failed/);
  const retry = await run();

  assert.equal(providerObjects, 1);
  assert.equal(uploaded, 1);
  assert.equal(retry.uid, 'stream-1');
  assert.equal(retry.state, 'uploaded');
});

test('process replay reconciles an accepted upload before reusing a consumed URL', async () => {
  let persisted = null;
  let remoteState = 'pendingupload';
  let uploads = 0;
  let failAcceptedPersist = true;
  const prepare = async (current) => {
    if (remoteState !== 'pendingupload') {
      return { uid: 'stream-1', reservationId: 'reservation-1', state: 'uploaded' };
    }
    return {
      uid: 'stream-1',
      reservationId: 'reservation-1',
      uploadURL: current?.uid === 'stream-1' ? null : 'https://upload.test/stream-1',
      state: current?.state === 'uploading' ? 'uploading' : 'prepared',
    };
  };
  const persist = async (next) => {
    if (next.state === 'uploaded' && failAcceptedPersist) {
      failAcceptedPersist = false;
      throw new Error('local process ended before acceptance persisted');
    }
    persisted = next;
  };
  const upload = async () => {
    uploads += 1;
    remoteState = 'queued';
  };

  await assert.rejects(() => resumeCanonicalProviderUpload({
    context: persisted,
    prepare,
    persist,
    upload,
  }), /acceptance persisted/);
  const replayed = await resumeCanonicalProviderUpload({
    context: persisted,
    prepare,
    persist,
    upload,
  });

  assert.equal(uploads, 1);
  assert.equal(replayed.uid, 'stream-1');
  assert.equal(replayed.state, 'uploaded');
  assert.equal(replayed.uploadURL, null);
});

test('provider finalization only becomes terminal after confirmation persists', async () => {
  let persisted = { uid: 'stream-1', reservationId: 'reservation-1', state: 'uploaded' };
  let remoteStatus = 'reserved';
  let finalizeCalls = 0;
  let failFinalizedPersist = true;
  const run = () => finalizeCanonicalProviderUpload({
    context: persisted,
    finalize: async () => {
      finalizeCalls += 1;
      if (remoteStatus !== 'finalized') remoteStatus = 'finalized';
    },
    persist: async (next) => {
      if (failFinalizedPersist) {
        failFinalizedPersist = false;
        throw new Error('local state write failed after quota finalize');
      }
      persisted = next;
    },
  });

  await assert.rejects(run, /after quota finalize/);
  assert.equal(persisted.state, 'uploaded');
  const replayed = await run();

  assert.equal(finalizeCalls, 2);
  assert.equal(remoteStatus, 'finalized');
  assert.equal(replayed.uid, 'stream-1');
  assert.equal(replayed.state, 'finalized');
});

test('Stream publication waits for quota confirmation and resumes after process death', async () => {
  let persisted = { uid: 'stream-1', reservationId: 'reservation-1', state: 'uploaded' };
  let remoteFinalized = false;
  let publishCalls = 0;
  let failFinalizedPersist = true;
  const run = () => finalizeCanonicalProviderUpload({
    context: persisted,
    finalize: async () => { remoteFinalized = true; },
    persist: async (next) => {
      if (next.state === 'finalized' && failFinalizedPersist) {
        failFinalizedPersist = false;
        throw new Error('process ended after Stream quota confirmation');
      }
      persisted = next;
    },
    publish: async () => {
      assert.equal(remoteFinalized, true);
      publishCalls += 1;
    },
  });

  await assert.rejects(run, /quota confirmation/);
  assert.equal(publishCalls, 0);
  const replayed = await run();

  assert.equal(publishCalls, 1);
  assert.equal(replayed.uid, 'stream-1');
  assert.equal(replayed.reservationId, 'reservation-1');
  assert.equal(replayed.state, 'published');
});

test('Stream publication reuses a successful poster after process death', async () => {
  let persisted = {
    uid: 'stream-1',
    reservationId: 'reservation-1',
    state: 'finalized',
    result: { posterObject: 'poster-1', posterMetadata: { posterSource: 'recognition-frame' } },
  };
  let posterUploads = 0;
  let failPublishedPersist = true;
  const published = [];
  const run = async () => {
    const posterResult = await resolveCanonicalPosterResult({
      contextResult: persisted.result,
      upload: async () => {
        posterUploads += 1;
        return { posterObject: null, posterMetadata: { posterStatus: 'failed' } };
      },
    });
    return finalizeCanonicalProviderUpload({
      context: { ...persisted, result: posterResult },
      finalize: async () => {},
      persist: async (next) => {
        if (next.state === 'published' && failPublishedPersist) {
          failPublishedPersist = false;
          throw new Error('process ended after poster publication');
        }
        persisted = next;
      },
      publish: async (current) => { published.push(current.result.posterObject); },
    });
  };

  await assert.rejects(run, /poster publication/);
  const replayed = await run();

  assert.equal(posterUploads, 0);
  assert.deepEqual(published, ['poster-1', 'poster-1']);
  assert.equal(replayed.result.posterObject, 'poster-1');
  assert.equal(replayed.state, 'published');
});

test('ready remote poster wins over a later optional poster failure', async () => {
  let posterUploads = 0;
  const result = await resolveCanonicalPosterResult({
    existingMedia: {
      upload_status: 'ready',
      poster_object: 'poster-ready',
      metadata: { posterSource: 'generated-frame' },
    },
    upload: async () => {
      posterUploads += 1;
      return { posterObject: null };
    },
  });

  assert.equal(posterUploads, 0);
  assert.equal(result.posterObject, 'poster-ready');
  assert.equal(result.posterMetadata.posterSource, 'generated-frame');
});

test('matching remote poster rows survive a late failed status write', async () => {
  let posterUploads = 0;
  const result = await resolveCanonicalPosterResult({
    existingMedia: {
      upload_status: 'failed',
      poster_object: 'poster-published',
      metadata: { posterSource: 'recognition-frame' },
    },
    existingTag: {
      upload_status: 'failed',
      thumb_object: 'poster-published',
    },
    upload: async () => {
      posterUploads += 1;
      return { posterObject: null };
    },
  });

  assert.equal(posterUploads, 0);
  assert.equal(result.posterObject, 'poster-published');
});

test('canonical identity checks refuse unrelated moment and media rows', async () => {
  await assert.rejects(() => ensureCanonicalMoment({
    expected: { id: 'moment-1', family_id: 'family-a', author_user_id: 'parent-a' },
    read: async () => ({ id: 'moment-1', family_id: 'family-b', author_user_id: 'parent-b' }),
    insert: async () => {},
  }), /another family record/i);
  assert.throws(() => assertCanonicalMediaIdentity({
    id: 'media-1',
    moment_id: 'moment-other',
    family_id: 'family-b',
    owner_user_id: 'parent-b',
    local_identifier: 'remote-other',
  }, {
    id: 'media-1',
    moment_id: 'moment-1',
    family_id: 'family-a',
    owner_user_id: 'parent-a',
    local_identifier: 'remote-1',
  }), /another saved memory/i);
});

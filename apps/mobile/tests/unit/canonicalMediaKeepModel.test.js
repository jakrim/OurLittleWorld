import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCanonicalMediaIdentity,
  canonicalMediaProviderIdentity,
  ensureCanonicalMoment,
  resumeCanonicalProviderUpload,
} from '../../src/canonicalMediaKeepModel.js';

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
  let prepared = 0;
  let uploaded = 0;
  const run = () => resumeCanonicalProviderUpload({
    context: persisted,
    prepare: async () => {
      prepared += 1;
      return { uid: 'stream-1', uploadURL: 'https://upload.test/stream-1', reservationId: 'reservation-1' };
    },
    persist: async (next) => { persisted = next; },
    upload: async () => { uploaded += 1; },
  });

  await assert.rejects(async () => {
    await run();
    throw new Error('tag write failed');
  }, /tag write failed/);
  const retry = await run();

  assert.equal(prepared, 1);
  assert.equal(uploaded, 1);
  assert.equal(retry.uid, 'stream-1');
  assert.equal(retry.state, 'uploaded');
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

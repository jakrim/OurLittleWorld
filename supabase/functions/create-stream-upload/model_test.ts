import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import {
  authorizeCanonicalProviderAccess,
  canonicalStreamCreator,
  canonicalStreamUploadUrl,
  claimCanonicalProviderIdentity,
  legacyStreamRetryDisposition,
  reconcileAbsentProviderCleanup,
  streamVideoDisposition,
} from './model.ts';

const mediaId = '11111111-1111-4111-8111-111111111111';
const familyId = '22222222-2222-4222-8222-222222222222';

function video(state: string, overrides: Record<string, unknown> = {}) {
  return {
    uid: 'stream-1',
    creator: mediaId,
    meta: { familyId, canonicalMediaId: mediaId, reservationId: 'reservation-1' },
    status: { state },
    uploadExpiry: '2026-08-12T18:00:00.000Z',
    ...overrides,
  };
}

Deno.test('lapsed and Circle retries are denied before provider access', async () => {
  for (const reason of ['lapsed', 'circle']) {
    let providerReads = 0;
    await assertRejects(
      () => authorizeCanonicalProviderAccess({
        authorize: async () => { throw new Error(`${reason} cannot upload`); },
        accessProvider: async () => {
          providerReads += 1;
          return [];
        },
      }),
      Error,
      'cannot upload',
    );
    assertEquals(providerReads, 0);
  }
});

Deno.test('canonical Stream creator accepts only opaque remote media UUIDs', () => {
  assertEquals(canonicalStreamCreator(mediaId.toUpperCase()), mediaId);
  assertEquals(canonicalStreamCreator('photos://private-library-id'), null);
});

Deno.test('pending uploads reuse their canonical provider identity after an unpersisted response', () => {
  const options = { canonicalMediaId: mediaId, familyId, nowMs: Date.parse('2026-08-12T17:00:00.000Z') };
  assertEquals(streamVideoDisposition(video('pendingupload'), {
    ...options,
    providerState: 'prepared',
  }).action, 'prepared');
  assertEquals(streamVideoDisposition(video('pendingupload'), options).action, 'prepared');
  assertEquals(canonicalStreamUploadUrl('stream-1'), 'https://upload.videodelivery.net/stream-1');
});

Deno.test('process death before the Stream POST resumes the unexpired one-time URL', () => {
  const options = {
    canonicalMediaId: mediaId,
    familyId,
    providerState: 'uploading',
    nowMs: Date.parse('2026-08-12T17:00:00.000Z'),
  };
  assertEquals(streamVideoDisposition(video('queued'), options).action, 'uploaded');
  assertEquals(streamVideoDisposition(video('pendingupload'), options).action, 'prepared');
  assertEquals(canonicalStreamUploadUrl('stream-1'), 'https://upload.videodelivery.net/stream-1');
});

Deno.test('concurrent provider preparation exposes only the canonical winner', async () => {
  let winner: string | null = null;
  const cleaned: string[] = [];
  const claim = async (uid: string) => {
    await Promise.resolve();
    winner ||= uid;
    return {
      claimed: winner === uid,
      winning_provider_object_id: winner,
    };
  };
  const cleanup = async (uid: string) => { cleaned.push(uid); };

  const results = await Promise.all([
    claimCanonicalProviderIdentity({ candidateUid: 'stream-a', claim, cleanup }),
    claimCanonicalProviderIdentity({ candidateUid: 'stream-b', claim, cleanup }),
  ]);
  if (!winner) throw new Error('canonical provider winner was not selected');

  assertEquals(results.map((result) => result.uid), [winner, winner]);
  assertEquals(results.filter((result) => result.claimed).length, 1);
  assertEquals(cleaned, [winner === 'stream-a' ? 'stream-b' : 'stream-a']);
});

Deno.test('provider records must match canonical family scope', () => {
  const result = streamVideoDisposition(video('ready', {
    meta: { familyId: 'another-family', canonicalMediaId: mediaId, reservationId: 'reservation-1' },
  }), { canonicalMediaId: mediaId, familyId });
  assertEquals(result.action, 'invalid');
});

Deno.test('legacy provider retries require attached reservation and canonical media authorization', () => {
  const authorized = legacyStreamRetryDisposition({
    canonicalMediaId: mediaId,
    familyId,
    userId: 'parent-1',
    providerUid: 'legacy-stream-1',
    providerState: 'uploaded',
    reservation: {
      id: 'reservation-legacy',
      family_id: familyId,
      user_id: 'parent-1',
      provider: null,
      provider_object_id: null,
      status: 'reserved',
    },
    media: {
      id: mediaId,
      family_id: familyId,
      owner_user_id: 'parent-1',
      stream_uid: 'legacy-stream-1',
    },
    video: {
      uid: 'legacy-stream-1',
      meta: { familyId },
      status: { state: 'ready' },
    },
  });
  assertEquals(authorized, { action: 'uploaded', reservationId: 'reservation-legacy' });

  const denied = legacyStreamRetryDisposition({
    canonicalMediaId: mediaId,
    familyId,
    userId: 'parent-1',
    providerUid: 'legacy-stream-1',
    reservation: {
      id: 'reservation-other',
      family_id: 'another-family',
      user_id: 'parent-1',
      provider: null,
      provider_object_id: null,
      status: 'reserved',
    },
    media: {
      id: mediaId,
      family_id: familyId,
      owner_user_id: 'parent-1',
      stream_uid: 'legacy-stream-1',
    },
    video: { uid: 'legacy-stream-1', meta: { familyId }, status: { state: 'ready' } },
  });
  assertEquals(denied, { action: 'invalid', reservationId: null });

  const arbitraryUid = legacyStreamRetryDisposition({
    canonicalMediaId: mediaId,
    familyId,
    userId: 'parent-1',
    providerUid: 'unrelated-stream',
    reservation: {
      id: 'reservation-legacy',
      family_id: familyId,
      user_id: 'parent-1',
      provider: 'stream',
      provider_object_id: 'unrelated-stream',
      status: 'reserved',
    },
    media: {
      id: mediaId,
      family_id: familyId,
      owner_user_id: 'parent-1',
      stream_uid: 'legacy-stream-1',
    },
    video: { uid: 'unrelated-stream', meta: { familyId }, status: { state: 'ready' } },
  });
  assertEquals(arbitraryUid, { action: 'invalid', reservationId: null });
});

Deno.test('provider deletion replays cleanup before replacement without local provider state', async () => {
  let released: { reservationId: string; providerUid: string } | null = null;
  const reservation = {
    id: 'reservation-1',
    family_id: familyId,
    user_id: 'parent-1',
    canonical_media_id: mediaId,
    transport: 'video-stream',
    status: 'reserved',
    provider: 'stream',
    provider_object_id: 'stream-1',
    provider_cleanup_required: true,
  };
  const reconciled = await reconcileAbsentProviderCleanup({
    canonicalMediaId: mediaId,
    familyId,
    userId: 'parent-1',
    providerUid: 'stream-1',
    reservation,
    video: null,
    confirmAndRelease: async (reservationId, providerUid) => {
      released = { reservationId, providerUid };
    },
  });

  assertEquals(reconciled, true);
  assertEquals(released, { reservationId: 'reservation-1', providerUid: 'stream-1' });
  assertEquals(await reconcileAbsentProviderCleanup({
    canonicalMediaId: mediaId,
    familyId,
    userId: 'another-parent',
    providerUid: 'stream-1',
    reservation,
    video: null,
    confirmAndRelease: async () => { throw new Error('must not release'); },
  }), false);
  assertEquals(await reconcileAbsentProviderCleanup({
    canonicalMediaId: mediaId,
    familyId,
    userId: 'parent-1',
    providerUid: 'stream-1',
    reservation,
    video: video('pendingupload'),
    confirmAndRelease: async () => { throw new Error('must not release'); },
  }), false);
});

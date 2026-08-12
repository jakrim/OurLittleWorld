import { assertEquals } from 'jsr:@std/assert@1';

import {
  canonicalStreamCreator,
  canonicalStreamUploadUrl,
  legacyStreamRetryDisposition,
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

Deno.test('an accepted upload is reconciled instead of reusing its one-time URL', () => {
  const options = { canonicalMediaId: mediaId, familyId, providerState: 'uploading' };
  assertEquals(streamVideoDisposition(video('queued'), options).action, 'uploaded');
  assertEquals(streamVideoDisposition(video('pendingupload'), options).action, 'uploading');
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

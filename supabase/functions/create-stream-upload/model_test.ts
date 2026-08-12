import { assertEquals } from 'jsr:@std/assert@1';

import { canonicalStreamCreator, streamVideoDisposition } from './model.ts';

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

Deno.test('pending uploads reuse a persisted URL but replace an unpersisted URL', () => {
  const options = { canonicalMediaId: mediaId, familyId, nowMs: Date.parse('2026-08-12T17:00:00.000Z') };
  assertEquals(streamVideoDisposition(video('pendingupload'), {
    ...options,
    providerState: 'prepared',
  }).action, 'prepared');
  assertEquals(streamVideoDisposition(video('pendingupload'), options).action, 'replace');
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

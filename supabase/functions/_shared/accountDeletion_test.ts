import {
  assertEquals,
  assertThrows,
} from 'jsr:@std/assert@1';

import {
  normalizeFamilyIds,
  normalizeFamilyStoragePaths,
  normalizeOtp,
  normalizeProviderObjectIds,
  normalizeStreamUids,
  providerCleanupSummary,
  publicDeletionPreview,
  requireDeletionConfirmation,
  splitStorageListing,
} from './accountDeletion.ts';

const FAMILY_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_FAMILY_ID = '20000000-0000-4000-8000-000000000002';

Deno.test('account deletion confirmation is exact and explicit', () => {
  requireDeletionConfirmation('DELETE');
  assertThrows(() => requireDeletionConfirmation('delete'));
  assertThrows(() => requireDeletionConfirmation('DELETE MY PHOTOS'));
});

Deno.test('OTP normalization accepts only a six digit email code', () => {
  assertEquals(normalizeOtp('123 456'), '123456');
  assertEquals(normalizeOtp('12345'), null);
  assertEquals(normalizeOtp('12345a'), null);
});

Deno.test('storage selection cannot cross the target family prefix', () => {
  assertEquals(
    normalizeFamilyStoragePaths(FAMILY_ID, [
      `${FAMILY_ID}/moments/a/image-full/file.jpg`,
      `${OTHER_FAMILY_ID}/moments/b/image-full/private.jpg`,
      `${FAMILY_ID}/../${OTHER_FAMILY_ID}/private.jpg`,
      '/not-a-family/file.jpg',
    ]),
    [`${FAMILY_ID}/moments/a/image-full/file.jpg`],
  );
});

Deno.test('recursive storage listing separates folders and files inside one family', () => {
  assertEquals(
    splitStorageListing(FAMILY_ID, FAMILY_ID, [
      { name: 'moments', id: null, metadata: null },
      { name: 'legacy.jpg', id: 'storage-id', metadata: { size: 10 } },
      { name: `../${OTHER_FAMILY_ID}`, id: null, metadata: null },
    ]),
    {
      files: [`${FAMILY_ID}/legacy.jpg`],
      folders: [`${FAMILY_ID}/moments`],
    },
  );
});

Deno.test('provider identifiers are bounded and deduplicated', () => {
  assertEquals(normalizeFamilyIds([FAMILY_ID, FAMILY_ID, 'bad']), [FAMILY_ID]);
  assertEquals(normalizeStreamUids(['abc12345', 'abc12345', '../bad']), ['abc12345']);
  assertEquals(normalizeProviderObjectIds(['safe-object_1', 'safe-object_1', '../bad']), ['safe-object_1']);
});

Deno.test('public preview and provider audit summary contain aggregate values only', () => {
  assertEquals(publicDeletionPreview({
    family_count: 2,
    sole_writer_count: 1,
    additional_writer_count: 1,
    circle_count: 0,
    store_subscription_action_required: true,
    stripe_cancellation_required: false,
    family_id: FAMILY_ID,
  }), {
    familyCount: 2,
    soleWriterCount: 1,
    additionalWriterCount: 1,
    circleCount: 0,
    storeSubscriptionActionRequired: true,
    stripeCancellationRequired: false,
  });
  assertEquals(providerCleanupSummary({
    storageDeleted: 4.9,
    streamDeleted: -2,
    r2DeleteRequests: 1,
    stripeCanceled: 1,
  }), {
    storage_deleted_count: 4,
    stream_deleted_count: 0,
    r2_delete_request_count: 1,
    stripe_canceled_count: 1,
  });
});

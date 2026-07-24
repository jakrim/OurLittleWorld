import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCOUNT_DELETION_COPY,
  accountDeletionAsyncStorageKeys,
  canSubmitAccountDeletion,
  createDeletionRequestId,
  deletionImpactLines,
  normalizeDeletionPreview,
} from '../../src/accountDeletionModel.js';

test('account deletion copy preserves the device-library and shared-history boundaries', () => {
  assert.match(ACCOUNT_DELETION_COPY.cameraRoll, /never deleted/i);
  assert.match(ACCOUNT_DELETION_COPY.sharedHistory, /another co-parent remains/i);
  assert.match(ACCOUNT_DELETION_COPY.exportScope, /video, audio, and sharing limits/i);
  assert.match(ACCOUNT_DELETION_COPY.multipleArchives, /each sole-parent family archive/i);
  assert.match(ACCOUNT_DELETION_COPY.storeSubscription, /does not cancel/i);
  assert.match(ACCOUNT_DELETION_COPY.finalWarning, /cannot be undone/i);
});

test('account deletion requires a six digit OTP and exact destructive confirmation', () => {
  assert.equal(canSubmitAccountDeletion({ otp: '123456', confirmation: 'DELETE' }), true);
  assert.equal(canSubmitAccountDeletion({ otp: '12345', confirmation: 'DELETE' }), false);
  assert.equal(canSubmitAccountDeletion({ otp: '123456', confirmation: 'delete' }), false);
  assert.equal(canSubmitAccountDeletion({ otp: '123456', confirmation: 'DELETE', busy: true }), false);
});

test('preview normalization and impact copy cover sole, co-parent, and circle roles', () => {
  const preview = normalizeDeletionPreview({
    family_count: 3,
    sole_writer_count: 1,
    additional_writer_count: 1,
    circle_count: 1,
    store_subscription_action_required: true,
  });
  assert.deepEqual(preview, {
    familyCount: 3,
    soleWriterCount: 1,
    additionalWriterCount: 1,
    circleCount: 1,
    storeSubscriptionActionRequired: true,
    stripeCancellationRequired: false,
  });
  assert.deepEqual(deletionImpactLines(preview), [
    '1 family archive permanently deleted',
    '1 shared family archive preserved for another co-parent',
    '1 view-only membership removed',
  ]);
});

test('local purge selection removes account state but preserves theme preference', () => {
  const familyId = '10000000-0000-4000-8000-000000000001';
  const userId = '20000000-0000-4000-8000-000000000002';
  assert.deepEqual(accountDeletionAsyncStorageKeys([
    'olw:theme-preferences:v1',
    `olw:reference:${familyId}:${userId}`,
    `custom:${familyId}:cache`,
    'unrelated:key',
  ], { familyId, userId }), [
    `olw:reference:${familyId}:${userId}`,
    `custom:${familyId}:cache`,
  ]);
});

test('deletion request identity uses secure bytes when randomUUID is unavailable', () => {
  const id = createDeletionRequestId(null, (bytes) => {
    bytes.set(Array.from({ length: 16 }, (_, index) => index));
    return bytes;
  });
  assert.equal(id, '00010203-0405-4607-8809-0a0b0c0d0e0f');
  assert.throws(
    () => createDeletionRequestId(null, null),
    /Secure account deletion confirmation is unavailable/,
  );
});

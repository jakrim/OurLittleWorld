import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCOUNT_DELETION_COPY,
  accountDeletionAsyncStorageKeys,
  canSubmitAccountDeletion,
  normalizeDeletionPreview,
} from '../../src/accountDeletionModel.js';

test('deletion remains available without weakening confirmation or export trust', () => {
  const preview = normalizeDeletionPreview({
    family_count: 2,
    sole_writer_count: 1,
    additional_writer_count: 1,
    store_subscription_action_required: true,
  });
  assert.deepEqual(preview, {
    familyCount: 2,
    soleWriterCount: 1,
    additionalWriterCount: 1,
    circleCount: 0,
    storeSubscriptionActionRequired: true,
    stripeCancellationRequired: false,
  });
  assert.match(ACCOUNT_DELETION_COPY.exportScope, /video, audio, and sharing limits/i);
  assert.equal(canSubmitAccountDeletion({ otp: '123456', confirmation: 'DELETE' }), true);
  assert.equal(canSubmitAccountDeletion({ otp: '123456', confirmation: 'delete' }), false);
});

test('account cleanup removes scoped private state but preserves device preferences', () => {
  assert.deepEqual(accountDeletionAsyncStorageKeys([
    'olw:theme-preferences:v1',
    'olw:reference:family-a:user-a',
    'olw:tonight-notifications:v1:family-a:user-a',
    'unrelated',
  ], { familyId: 'family-a', userId: 'user-a' }), [
    'olw:reference:family-a:user-a',
    'olw:tonight-notifications:v1:family-a:user-a',
  ]);
});

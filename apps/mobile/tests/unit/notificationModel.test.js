import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeNotificationRoute, notificationPromptStorageKey } from '../../src/notificationModel.js';

test('notification deep links allow only protected push routes', () => {
  assert.equal(normalizeNotificationRoute('/digest'), '/digest');
  assert.equal(normalizeNotificationRoute('prompt?day=2026-07-06'), '/prompt?day=2026-07-06');
  assert.equal(normalizeNotificationRoute('ourlittleworld://digest'), '/digest');
  assert.equal(normalizeNotificationRoute('ourlittleworld://push/review'), '/review');
  assert.equal(normalizeNotificationRoute('/letters#open'), '/letters#open');
});

test('notification deep links reject unsupported or external routes', () => {
  assert.equal(normalizeNotificationRoute('/moment/123'), null);
  assert.equal(normalizeNotificationRoute('/welcome'), null);
  assert.equal(normalizeNotificationRoute('https://example.com/digest'), null);
  assert.equal(normalizeNotificationRoute('javascript:alert(1)'), null);
  assert.equal(normalizeNotificationRoute(null), null);
});

test('notification permission prompt storage is scoped per family and user', () => {
  assert.equal(
    notificationPromptStorageKey({ familyId: 'fam1', userId: 'user1' }),
    'olw:push-permission:v1:fam1:user1',
  );
});

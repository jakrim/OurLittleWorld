import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupNotificationRows,
  normalizeNotificationCenterRows,
  notificationCategoryMeta,
} from '../../src/notificationCenterModel.js';

test('notification center groups rows by today, yesterday, then date', () => {
  const now = new Date('2026-07-06T16:00:00Z');
  const sections = groupNotificationRows([
    { id: '1', category: 'partner_activity', title: 'Dana answered', deep_link: '/prompt', created_at: '2026-07-06T15:59:00Z' },
    { id: '2', category: 'weekly_digest', title: 'Digest ready', deep_link: '/digest', created_at: '2026-07-05T13:00:00Z' },
    { id: '3', category: 'letter_openable', title: 'Letter ready', deep_link: '/letters', created_at: '2026-07-01T13:00:00Z' },
  ], now);

  assert.deepEqual(sections.map((section) => section.title), ['Today', 'Yesterday', 'Jul 1']);
  assert.equal(sections[0].rows[0].relativeTime, '1m ago');
});

test('notification center normalizes rows and drops incomplete rows', () => {
  const rows = normalizeNotificationCenterRows([
    { id: 'ok', category: 'new_moments', title: '4 new moments found', deep_link: '/review', thumbnail_url: 'photo.jpg' },
    { id: 'missing-route', title: 'No route' },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].thumbnailUrl, 'photo.jpg');
});

test('notification category metadata falls back for unknown categories', () => {
  assert.equal(notificationCategoryMeta('partner_activity').icon, 'people-outline');
  assert.equal(notificationCategoryMeta('unknown').icon, 'notifications-outline');
});

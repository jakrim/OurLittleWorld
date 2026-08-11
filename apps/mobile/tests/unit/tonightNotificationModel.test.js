import assert from 'node:assert/strict';
import test from 'node:test';

import {
  markTonightNotificationScheduled,
  nextTonightNotificationDate,
  scheduledRequestCountForLocalDay,
  shouldScheduleTonightNotification,
  tonightNotificationContent,
  TONIGHT_NOTIFICATION_ROUTE,
} from '../../src/tonightNotificationModel.js';

const session = {
  sessionId: 'queue-1',
  localDay: '2026-07-20',
  timezone: 'America/New_York',
  status: 'active',
  completed: false,
  continuation: false,
  items: [{ state: 'shown' }, { state: 'queued' }, { state: 'unavailable' }, { state: 'kept' }],
};
const preferences = {
  quietStart: '21:00',
  quietEnd: '08:00',
  categories: { tonight_picks: true },
};

test('real primary writer queues schedule once with privacy-safe native content', () => {
  const now = new Date('2026-07-20T17:00:00Z');
  assert.equal(shouldScheduleTonightNotification({
    session, preferences, role: 'creator', entitlementActive: true, timezone: session.timezone, now,
  }), true);
  assert.deepEqual(tonightNotificationContent(session), {
    title: "Tonight's memories",
    body: '3 memories are ready for a quiet look tonight.',
    data: {
      route: TONIGHT_NOTIFICATION_ROUTE,
      category: 'tonight_picks',
      queue_state: 'ready',
      queue_count: 3,
      queue_date: '2026-07-20',
    },
  });
  const state = markTonightNotificationScheduled(null, session, { identifier: 'native-1', scheduledAt: now });
  assert.equal(shouldScheduleTonightNotification({
    session, preferences, state, role: 'creator', entitlementActive: true, timezone: session.timezone, now,
  }), false);
});

test('continuations, empty, Circle, lapsed, disabled and capped queues do not schedule', () => {
  const base = { session, preferences, role: 'partner', entitlementActive: true, timezone: session.timezone };
  assert.equal(shouldScheduleTonightNotification({ ...base, session: { ...session, continuation: true } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, session: { ...session, items: [{ state: 'kept' }] } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, session: { ...session, status: 'completed', completed: true } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, session: { ...session, status: 'expired' } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, role: 'circle' }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, entitlementActive: false }), false);
  assert.equal(shouldScheduleTonightNotification({
    ...base,
    preferences: { ...preferences, categories: { tonight_picks: false } },
  }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, notificationsScheduledToday: 2 }), false);
});

test('family-local scheduling and daily counts remain stable across DST', () => {
  assert.equal(nextTonightNotificationDate({
    now: new Date('2026-03-08T12:00:00Z'), timezone: 'America/New_York', preferences,
  }).toISOString(), '2026-03-09T00:00:00.000Z');
  assert.equal(nextTonightNotificationDate({
    now: new Date('2026-11-01T13:00:00Z'), timezone: 'America/New_York', preferences,
  }).toISOString(), '2026-11-02T01:00:00.000Z');
  assert.equal(nextTonightNotificationDate({
    now: new Date('2026-07-21T03:00:00Z'), timezone: 'America/New_York', preferences,
  }).toISOString(), '2026-07-22T00:00:00.000Z');
  const requests = [
    { trigger: { timestamp: Date.parse('2026-07-21T00:30:00Z') } },
    { trigger: { date: Date.parse('2026-07-21T01:00:00Z') } },
    { trigger: { value: Date.parse('2026-07-21T15:00:00Z') / 1000 } },
    { trigger: { timestamp: 'not-a-date' } },
  ];
  assert.equal(scheduledRequestCountForLocalDay(requests, {
    localDay: '2026-07-20', timezone: 'America/New_York',
  }), 2);
  assert.equal(scheduledRequestCountForLocalDay(requests, {
    localDay: '2026-07-21', timezone: 'America/New_York',
  }), 1);
});

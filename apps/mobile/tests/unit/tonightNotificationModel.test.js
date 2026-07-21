import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  markTonightNotificationScheduled,
  nextTonightNotificationDate,
  scheduledRequestCountForLocalDay,
  shouldScheduleTonightNotification,
  tonightNotificationCopy,
  TONIGHT_NOTIFICATION_ROUTE,
} from '../../src/tonightNotificationModel.js';

const session = {
  sessionId: 'queue-1',
  localDay: '2026-07-20',
  timezone: 'America/New_York',
  status: 'active',
  completed: false,
  items: [
    { state: 'shown' },
    { state: 'queued' },
    { state: 'unavailable' },
    { state: 'kept' },
  ],
};
const preferences = {
  quietStart: '21:00',
  quietEnd: '08:00',
  categories: { tonight_picks: true },
};

test('real non-empty writer queue schedules once with calm count copy and /tonight notification source', () => {
  const now = new Date('2026-07-20T17:00:00Z');
  assert.equal(shouldScheduleTonightNotification({
    session, preferences, role: 'creator', entitlementActive: true, timezone: session.timezone, now,
  }), true);
  assert.deepEqual(tonightNotificationCopy(session), {
    title: "Tonight's memories",
    body: '3 memories are ready for a quiet look tonight.',
  });
  assert.equal(TONIGHT_NOTIFICATION_ROUTE, '/tonight?source=notification');

  const state = markTonightNotificationScheduled(null, session, { identifier: 'native-1', scheduledAt: now });
  assert.equal(shouldScheduleTonightNotification({
    session, preferences, state, role: 'creator', entitlementActive: true, timezone: session.timezone, now,
  }), false);
});

test('empty, completed, expired, Circle, lapsed, disabled and capped queues do not schedule', () => {
  const base = { session, preferences, role: 'partner', entitlementActive: true, timezone: session.timezone };
  assert.equal(shouldScheduleTonightNotification({ ...base, session: { ...session, items: [{ state: 'kept' }] } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, session: { ...session, status: 'completed', completed: true } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, session: { ...session, status: 'expired' } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, role: 'circle' }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, entitlementActive: false }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, preferences: { ...preferences, categories: { tonight_picks: false } } }), false);
  assert.equal(shouldScheduleTonightNotification({ ...base, notificationsScheduledToday: 2 }), false);
});

test('family-local scheduling is stable across spring-forward and fall-back DST', () => {
  const spring = nextTonightNotificationDate({
    now: new Date('2026-03-08T12:00:00Z'),
    timezone: 'America/New_York',
    preferences,
  });
  assert.equal(spring.toISOString(), '2026-03-09T00:00:00.000Z');

  const fall = nextTonightNotificationDate({
    now: new Date('2026-11-01T13:00:00Z'),
    timezone: 'America/New_York',
    preferences,
  });
  assert.equal(fall.toISOString(), '2026-11-02T01:00:00.000Z');
});

test('quiet-hour relaunch rolls an unfinished queue to the next safe evening', () => {
  const next = nextTonightNotificationDate({
    now: new Date('2026-07-21T03:00:00Z'), // 11 PM in New York
    timezone: 'America/New_York',
    preferences,
  });
  assert.equal(next.toISOString(), '2026-07-22T00:00:00.000Z');
});

test('native scheduler metadata excludes session, asset and draft identifiers', () => {
  const source = readFileSync(new URL('../../src/tonightNotifications.js', import.meta.url), 'utf8');
  assert.match(source, /queue_state: 'ready'/);
  assert.match(source, /queue_count:/);
  assert.doesNotMatch(source, /data:\s*\{[^}]*sessionId|data:\s*\{[^}]*assetId|data:\s*\{[^}]*draft/);
});

test('device scheduled-request count honors the family-local daily hard cap', () => {
  const requests = [
    { trigger: { timestamp: Date.parse('2026-07-21T00:30:00Z') } }, // July 20 in New York
    { trigger: { date: Date.parse('2026-07-21T01:00:00Z') } },
    { trigger: { value: Date.parse('2026-07-21T15:00:00Z') / 1000 } }, // July 21 in New York
    { trigger: { timestamp: 'not-a-date' } },
  ];
  assert.equal(scheduledRequestCountForLocalDay(requests, {
    localDay: '2026-07-20',
    timezone: 'America/New_York',
  }), 2);
  assert.equal(scheduledRequestCountForLocalDay(requests, {
    localDay: '2026-07-21',
    timezone: 'America/New_York',
  }), 1);
});

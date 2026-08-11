import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalyticsEvent } from '../../src/analyticsEventsModel.js';
import { canAccessPrivateDiscovery } from '../../src/candidateLedgerModel.js';
import { tonightCompletionProperties } from '../../src/curatedMemoryAnalyticsModel.js';
import { recommendedNightlySize } from '../../src/firstYearCatchupModel.js';
import { isNightlySessionContinuation } from '../../src/nightlySessionModel.js';
import { readPostgrestRelationshipCompatible } from '../../src/postgrestCompatibility.js';
import { shouldScheduleTonightNotification } from '../../src/tonightNotificationModel.js';

test('relationship cache misses retry the same family scope through base plus relations', async () => {
  const calls = [];
  const rows = await readPostgrestRelationshipCompatible({
    familyId: 'family-a',
    embeddedSelect: 'id, child(*)',
    baseSelect: 'id',
    createQuery: (select) => ({
      select,
      familyId: null,
      eq(column, value) {
        assert.equal(column, 'family_id');
        this.familyId = value;
        return this;
      },
    }),
    applyQuery: async (query) => {
      calls.push({ select: query.select, familyId: query.familyId });
      return query.select === 'id, child(*)'
        ? { data: null, error: { code: 'PGRST200' } }
        : { data: [{ id: 'moment-a' }], error: null };
    },
    attachRelations: async (familyId, baseRows) => baseRows.map((row) => ({ ...row, familyId, child: [] })),
  });
  assert.deepEqual(calls, [
    { select: 'id, child(*)', familyId: 'family-a' },
    { select: 'id', familyId: 'family-a' },
  ]);
  assert.deepEqual(rows, [{ id: 'moment-a', familyId: 'family-a', child: [] }]);
});

test('continuation is an explicit durable state across pacing, analytics, and notifications', () => {
  const session = {
    sessionId: 'continued',
    localDay: '2026-08-10',
    timezone: 'America/New_York',
    status: 'active',
    completed: false,
    continuation: isNightlySessionContinuation({ is_continuation: 1, seed: 'unrelated' }),
    createdAt: '2026-08-10T20:00:00Z',
    items: [{ state: 'queued' }],
  };
  assert.equal(session.continuation, true);
  assert.equal(recommendedNightlySize({ eligibleCount: 100, completedSessionCount: 20, continuation: true }), 3);
  assert.equal(shouldScheduleTonightNotification({
    session,
    preferences: { categories: { tonight_picks: true } },
    role: 'creator',
    entitlementActive: true,
  }), false);
  assert.equal(tonightCompletionProperties(session).continuation, true);
});

test('private discovery and analytics fail closed at their public interfaces', () => {
  assert.equal(canAccessPrivateDiscovery({ role: 'circle', entitlementActive: true }), false);
  assert.equal(canAccessPrivateDiscovery({ role: 'creator', entitlementActive: false }), false);
  assert.equal(canAccessPrivateDiscovery({ role: 'partner', entitlementActive: true }), true);
  assert.throws(() => buildAnalyticsEvent('tonight_completed', {
    surface: 'tonight',
    kept_count_bucket: '1',
    skipped_count_bucket: '0',
    unavailable_count_bucket: '0',
    enriched_count_bucket: '0',
    duration_bucket: 'under_1m',
    continuation: false,
    assetId: 'private-photo-id',
  }), /forbidden/i);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  durationBucket,
  tonightCompletionProperties,
  tonightDecisionProperties,
  tonightOpenProperties,
} from '../../src/curatedMemoryAnalyticsModel.js';

test('Tonight analytics exposes only coarse fixed values and no private identifiers', () => {
  const item = {
    assetId: 'private-device-asset',
    localUri: 'file:///private/photo.jpg',
    mediaType: 'video',
    reasonCode: 'clear_video',
    draftText: 'private words',
    draftVoice: { uri: 'file:///private/voice.m4a' },
  };
  const event = tonightDecisionProperties(item, 'kept', { retried: true });
  assert.deepEqual(event, {
    surface: 'tonight',
    decision: 'kept',
    media_kind: 'video',
    has_enrichment: true,
    retry_state: 'retry',
  });
  assert.doesNotMatch(JSON.stringify(event), /private|file:|asset|uri|words/i);
});

test('open and completion analytics distinguish resume without session identity', () => {
  const session = {
    sessionId: 'private-session',
    currentPosition: 2,
    createdAt: '2026-07-20T20:00:00.000Z',
    items: [
      { state: 'kept', textCommitState: 'saved' },
      { state: 'skipped' },
      { state: 'unavailable' },
    ],
  };
  assert.deepEqual(tonightOpenProperties(session, { openSource: 'notification' }), {
    surface: 'tonight',
    open_source: 'notification',
    queue_count_bucket: '2_4',
    resume_state: 'resumed',
  });
  const completed = tonightCompletionProperties(session, { completedAt: new Date('2026-07-20T20:04:00.000Z') });
  assert.deepEqual(completed, {
    surface: 'tonight',
    kept_count_bucket: '1',
    skipped_count_bucket: '1',
    unavailable_count_bucket: '1',
    enriched_count_bucket: '1',
    duration_bucket: '3_5m',
    continuation: false,
  });
  assert.doesNotMatch(JSON.stringify({ ...completed, ...tonightOpenProperties(session) }), /private-session/);
});

test('duration bands are stable and reject invalid clocks', () => {
  const start = '2026-07-20T20:00:00.000Z';
  assert.equal(durationBucket(start, '2026-07-20T20:00:59.000Z'), 'under_1m');
  assert.equal(durationBucket(start, '2026-07-20T20:02:00.000Z'), '1_3m');
  assert.equal(durationBucket(start, '2026-07-20T20:04:00.000Z'), '3_5m');
  assert.equal(durationBucket(start, '2026-07-20T20:08:00.000Z'), '5_10m');
  assert.equal(durationBucket(start, '2026-07-20T20:15:00.000Z'), '10m_plus');
  assert.equal(durationBucket('bad', 'also-bad'), 'unknown');
});

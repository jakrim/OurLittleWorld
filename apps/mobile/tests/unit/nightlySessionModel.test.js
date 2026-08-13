import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNightlyQueue } from '../../src/nightlyQueueModel.js';
import {
  nightlySessionScanTrigger,
  shouldPrepareNightlySession,
} from '../../src/nightlySessionModel.js';

const NOW = new Date('2026-08-12T20:00:00.000Z').getTime();

test('focused Today reacts to durable analysis and waits for three strong candidates', () => {
  const beforeAnalysis = nightlySessionScanTrigger({ phase: 'scanning', seen: 60, checked: 0 });
  const fetchedOnly = nightlySessionScanTrigger({ phase: 'scanning', seen: 120, checked: 0 });
  const afterDurableAnalysis = nightlySessionScanTrigger({ phase: 'scanning', seen: 120, checked: 60 });
  assert.deepEqual(beforeAnalysis, fetchedOnly);
  assert.notDeepEqual(fetchedOnly, afterDurableAnalysis);
  assert.equal(shouldPrepareNightlySession({
    scanPhase: 'scanning',
    summary: { sessionId: null, status: 'available', count: 0 },
  }), false);
  assert.equal(shouldPrepareNightlySession({
    scanPhase: 'scanning',
    summary: { sessionId: null, status: 'available', count: 2 },
  }), false);
  const queue = buildNightlyQueue([
    strongCandidate('strong-a', NOW, '2026-08-12'),
    strongCandidate('strong-b', NOW - 86400000, '2026-08-11'),
    strongCandidate('strong-c', NOW - 2 * 86400000, '2026-08-10'),
  ], { nowMs: NOW, seed: 'first-ready-set', maxItems: 3 });
  assert.equal(queue.length, 3);
  assert.equal(shouldPrepareNightlySession({
    scanPhase: 'scanning',
    summary: { sessionId: null, status: 'available', count: queue.length },
  }), true);
});

test('a terminal scan surfaces fewer strong candidates without padding', () => {
  const queue = buildNightlyQueue([
    strongCandidate('strong-a', NOW, '2026-08-12'),
    strongCandidate('strong-b', NOW - 86400000, '2026-08-11'),
  ], { nowMs: NOW, seed: 'truthful-short-set', maxItems: 3 });
  assert.equal(queue.length, 2);
  assert.equal(shouldPrepareNightlySession({
    scanPhase: 'scanning',
    summary: { sessionId: null, status: 'available', count: queue.length },
  }), false);
  assert.equal(shouldPrepareNightlySession({
    scanPhase: 'done',
    summary: { sessionId: null, status: 'available', count: queue.length },
  }), true);
  assert.equal(shouldPrepareNightlySession({
    scanPhase: 'done',
    summary: { sessionId: null, status: 'available', count: 0 },
  }), false);
});

test('an existing nightly session stays readable while discovery continues', () => {
  assert.equal(shouldPrepareNightlySession({
    scanPhase: 'scanning',
    summary: { sessionId: 'session-a', status: 'active', count: 1 },
  }), true);
});

function strongCandidate(assetId, captureTimeMs, localDay) {
  return {
    assetId,
    mediaType: 'image',
    availability: 'available',
    lifecycleState: 'eligible',
    captureTimeMs,
    localDay,
    identityScore: 0.95,
    captureQuality: 0.9,
    faceSizeRatio: 0.12,
    sharpness: 0.3,
    eventClusterKey: `cluster-${assetId}`,
    clusterMemberCount: 1,
  };
}

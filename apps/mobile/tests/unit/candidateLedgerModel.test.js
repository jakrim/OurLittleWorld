import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCandidateClusters,
  canAccessPrivateDiscovery,
  CANDIDATE_BATCH_SIZE,
  CANDIDATE_LIVE_MATCH_LIMIT,
  CANDIDATE_STATES,
  isFinalParentDecision,
  normalizeDiscoveryCandidate,
  SELECTION_REASONS,
} from '../../src/candidateLedgerModel.js';

test('candidate normalization keeps private evidence local and uses explicit lifecycle state', () => {
  const candidate = normalizeDiscoveryCandidate({
    assetId: 'fixture-photo-1',
    mediaType: 'image',
    localUri: 'file:///fixture/photo-1.jpg',
    creationTime: new Date(2026, 0, 3, 10).getTime(),
    score: 0.92,
    captureQuality: 0.81,
    faceCount: 1,
    visualFingerprint: [0.1, 0.2],
  }, { scanKey: 'scan-fixture', now: new Date('2026-07-18T12:00:00Z') });

  assert.equal(candidate.lifecycleState, 'eligible');
  assert.equal(candidate.identityBand, 'clear');
  assert.equal(candidate.localDay, '2026-01-03');
  assert.equal(candidate.scanKey, 'scan-fixture');
  assert.equal(candidate.visualFingerprintJson, '[0.1,0.2]');
  assert.ok(CANDIDATE_STATES.includes(candidate.lifecycleState));
});

test('uncertain and unavailable media do not enter the eligible lane', () => {
  const uncertain = normalizeDiscoveryCandidate({
    assetId: 'fixture-uncertain', creationTime: Date.now(), score: 0.6, captureQuality: 0.9,
  });
  const unavailable = normalizeDiscoveryCandidate({
    assetId: 'fixture-cloud', creationTime: Date.now(), score: 0.99, availability: 'icloud_pending',
  });

  assert.equal(uncertain.lifecycleState, 'rejected');
  assert.equal(unavailable.lifecycleState, 'unavailable');
  assert.equal(unavailable.availability, 'icloud_pending');
});

test('cluster representative is deterministic and quality-led', () => {
  const base = new Date(2026, 4, 2, 9).getTime();
  const candidates = [
    normalizeDiscoveryCandidate({ assetId: 'burst-a', creationTime: base, score: 0.95, captureQuality: 0.4 }),
    normalizeDiscoveryCandidate({ assetId: 'burst-b', creationTime: base + 1000, score: 0.9, captureQuality: 0.9 }),
    normalizeDiscoveryCandidate({ assetId: 'burst-c', creationTime: base + 2000, score: 0.99, captureQuality: 0.7 }),
  ];
  const [cluster] = buildCandidateClusters(candidates);

  assert.equal(cluster.memberCount, 3);
  assert.equal(cluster.representativeAssetId, 'burst-b');
  assert.equal(cluster.members.filter((item) => item.isRepresentative).length, 1);
});

test('private discovery access is writer and entitlement scoped', () => {
  assert.equal(canAccessPrivateDiscovery({ role: 'creator', entitlementActive: true }), true);
  assert.equal(canAccessPrivateDiscovery({ role: 'partner', entitlementActive: true }), true);
  assert.equal(canAccessPrivateDiscovery({ role: 'circle', entitlementActive: true }), false);
  assert.equal(canAccessPrivateDiscovery({ role: 'creator', entitlementActive: false }), false);
});

test('ledger constants bound scan batches and live JavaScript media state', () => {
  assert.ok(CANDIDATE_BATCH_SIZE <= 100);
  assert.ok(CANDIDATE_LIVE_MATCH_LIMIT < 5000);
  assert.equal(isFinalParentDecision('kept'), true);
  assert.equal(isFinalParentDecision('skipped'), true);
  assert.equal(isFinalParentDecision('rejected'), false);
  assert.equal(isFinalParentDecision('eligible'), false);
  assert.deepEqual(Object.keys(SELECTION_REASONS).sort(), [
    'best_burst', 'best_day', 'clear_video', 'distinct_standout', 'first_year_coverage', 'parent_pick',
  ]);
});

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import {
  buildNightlyQueue,
  meetsNightlyQueueQuality,
  NIGHTLY_QUEUE_FACE_SIZE_RATIO_FLOOR,
  NIGHTLY_QUEUE_IDENTITY_FLOOR,
  NIGHTLY_QUEUE_MAX,
  NIGHTLY_QUEUE_QUALITY_FLOOR,
  NIGHTLY_QUEUE_SHARPNESS_FLOOR,
  parentReasonLabel,
  shouldWithdrawStaleNightlyItem,
} from '../../src/nightlyQueueModel.js';

const NOW = new Date(2026, 6, 18, 20).getTime();

test('5,000-item library creates a bounded deterministic recent and historical queue', () => {
  const candidates = fixtureCandidates(5000);
  const started = performance.now();
  const first = buildNightlyQueue(candidates, { nowMs: NOW, seed: '2026-07-18' });
  const durationMs = performance.now() - started;
  const second = buildNightlyQueue(candidates, { nowMs: NOW, seed: '2026-07-18' });

  console.info(`release1-performance queue_5000_ms=${durationMs.toFixed(1)} queue_size=${first.length}`);

  assert.deepEqual(second, first);
  assert.ok(first.length >= 3 && first.length <= NIGHTLY_QUEUE_MAX);
  assert.ok(first.some((item) => candidates.find((candidate) => candidate.assetId === item.assetId).captureTimeMs >= NOW - (48 * 3600000)));
  assert.ok(first.some((item) => candidates.find((candidate) => candidate.assetId === item.assetId).captureTimeMs < NOW - (48 * 3600000)));
  assert.ok(first.some((item) => item.reasonCode === 'clear_video'));
  assert.ok(durationMs < 750, `queue generation took ${durationMs.toFixed(1)}ms`);
});

test('one strongest daily anchor and distinct event survive while burst lookalikes collapse', () => {
  const day = '2026-06-01';
  const base = new Date(2026, 5, 1, 10).getTime();
  const queue = buildNightlyQueue([
    candidate('weak-burst', base, 0.3, { localDay: day, eventClusterKey: 'burst-1' }),
    candidate('best-burst', base + 1000, 0.95, { localDay: day, eventClusterKey: 'burst-1', clusterMemberCount: 14 }),
    candidate('distinct-smile', base + 3600000, 0.92, { localDay: day, eventClusterKey: 'event-2' }),
    candidate('other-day', base - 86400000, 0.8, { localDay: '2026-05-31', eventClusterKey: 'event-3' }),
  ], { nowMs: NOW, seed: 'fixture' });

  assert.equal(queue.some((item) => item.assetId === 'weak-burst'), false);
  assert.equal(queue.some((item) => item.assetId === 'best-burst'), true);
  assert.equal(queue.some((item) => item.assetId === 'distinct-smile'), true);
  assert.equal(queue.find((item) => item.assetId === 'best-burst').reasonCode, 'best_burst');
});

test('daily anchors are stable across scan order and one day cannot crowd out other uncovered days', () => {
  const rows = [
    candidate('day-a-best', NOW - 10 * 86400000, 0.96, { localDay: '2026-07-08', coverageNeeded: true }),
    candidate('day-a-other', NOW - 10 * 86400000 + 60000, 0.8, { localDay: '2026-07-08', coverageNeeded: true, eventClusterKey: 'a-other' }),
    candidate('day-b-best', NOW - 11 * 86400000, 0.9, { localDay: '2026-07-07', coverageNeeded: true }),
    candidate('day-c-best', NOW - 12 * 86400000, 0.88, { localDay: '2026-07-06', coverageNeeded: true }),
  ];
  const first = buildNightlyQueue(rows, { nowMs: NOW, seed: 'coverage-fair', maxItems: 3 });
  const second = buildNightlyQueue([...rows].reverse(), { nowMs: NOW, seed: 'coverage-fair', maxItems: 3 });

  assert.deepEqual(second, first);
  assert.deepEqual(new Set(first.map((item) => rows.find((row) => row.assetId === item.assetId).localDay)).size, 3);
  assert.equal(first.some((item) => item.assetId === 'day-a-best'), true);
  assert.equal(first.some((item) => item.assetId === 'day-a-other'), false);
});

test('a second item from a day must clear the standout floor', () => {
  const rows = [
    candidate('anchor', NOW - 10 * 86400000, 0.9, { localDay: '2026-07-08' }),
    candidate('merely-eligible', NOW - 10 * 86400000 + 60000, 0.3, { localDay: '2026-07-08', eventClusterKey: 'other' }),
  ];
  const queue = buildNightlyQueue(rows, { nowMs: NOW, seed: 'no-padding' });
  assert.deepEqual(queue.map((item) => item.assetId), ['anchor']);
});

test('persisted fingerprints suppress a 30-minute lookalike run but preserve a distinct standout', () => {
  const base = NOW - 20 * 86400000;
  const nearDuplicates = Array.from({ length: 14 }, (_, index) => candidate(
    `lookalike-${index}`,
    base + index * 60000,
    0.95 - index / 100,
    {
      localDay: '2026-06-28',
      eventClusterKey: `separate-time-window-${index}`,
      visualFingerprint: [1, 0, 0, 1],
    },
  ));
  const distinct = candidate('distinct-event', base + 20 * 60000, 0.9, {
    localDay: '2026-06-28',
    eventClusterKey: 'distinct-event',
    visualFingerprint: [0, 1, 1, 0],
  });
  const queue = buildNightlyQueue([...nearDuplicates, distinct], { nowMs: NOW, seed: 'fingerprints' });

  assert.equal(queue.filter((item) => item.assetId.startsWith('lookalike-')).length, 1);
  assert.equal(queue.some((item) => item.assetId === 'distinct-event'), true);
});

test('uncovered calendar days outrank already represented archive days', () => {
  const queue = buildNightlyQueue([
    candidate('covered-great', NOW - 5 * 86400000, 0.99, { coverageNeeded: false }),
    candidate('uncovered-strong', NOW - 6 * 86400000, 0.88, { coverageNeeded: true }),
    candidate('covered-other', NOW - 7 * 86400000, 0.86, { coverageNeeded: false }),
  ], { nowMs: NOW, seed: 'coverage', maxItems: 1 });

  assert.equal(queue[0].assetId, 'uncovered-strong');
});

test('weak media never pads a nightly queue', () => {
  const weak = Array.from({ length: 40 }, (_, index) => candidate(`weak-${index}`, NOW - index * 1000, NIGHTLY_QUEUE_QUALITY_FLOOR - 0.01));
  assert.deepEqual(buildNightlyQueue(weak, { nowMs: NOW }), []);

  const twoStrong = [candidate('strong-1', NOW, 0.9), candidate('strong-2', NOW - 86400000, 0.8, { eventClusterKey: 'other' })];
  assert.equal(buildNightlyQueue(twoStrong, { nowMs: NOW }).length, 2);
});

test('uncertain identity never enters the default lane merely because the photo is polished', () => {
  const uncertain = candidate('adult-only-false-positive', NOW, 0.99, {
    identityScore: NIGHTLY_QUEUE_IDENTITY_FLOOR - 0.01,
  });
  assert.equal(meetsNightlyQueueQuality(uncertain), false);
  assert.deepEqual(buildNightlyQueue([uncertain], { nowMs: NOW }), []);
});

test('tiny matched faces and blurry photos fail closed while strong measured photos remain eligible', () => {
  const adultOnlyTinyFace = candidate('adult-only-tiny-face', NOW, 1, {
    identityScore: 1,
    faceSizeRatio: 0.029,
    sharpness: 0.11,
  });
  const blurryChild = candidate('blurry-child', NOW - 1000, 1, {
    identityScore: 1,
    faceSizeRatio: 0.09,
    sharpness: 0.014,
  });
  const strongChild = candidate('strong-child', NOW - 2000, 1, {
    identityScore: 1,
    faceSizeRatio: 0.072,
    sharpness: 0.191,
  });

  assert.equal(meetsNightlyQueueQuality(adultOnlyTinyFace), false);
  assert.equal(meetsNightlyQueueQuality(blurryChild), false);
  assert.equal(meetsNightlyQueueQuality(strongChild), true);
  assert.deepEqual(
    buildNightlyQueue([adultOnlyTinyFace, blurryChild, strongChild], { nowMs: NOW }).map((item) => item.assetId),
    ['strong-child'],
  );
});

test('missing measured quality fails closed except for a narrow explicit parent pick', () => {
  const missingMetrics = candidate('missing-metrics', NOW, 1, {
    faceSizeRatio: null,
    sharpness: null,
  });
  const parentPick = {
    ...missingMetrics,
    assetId: 'parent-pick',
    selectionReasonCode: 'parent_pick',
    eventClusterKey: 'parent-pick',
  };

  assert.equal(meetsNightlyQueueQuality(missingMetrics), false);
  assert.equal(meetsNightlyQueueQuality(parentPick), true);
  assert.deepEqual(buildNightlyQueue([missingMetrics, parentPick], { nowMs: NOW }), [{
    assetId: 'parent-pick',
    position: 0,
    reasonCode: 'parent_pick',
    reasonLabel: 'Chosen by you',
  }]);
});

test('videos require measured frame quality and sustained matched presence unless parent-picked', () => {
  const strongVideo = candidate('strong-video', NOW, 0.9, {
    mediaType: 'video',
    durationSec: 12,
    videoPresenceRatio: 0.8,
  });
  const oneFrameOnly = candidate('one-frame-only', NOW - 1000, 0.9, {
    mediaType: 'video',
    durationSec: 12,
    videoPresenceRatio: null,
  });
  const tinyVideoFace = candidate('tiny-video-face', NOW - 2000, 0.9, {
    mediaType: 'video',
    durationSec: 12,
    videoPresenceRatio: 0.8,
    faceSizeRatio: NIGHTLY_QUEUE_FACE_SIZE_RATIO_FLOOR - 0.001,
  });

  assert.equal(meetsNightlyQueueQuality(strongVideo), true);
  assert.equal(meetsNightlyQueueQuality(oneFrameOnly), false);
  assert.equal(meetsNightlyQueueQuality(tinyVideoFace), false);
});

test('default lane floors stay between measured negatives and strong synthetic child fixtures', () => {
  assert.ok(NIGHTLY_QUEUE_FACE_SIZE_RATIO_FLOOR > 0.029);
  assert.ok(NIGHTLY_QUEUE_FACE_SIZE_RATIO_FLOOR < 0.072);
  assert.ok(NIGHTLY_QUEUE_SHARPNESS_FLOOR > 0.014);
  assert.ok(NIGHTLY_QUEUE_SHARPNESS_FLOOR < 0.191);
});

test('stale default enrichment cannot preserve a candidate below the current quality floor', () => {
  const stale = {
    ...candidate('adult-only-false-positive', NOW, 0.99, {
      identityScore: NIGHTLY_QUEUE_IDENTITY_FLOOR - 0.01,
    }),
    reasonCode: 'best_day',
    commitState: 'idle',
    draftText: '',
    parentInteracted: false,
    enrichmentStates: ['idle', 'idle', 'idle', 'idle', 'idle'],
  };
  assert.equal(shouldWithdrawStaleNightlyItem(stale), true);
  assert.equal(shouldWithdrawStaleNightlyItem({ ...stale, parentInteracted: true }), false);
  assert.equal(shouldWithdrawStaleNightlyItem({ ...stale, commitState: 'failed' }), false);
});

test('final, shown, unavailable and superseded candidates never reappear', () => {
  const states = ['kept', 'skipped', 'rejected', 'shown', 'unavailable', 'superseded'];
  const rows = states.map((state, index) => candidate(state, NOW - index * 1000, 0.9, {
    lifecycleState: state,
    availability: state === 'unavailable' ? 'unavailable' : 'available',
    eventClusterKey: `state-${index}`,
  }));
  rows.push(candidate('eligible', NOW - 10000, 0.9, { eventClusterKey: 'eligible' }));
  const queue = buildNightlyQueue(rows, { nowMs: NOW });
  assert.deepEqual(queue.map((item) => item.assetId), ['eligible']);
});

test('reason copy is fixed and parent readable', () => {
  assert.equal(parentReasonLabel('best_day'), 'A clear photo from this day');
  assert.equal(parentReasonLabel('clear_video'), 'A clear video from this day');
  assert.doesNotMatch(parentReasonLabel('best_day'), /score|confidence|model|embedding/i);
});

function fixtureCandidates(count) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const dayOffset = index % 365;
    const captureTimeMs = NOW - dayOffset * 86400000 - (index % 12) * 60000;
    const mediaType = index % 113 === 0 ? 'video' : 'image';
    rows.push(candidate(`fixture-${index}`, captureTimeMs, 0.3 + ((index % 60) / 100), {
      localDay: new Date(captureTimeMs).toISOString().slice(0, 10),
      mediaType,
      durationSec: mediaType === 'video' ? 12 : null,
      videoPresenceRatio: mediaType === 'video' ? 0.8 : null,
      eventClusterKey: `event-${dayOffset}-${index % 5}`,
      clusterMemberCount: index % 7 === 0 ? 14 : 1,
    }));
  }
  return rows;
}

function candidate(assetId, captureTimeMs, captureQuality, patch = {}) {
  return {
    assetId,
    mediaType: 'image',
    availability: 'available',
    lifecycleState: 'eligible',
    captureTimeMs,
    localDay: new Date(captureTimeMs).toISOString().slice(0, 10),
    identityScore: 0.95,
    captureQuality,
    faceSizeRatio: 0.12,
    sharpness: 0.3,
    durationSec: null,
    videoPresenceRatio: null,
    eventClusterKey: `cluster-${assetId}`,
    clusterMemberCount: 1,
    ...patch,
  };
}

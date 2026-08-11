import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collapseAnalyzedMediaCandidates,
  collapseScoredMediaCandidates,
  completelyAnalyzedMediaCandidates,
} from '../../src/scanMediaMatchModel.js';

test('video scanning keeps its strongest sampled frame and across-video evidence', () => {
  const candidates = [0, 1, 2].map((index) => ({
    assetId: `video#${index}`,
    sourceAssetId: 'video',
    mediaType: 'video',
    frameTimeMs: index * 1000,
    creationTime: 10,
    localUri: `frame-${index}.jpg`,
    duration: 10000,
  }));
  const result = collapseScoredMediaCandidates({
    candidates,
    scored: [
      { assetId: 'video#0', score: 0.61, captureQuality: 0.9 },
      {
        assetId: 'video#1',
        score: 0.94,
        captureQuality: 0.7,
        featureVector: [1],
        visualFingerprint: [1, -1],
      },
      { assetId: 'video#2', score: 0.82, captureQuality: 0.8 },
    ],
    cutoff: 0.65,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].candidateId, 'video#1');
  assert.equal(result[0].videoSampledFrames, 3);
  assert.equal(result[0].videoMatchedFrames, 2);
  assert.equal(result[0].videoPresenceRatio, 2 / 3);
  assert.deepEqual(result[0].visualFingerprint, [1, -1]);
});

test('completed adult-only, weak, and no-face analysis rows stay durable but out of the passing lane', () => {
  const candidates = ['child', 'adult', 'no-face'].map((assetId, index) => ({
    assetId,
    sourceAssetId: assetId,
    mediaType: 'image',
    creationTime: 100 - index,
    localUri: `file:///private/${assetId}.jpg`,
  }));
  const scored = [
    { assetId: 'child', score: 0.94, captureQuality: 0.91 },
    { assetId: 'adult', score: 0.18, captureQuality: 0.88 },
  ];
  const analysis = collapseAnalyzedMediaCandidates({
    candidates,
    scored,
    processedAssetIds: ['child', 'adult', 'no-face'],
  });
  const passing = collapseScoredMediaCandidates({ candidates, scored, cutoff: 0.68 });

  assert.deepEqual(analysis.map((row) => row.assetId), ['child', 'adult', 'no-face']);
  assert.equal(analysis.find((row) => row.assetId === 'no-face')?.score, null);
  assert.deepEqual(passing.map((row) => row.assetId), ['child']);
});

test('a partially processed video source is neither cached nor surfaced', () => {
  const candidates = [0, 1, 2].map((index) => ({
    assetId: `video#${index}`,
    sourceAssetId: 'video',
    mediaType: 'video',
    frameTimeMs: index * 1000,
    creationTime: 10,
    localUri: `frame-${index}.jpg`,
  }));
  const scored = [{ assetId: 'video#0', score: 0.96, captureQuality: 0.9 }];

  assert.deepEqual(collapseAnalyzedMediaCandidates({
    candidates,
    scored,
    processedAssetIds: ['video#0'],
  }), []);
  assert.deepEqual(collapseScoredMediaCandidates({
    candidates: completelyAnalyzedMediaCandidates(candidates, ['video#0']),
    scored,
    cutoff: 0.65,
  }), []);

  const complete = collapseAnalyzedMediaCandidates({
    candidates,
    scored,
    processedAssetIds: candidates.map((candidate) => candidate.assetId),
  });
  assert.equal(complete.length, 1);
  assert.equal(complete[0].assetId, 'video');
  assert.equal(complete[0].videoSampledFrames, 3);
});

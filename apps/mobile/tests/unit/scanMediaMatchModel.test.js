import assert from 'node:assert/strict';
import test from 'node:test';

import { collapseScoredMediaCandidates } from '../../src/scanMediaMatchModel.js';

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

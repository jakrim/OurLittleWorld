import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mediaUploadMetadata } from '../../src/mediaUploadMetadataModel.js';

test('only non-identity quality rides along after parent Keep', () => {
  assert.deepEqual(
    mediaUploadMetadata(
      { source: 'library-review', fullPath: 'f/full/x.jpg' },
      { captureQuality: 0.82, score: 0.91, faceCount: 1 },
    ),
    {
      source: 'library-review',
      fullPath: 'f/full/x.jpg',
      captureQuality: 0.82,
    },
  );
});

test('missing or junk signals are omitted, not written as null', () => {
  assert.deepEqual(
    mediaUploadMetadata({ source: 'manual' }, { captureQuality: null, score: 'junk' }),
    { source: 'manual' },
  );
  assert.deepEqual(mediaUploadMetadata({ source: 'manual' }, null), { source: 'manual' });
  assert.deepEqual(mediaUploadMetadata(), {});
});

test('private identity, curation, and camera-roll evidence is stripped', () => {
  assert.deepEqual(
    mediaUploadMetadata({
      source: 'daily-curation',
      localAssetId: 'PH-PRIVATE/L0/001',
      pickerAssetId: 'PH-PRIVATE/L0/002',
      recognitionCandidateId: 'PH-PRIVATE/L0/003',
      identityEvidence: [0.1, 0.2],
      visualFingerprint: 'private-fingerprint',
      recognitionFrameTimeMs: 4200,
    }, {
      score: 0.99,
      faceCount: 1,
      videoPresenceRatio: 2 / 3,
      videoSampledFrames: 3,
      videoMatchedFrames: 2,
      curation: {
        dayKey: '2026-07-16',
        role: 'standout-video',
        reason: 'baby-present-across-video',
      },
    }),
    {
      source: 'daily-curation',
    },
  );
});

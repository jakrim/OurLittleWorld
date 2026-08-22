import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyPosterErrorCode, mediaUploadMetadata } from '../../src/mediaUploadMetadataModel.js';

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

test('unknown metadata fails closed while allowlisted media facts survive', () => {
  assert.deepEqual(
    mediaUploadMetadata({
      source: 'daily-curation',
      fullPath: 'family/full/image.jpg',
      posterErrorCode: 'decode_failed',
      localAssetId: 'PH-PRIVATE/L0/001',
      pickerAssetId: 'PH-PRIVATE/L0/002',
      recognitionCandidateId: 'PH-PRIVATE/L0/003',
      recognitionFrameTimeMs: 1200,
      identityEvidence: [0.1, 0.2],
      visualFingerprint: 'private-fingerprint',
      futureSensitiveField: 'must-not-cross-keep',
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
      fullPath: 'family/full/image.jpg',
      posterErrorCode: 'decode_failed',
    },
  );
});

test('poster failures become stable provider-safe codes', () => {
  assert.equal(classifyPosterErrorCode(new Error('Timed out while reading video')), 'timeout');
  assert.equal(classifyPosterErrorCode('Permission denied'), 'permission');
  assert.equal(classifyPosterErrorCode('File not found at /private/device/path.mov'), 'not_found');
  assert.equal(classifyPosterErrorCode('Decoder failed on corrupt data'), 'decode_failed');
  assert.equal(classifyPosterErrorCode('Network connection lost'), 'network');
  assert.equal(classifyPosterErrorCode('Storage quota exceeded'), 'storage');
  assert.equal(classifyPosterErrorCode('Unexpected provider detail'), 'unknown');
});
